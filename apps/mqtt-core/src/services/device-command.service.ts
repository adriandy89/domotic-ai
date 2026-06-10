import { DbService } from '@app/db';
import { DeviceProtocol, getAdapter } from '@app/models';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { MqttClient } from 'mqtt';
import { PublishCommandResult } from '../mqtt-core.types';

const SAFE_DEVICE_ID_REGEX = /^[a-zA-Z0-9_\-:.]+$/;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 2;
const RATE_LIMIT_SWEEP_MS = 30_000;

/**
 * Outgoing device commands: validation/normalization via the protocol
 * adapter, per-device rate limiting, MQTT publishing, and the
 * command_executions audit trail.
 */
@Injectable()
export class DeviceCommandService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceCommandService.name);
  private readonly commandTimestamps = new Map<string, number[]>();
  private rateLimitSweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly dbService: DbService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: MqttClient,
  ) {}

  onModuleInit() {
    this.rateLimitSweepTimer = setInterval(
      () => this.sweepRateLimitMap(),
      RATE_LIMIT_SWEEP_MS,
    );
    this.rateLimitSweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.rateLimitSweepTimer) clearInterval(this.rateLimitSweepTimer);
  }

  private sweepRateLimitMap() {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [key, ts] of this.commandTimestamps.entries()) {
      const fresh = ts.filter((t) => t > cutoff);
      if (fresh.length === 0) this.commandTimestamps.delete(key);
      else this.commandTimestamps.set(key, fresh);
    }
  }

  async publishCommand(payload: {
    homeUniqueId: string;
    deviceUniqueId: string;
    organizationId: string;
    command: Record<string, unknown>;
    /** Origin of the command — used for the audit trail. */
    source?: 'api' | 'ai' | 'rule' | 'schedule';
    /** Optional originating user id for the audit trail. */
    userId?: string;
  }): Promise<PublishCommandResult> {
    const {
      homeUniqueId,
      deviceUniqueId,
      organizationId,
      command,
      source = 'api',
      userId,
    } = payload;

    if (
      !SAFE_DEVICE_ID_REGEX.test(deviceUniqueId) ||
      !SAFE_DEVICE_ID_REGEX.test(homeUniqueId)
    ) {
      return {
        ok: false,
        code: 'INVALID_DEVICE_ID',
        error:
          'home or device unique_id contains characters not allowed in MQTT topics',
      };
    }

    if (
      !command ||
      typeof command !== 'object' ||
      Object.keys(command).length === 0
    ) {
      return {
        ok: false,
        code: 'INVALID_COMMAND',
        error: 'command must be a non-empty object',
      };
    }

    const device = await this.dbService.device.findUnique({
      where: {
        unique_id_organization_id: {
          organization_id: organizationId,
          unique_id: deviceUniqueId,
        },
      },
      select: {
        id: true,
        disabled: true,
        protocol: true,
        attributes: true,
        home: { select: { unique_id: true } },
      },
    });

    if (!device || device.home?.unique_id !== homeUniqueId) {
      return {
        ok: false,
        code: 'DEVICE_NOT_FOUND',
        error: 'device not found in this home/organization',
      };
    }
    if (device.disabled) {
      return {
        ok: false,
        code: 'DEVICE_DISABLED',
        error: 'device is disabled',
      };
    }

    const adapter = getAdapter(device.protocol);
    const actions = adapter.getAvailableActions(device.attributes);
    const { command: normalized } = adapter.normalizeCommand(command, actions);

    if (actions.length > 0) {
      const validation = adapter.validateCommand(normalized, actions);
      if (!validation.valid) {
        const result: PublishCommandResult = {
          ok: false,
          code: 'INVALID_COMMAND',
          error: 'command does not match device capabilities',
          validationErrors: validation.errors,
        };
        await this.recordCommandExecution({
          deviceId: device.id,
          userId,
          source,
          command,
          result,
        });
        return result;
      }
    }

    const limitKey = `${homeUniqueId}:${deviceUniqueId}`;
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const fresh = (this.commandTimestamps.get(limitKey) ?? []).filter(
      (t) => t > cutoff,
    );
    if (fresh.length >= RATE_LIMIT_MAX_PER_WINDOW) {
      const oldest = fresh[0];
      const result: PublishCommandResult = {
        ok: false,
        code: 'RATE_LIMITED',
        error: `Max ${RATE_LIMIT_MAX_PER_WINDOW} commands per second per device`,
        retryAfterMs: Math.max(0, oldest + RATE_LIMIT_WINDOW_MS - now),
      };
      await this.recordCommandExecution({
        deviceId: device.id,
        userId,
        source,
        command,
        result,
      });
      return result;
    }
    fresh.push(now);
    this.commandTimestamps.set(limitKey, fresh);

    const messages = adapter.buildCommandMessages(
      {
        homeUniqueId,
        deviceUniqueId,
        protocol: device.protocol as DeviceProtocol,
        attributes: device.attributes,
      },
      normalized,
    );

    if (messages.length === 0) {
      const result: PublishCommandResult = {
        ok: false,
        code: 'INVALID_COMMAND',
        error: 'command did not map to any device action',
      };
      await this.recordCommandExecution({
        deviceId: device.id,
        userId,
        source,
        command,
        result,
      });
      return result;
    }

    const publishResult = await this.publishAll(messages);

    await this.recordCommandExecution({
      deviceId: device.id,
      userId,
      source,
      command,
      result: publishResult,
    });
    return publishResult;
  }

  /** Publish every command message; fails fast on the first broker error. */
  private async publishAll(
    messages: { topic: string; payload: string }[],
  ): Promise<PublishCommandResult> {
    for (const msg of messages) {
      const result = await new Promise<PublishCommandResult>((resolve) => {
        this.mqttClient.publish(msg.topic, msg.payload, { qos: 1 }, (err) => {
          if (err) {
            this.logger.error(
              `MQTT publish failed for ${msg.topic}: ${err.message}`,
            );
            resolve({ ok: false, code: 'PUBLISH_FAILED', error: err.message });
            return;
          }
          resolve({ ok: true });
        });
      });
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  /**
   * Best-effort: record a command execution for the audit log. Never throws —
   * the audit is observability, not a hard dependency of the user's request.
   */
  private async recordCommandExecution(input: {
    deviceId: string;
    userId?: string;
    source: 'api' | 'ai' | 'rule' | 'schedule';
    command: Record<string, unknown>;
    result: PublishCommandResult;
  }): Promise<void> {
    try {
      await this.dbService.commandExecution.create({
        data: {
          device_id: input.deviceId,
          user_id: input.userId ?? null,
          source: input.source,
          command: input.command as Prisma.InputJsonValue,
          ok: input.result.ok,
          code: input.result.code ?? null,
          error: input.result.error ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `command_executions insert failed: ${(err as Error).message}`,
      );
    }
  }
}
