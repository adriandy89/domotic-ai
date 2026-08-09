import type { SessionUser } from '@app/models';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUserInfo } from '../auth/decorators';
import { AuthenticatedGuard } from '../auth/guards';
import {
  CreateAlexaClientDto,
  UpdateAlexaClientDto,
} from './dto/alexa-client.dto';
import { AlexaOAuthClientService } from './oauth/alexa-oauth-client.service';
import { AlexaOAuthService } from './oauth/alexa-oauth.service';

/**
 * Settings-card backend. The org's single OAuth client (= its Alexa skill) is
 * managed by the org admin (User.is_org_admin); any member can see their own
 * link state and unlink.
 */
@ApiTags('Integrations')
@Controller('users/me/integrations/alexa')
@UseGuards(AuthenticatedGuard)
export class AlexaIntegrationController {
  constructor(
    private readonly clients: AlexaOAuthClientService,
    private readonly oauth: AlexaOAuthService,
  ) {}

  @Get()
  async status(@GetUserInfo() user: SessionUser) {
    const [client, link] = await Promise.all([
      this.clients.getForOrg(user.organization_id),
      this.oauth.linkStatus(user.id),
    ]);
    return {
      client, // null until the org admin provisions it (secret never included)
      linked: link.linked,
      last_linked_at: link.last_linked_at,
      is_org_admin: user.is_org_admin,
    };
  }

  @Post('client')
  createClient(
    @GetUserInfo() user: SessionUser,
    @Body() dto: CreateAlexaClientDto,
  ) {
    this.assertOrgAdmin(user);
    return this.clients.create(user.organization_id, dto.name, dto.redirect_uris);
  }

  @Patch('client')
  updateClient(
    @GetUserInfo() user: SessionUser,
    @Body() dto: UpdateAlexaClientDto,
  ) {
    this.assertOrgAdmin(user);
    return this.clients.update(user.organization_id, dto);
  }

  @Post('client/rotate-secret')
  rotateSecret(@GetUserInfo() user: SessionUser) {
    this.assertOrgAdmin(user);
    return this.clients.rotateSecret(user.organization_id);
  }

  @Delete('client')
  async deleteClient(@GetUserInfo() user: SessionUser) {
    this.assertOrgAdmin(user);
    await this.clients.delete(user.organization_id);
    return { ok: true };
  }

  /** Unlink the CURRENT user's Alexa account (revokes their tokens only). */
  @Delete('link')
  async unlink(@GetUserInfo() user: SessionUser) {
    await this.oauth.revokeAllForUser(user.id);
    return { ok: true };
  }

  private assertOrgAdmin(user: SessionUser) {
    if (!user.is_org_admin) {
      throw new ForbiddenException(
        'Only the organization admin can manage the Alexa integration',
      );
    }
  }
}
