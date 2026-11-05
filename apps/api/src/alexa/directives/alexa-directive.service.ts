import { executeOneCommand } from '@app/ai-tools';
import { aesGcmEncrypt, loadEncryptionKey } from '@app/crypto';
import { DbService } from '@app/db';
import { getAdapter } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import type { AlexaAuthContext } from '../alexa-token.service';
import {
  acceptGrantErrorResponse,
  acceptGrantResponse,
  alexaResponse,
  discoverResponse,
  errorResponse,
  stateReport,
} from '../mapping/alexa-response';
import { projectProperties } from '../mapping/alexa-state';
import {
  decodeEndpointId,
  encodeEndpointId,
  type AlexaDirective,
  type AlexaDiscoveryEndpoint,
} from '../mapping/alexa.types';
import {
  mapCapabilities,
  sceneCapabilities,
  type CapabilityMapping,
} from '../mapping/capability-mapper';
import { directiveToCommand } from '../mapping/directive-to-command';

/** Alexa's endpoint budget is ~8s; every handler answers synchronously. */
@Injectable()
export class AlexaDirectiveService {
  private readonly logger = new Logger(AlexaDirectiveService.name);
  private readonly encryptionKey = loadEncryptionKey();

  constructor(
    private readonly db: DbService,
    private readonly nats: NatsClientService,
  ) {}

