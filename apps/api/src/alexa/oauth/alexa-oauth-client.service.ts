import { DbService } from '@app/db';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';

// Alexa account-linking redirect hosts. The org admin copies the exact URLs
// (which include the vendor id) from the skill's Account Linking page.
const ALLOWED_REDIRECT_HOSTS = [
  'layla.amazon.com',
  'pitangui.amazon.com',
  'alexa.amazon.co.jp',
];

const PUBLIC_SELECT = {
  id: true,
  client_id: true,
  name: true,
  redirect_uris: true,
  disabled: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class AlexaOAuthClientService {
  private readonly logger = new Logger(AlexaOAuthClientService.name);

  constructor(private readonly db: DbService) {}

  getForOrg(organizationId: string) {
    return this.db.alexaOAuthClient.findUnique({
      where: { organization_id: organizationId },
      select: PUBLIC_SELECT,
    });
  }

  findByClientId(clientId: string) {
    return this.db.alexaOAuthClient.findUnique({
      where: { client_id: clientId },
    });
  }

  /** Creates the org's single OAuth client. The secret is returned once. */
  async create(organizationId: string, name: string, redirectUris: string[]) {
    const existing = await this.db.alexaOAuthClient.findUnique({
      where: { organization_id: organizationId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This organization already has an Alexa integration',
      );
    }
    this.assertRedirectUris(redirectUris);

    const client_id = 'alexa_' + crypto.randomBytes(16).toString('base64url');
    const secret = 'alexasec_' + crypto.randomBytes(32).toString('base64url');
    const client_secret_hash = sha256(secret);

    const record = await this.db.alexaOAuthClient.create({
      data: {
        organization_id: organizationId,
        client_id,
        client_secret_hash,
        name,
        redirect_uris: redirectUris,
      },
      select: PUBLIC_SELECT,
    });
    this.logger.log(
      `alexa oauth client created org=${organizationId} client_id=${client_id}`,
    );
    return { client_secret: secret, record };
  }

  async update(
    organizationId: string,
    data: { redirect_uris?: string[]; disabled?: boolean },
  ) {
    if (data.redirect_uris) this.assertRedirectUris(data.redirect_uris);
    const client = await this.requireForOrg(organizationId);
    return this.db.alexaOAuthClient.update({
      where: { id: client.id },
      data,
      select: PUBLIC_SELECT,
    });
  }

  /** Replaces the client secret. The new secret is returned once. */
  async rotateSecret(organizationId: string) {
    const client = await this.requireForOrg(organizationId);
    const secret = 'alexasec_' + crypto.randomBytes(32).toString('base64url');
    const record = await this.db.alexaOAuthClient.update({
      where: { id: client.id },
      data: { client_secret_hash: sha256(secret) },
      select: PUBLIC_SELECT,
    });
    this.logger.log(`alexa oauth client secret rotated org=${organizationId}`);
    return { client_secret: secret, record };
  }

  /** Deletes the client and every token issued through it. */
  async delete(organizationId: string) {
    const client = await this.requireForOrg(organizationId);
    await this.db.$transaction([
      this.db.alexaAuthCode.deleteMany({
        where: { client_id: client.client_id },
      }),
      this.db.alexaAccessToken.deleteMany({
        where: { client_id: client.client_id },
      }),
      this.db.alexaRefreshToken.deleteMany({
        where: { client_id: client.client_id },
      }),
      this.db.alexaOAuthClient.delete({ where: { id: client.id } }),
    ]);
    this.logger.log(`alexa oauth client deleted org=${organizationId}`);
  }

  /** Timing-safe client credential check; null when invalid. */
  async validateClient(clientId: string, clientSecret: string) {
    if (!clientId || !clientSecret) return null;
    const client = await this.findByClientId(clientId);
    if (!client || client.disabled) return null;
    const given = Buffer.from(sha256(clientSecret), 'hex');
    const stored = Buffer.from(client.client_secret_hash, 'hex');
    if (given.length !== stored.length) return null;
    if (!crypto.timingSafeEqual(given, stored)) return null;
    return client;
  }

  private async requireForOrg(organizationId: string) {
    const client = await this.db.alexaOAuthClient.findUnique({
      where: { organization_id: organizationId },
    });
    if (!client) {
      throw new NotFoundException('Alexa integration not configured');
    }
    return client;
  }

  private assertRedirectUris(uris: string[]) {
    for (const uri of uris) {
      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        throw new BadRequestException(`Invalid redirect URI: ${uri}`);
      }
      if (
        parsed.protocol !== 'https:' ||
        !ALLOWED_REDIRECT_HOSTS.includes(parsed.hostname)
      ) {
        throw new BadRequestException(
          `Redirect URI not allowed (expected https on ${ALLOWED_REDIRECT_HOSTS.join(', ')}): ${uri}`,
        );
      }
    }
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