  async handle(body: AlexaDirective, ctx: AlexaAuthContext) {
    const header = body?.directive?.header;
    if (!header?.namespace || !header?.name) {
      return errorResponse(null, 'INVALID_DIRECTIVE', 'Malformed directive');
    }
    try {
      switch (header.namespace) {
        case 'Alexa.Discovery':
          return await this.discover(ctx);
        case 'Alexa.Authorization':
          return await this.acceptGrant(body, ctx);
        case 'Alexa.SceneController':
          return await this.activateScene(body, ctx);
        case 'Alexa':
          if (header.name === 'ReportState') {
            return await this.reportState(body, ctx);
          }
          return errorResponse(
            body,
            'INVALID_DIRECTIVE',
            `Unsupported directive Alexa.${header.name}`,
          );
        default:
          return await this.control(body, ctx);
      }
    } catch (err) {
      this.logger.error(
        `alexa directive failed ${header.namespace}.${header.name}: ${(err as Error).message}`,
      );
      if (header.namespace === 'Alexa.Authorization') {
        return acceptGrantErrorResponse('Unexpected error');
      }
      return errorResponse(body, 'INTERNAL_ERROR', 'Unexpected error');
    }
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  private async discover(ctx: AlexaAuthContext) {
    const devices = await this.db.device.findMany({
      where: this.deviceScope(ctx),
      select: {
        id: true,
        name: true,
        model: true,
        protocol: true,
        attributes: true,
        description: true,
      },
    });

    const endpoints: AlexaDiscoveryEndpoint[] = [];
    for (const device of devices) {
      const mapping = this.mapDevice(device.protocol, device.attributes);
      if (!mapping) continue;
      endpoints.push({
        endpointId: encodeEndpointId({ kind: 'device', id: device.id }),
        manufacturerName: 'Domotic-AI',
        friendlyName: friendlyName(device.name),
        // Alexa caps description at 128 chars (Device.description allows 512).
        description: (
          device.description ?? `${device.model ?? 'Device'} via Domotic-AI`
        ).slice(0, 128),
        displayCategories: mapping.displayCategories,
        capabilities: mapping.capabilities,
      });
    }

    // Each learned IR code is its own scene ("Alexa, turn on <device> <code>").
    const learned = await this.db.deviceLearnedCommands.findMany({
      where: { device: this.deviceScope(ctx) },
      select: { id: true, name: true, device: { select: { name: true } } },
    });
    for (const cmd of learned) {
      endpoints.push({
        endpointId: encodeEndpointId({ kind: 'ir', id: cmd.id }),
        manufacturerName: 'Domotic-AI',
        friendlyName: friendlyName(`${cmd.device.name} ${cmd.name}`),
        description: `Learned IR command via Domotic-AI`,
        displayCategories: ['SCENE_TRIGGER'],
        capabilities: sceneCapabilities(),
      });
    }

    this.logger.log(
      `alexa discovery user=${ctx.userId} endpoints=${endpoints.length}`,
    );
    return discoverResponse(endpoints);
  }

  // ── Control (Power/Brightness/Color/ColorTemperature/Thermostat/Lock) ─────

  private async control(body: AlexaDirective, ctx: AlexaAuthContext) {
    const { header, payload } = body.directive;
    const loaded = await this.loadEndpointDevice(body, ctx);
    if ('error' in loaded) return loaded.error;
    const { device, mapping, currentData } = loaded;

    if (device.online === false) {
      return errorResponse(
        body,
        'ENDPOINT_UNREACHABLE',
        `${device.name} is offline`,
      );
    }

    const converted = directiveToCommand({
      namespace: header.namespace,
      name: header.name,
      payload: payload ?? {},
      features: mapping.features,
      currentData,
    });
    if (!converted.ok) {
      return errorResponse(body, converted.errorType, converted.message);
    }

    const result = await executeOneCommand(
      {
        dbService: this.db,
        natsClient: this.nats,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        source: 'alexa',
      },
      device.id,
      converted.command,
    );
    if (!result.success) {
      return errorResponse(
        body,
        result.code === 'RATE_LIMITED'
          ? 'RATE_LIMIT_EXCEEDED'
          : result.validationErrors
            ? 'INVALID_VALUE'
            : 'ENDPOINT_UNREACHABLE',
        result.error ?? 'Command failed',
      );
    }

    // Echo the COMMANDED state (QoS1 publish returns before the device acks):
    // merge what we sent over the last report and re-project.
    const echoed: Record<string, unknown> = {
      ...currentData,
      ...(result.commandSent ?? converted.command),
    };
    if (
      header.namespace === 'Alexa.ColorController' &&
      mapping.features.color
    ) {
      echoed[mapping.features.color.property] = payload?.color;
    }
    const properties = projectProperties(
      mapping.features,
      echoed,
      device.online ?? true,
    );
    return alexaResponse(body, properties);
  }

  // ── ReportState ────────────────────────────────────────────────────────────

  private async reportState(body: AlexaDirective, ctx: AlexaAuthContext) {
    const loaded = await this.loadEndpointDevice(body, ctx);
    if ('error' in loaded) return loaded.error;
    const { device, mapping, currentData } = loaded;
    const properties = projectProperties(
      mapping.features,
      currentData,
      device.online ?? true,
    );
    return stateReport(body, properties);
  }

  // ── SceneController (learned IR commands) ──────────────────────────────────

  private async activateScene(body: AlexaDirective, ctx: AlexaAuthContext) {
    if (body.directive.header.name !== 'Activate') {
      return errorResponse(
        body,
        'INVALID_DIRECTIVE',
        'IR scenes only support Activate',
      );
    }
    const ref = decodeEndpointId(body.directive.endpoint?.endpointId ?? '');
    if (!ref || ref.kind !== 'ir') {
      return errorResponse(body, 'NO_SUCH_ENDPOINT', 'Unknown scene endpoint');
    }
    const learned = await this.db.deviceLearnedCommands.findFirst({
      where: { id: ref.id, device: this.deviceScope(ctx) },
      select: { command: true, device_id: true },
    });
    if (!learned) {
      return errorResponse(body, 'NO_SUCH_ENDPOINT', 'Unknown scene endpoint');
    }
    const result = await executeOneCommand(
      {
        dbService: this.db,
        natsClient: this.nats,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        source: 'alexa',
      },
      learned.device_id,
      { ir_code_to_send: learned.command },
    );
    if (!result.success) {
      return errorResponse(
        body,
        result.code === 'RATE_LIMITED'
          ? 'RATE_LIMIT_EXCEEDED'
          : 'ENDPOINT_UNREACHABLE',
        result.error ?? 'IR command failed',
      );
    }
    return {
      event: {
        header: {
          namespace: 'Alexa.SceneController',
          name: 'ActivationStarted',
          payloadVersion: '3',
          messageId: crypto.randomUUID(),
          ...(body.directive.header.correlationToken && {
            correlationToken: body.directive.header.correlationToken,
          }),
        },
        endpoint: { endpointId: body.directive.endpoint!.endpointId },
        payload: {
          cause: { type: 'VOICE_INTERACTION' },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  // ── Alexa.Authorization/AcceptGrant (v2 proactive-reporting seam) ──────────

  private async acceptGrant(body: AlexaDirective, ctx: AlexaAuthContext) {
    const code = body.directive.payload?.grant?.code;
    if (typeof code !== 'string' || !code) {
      return acceptGrantErrorResponse('Missing grant code');
    }
    await this.db.alexaEventGrant.upsert({
      where: { user_id: ctx.userId },
      create: {
        user_id: ctx.userId,
        grant_code_encrypted: aesGcmEncrypt(code, this.encryptionKey),
      },
      update: { grant_code_encrypted: aesGcmEncrypt(code, this.encryptionKey) },
    });
    this.logger.log(`alexa grant stored user=${ctx.userId}`);
    return acceptGrantResponse();
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  /** Org AND UserHome scoping: only devices in homes the linked user belongs to. */
  private deviceScope(ctx: AlexaAuthContext) {
    return {
      organization_id: ctx.organizationId,
      disabled: false,
      home: { users: { some: { user_id: ctx.userId } } },
    };
  }

  private async loadEndpointDevice(
    body: AlexaDirective,
    ctx: AlexaAuthContext,
  ) {
    const ref = decodeEndpointId(body.directive.endpoint?.endpointId ?? '');
    if (!ref || ref.kind !== 'device') {
      return {
        error: errorResponse(body, 'NO_SUCH_ENDPOINT', 'Unknown endpoint'),
      };
    }
    const device = await this.db.device.findFirst({
      where: { id: ref.id, ...this.deviceScope(ctx) },
      select: {
        id: true,
        name: true,
        protocol: true,
        attributes: true,
        online: true,
        sensorDataLasts: { select: { data: true }, take: 1 },
      },
    });
    if (!device) {
      return {
        error: errorResponse(body, 'NO_SUCH_ENDPOINT', 'Unknown endpoint'),
      };
    }
    const mapping = this.mapDevice(device.protocol, device.attributes);
    if (!mapping) {
      return {
        error: errorResponse(
          body,
          'INVALID_DIRECTIVE',
          'Endpoint has no Alexa-controllable capabilities',
        ),
      };
    }
    const currentData =
      (device.sensorDataLasts[0]?.data as Record<string, unknown>) ?? {};
    return { device, mapping, currentData };
  }

  private mapDevice(
    protocol: string,
    attributes: unknown,
  ): CapabilityMapping | null {
    try {
      const adapter = getAdapter(protocol);
      return mapCapabilities(
        adapter.getAvailableActions(attributes),
        adapter.getReadableAttributes(attributes),
      );
    } catch {
      return null; // unknown protocol → not exposed to Alexa
    }
  }
}

/** Alexa friendlyName: strip characters outside letters/digits/space, max 128. */
function friendlyName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 128);
  return cleaned || 'Device';
}
