import { DbService } from '@app/db';
import {
  getAvailableActions,
  getExposesFromAttributes,
  normalizeCommand,
  validateCommand,
} from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

export const sendDeviceCommandTool = createTool({
  id: 'send-device-command',
  description:
    'Send a command to a smart home device. The command is validated against the device capabilities (from get-device-full-info) before publishing. If validation fails, the tool returns success=false with errors — do NOT retry the same value, ask the user to clarify or read the constraints again.',
  inputSchema: z.object({
    deviceId: z.string().describe('The device database UUID'),
    command: z
      .record(z.any())
      .describe(
        'Property-value pairs that match availableActions from get-device-full-info. ' +
          'Examples: { "state": "ON" }, { "brightness": 127 } (range 0-254), { "color_temp": 250 } (mireds, ~150-500), { "color": { "hex": "#FF0000" } }. ' +
          'Numeric values must respect valueMin/valueMax. Enum values must be in the values[] list.',
      ),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const natsClient: NatsClientService | undefined =
      context?.requestContext?.get('natsClient');
    const organizationId: string | undefined =
      context?.requestContext?.get('organizationId');
    const { deviceId, command } = inputData;

    if (!userId)
      throw new Error('User ID is required for device command operations');
    if (!dbService) throw new Error('Database service not available');
    if (!natsClient) throw new Error('NATS client not available');
    if (!organizationId) throw new Error('Organization ID is required');

    try {
      const device = await dbService.device.findUnique({
        where: {
          id: deviceId,
          organization_id: organizationId,
          disabled: false,
        },
        select: {
          id: true,
          unique_id: true,
          name: true,
          attributes: true,
          home: { select: { unique_id: true } },
        },
      });

      if (!device) {
        return { success: false, error: 'Device not found or disabled' };
      }
      if (!device.home) {
        return { success: false, error: 'Device is not assigned to a home' };
      }

      const exposes = getExposesFromAttributes(device.attributes);
      const actions = getAvailableActions(exposes);

      if (actions.length === 0) {
        return {
          success: false,
          error: 'Device has no controllable actions (no writable exposes).',
        };
      }

      const { command: normalized, warnings } = normalizeCommand(
        command,
        actions,
      );
      const validation = validateCommand(normalized, actions);

      if (!validation.valid) {
        return {
          success: false,
          error: 'Command rejected: invalid for this device.',
          validationErrors: validation.errors,
          hint: 'Call get-device-full-info again to see availableActions; build the command from there.',
        };
      }

      console.log(
        `[sendDeviceCommandTool] "${device.name}" command:`,
        JSON.stringify(normalized),
        warnings.length > 0 ? `(warnings: ${warnings.length})` : '',
      );

      const result = await natsClient.sendMessage<
        { ok: boolean; code?: string; error?: string },
        {
          homeUniqueId: string;
          deviceUniqueId: string;
          organizationId: string;
          command: Record<string, unknown>;
        }
      >('mqtt-core.publish-command', {
        homeUniqueId: device.home.unique_id,
        deviceUniqueId: device.unique_id,
        organizationId,
        command: normalized,
      });

      if (result?.ok) {
        return {
          success: true,
          message: `Command sent to ${device.name}.`,
          device: { id: device.id, name: device.name },
          commandSent: normalized,
          normalizationWarnings: warnings,
        };
      }

      return {
        success: false,
        error: result?.error ?? 'mqtt-core rejected the command',
        code: result?.code,
      };
    } catch (error) {
      console.error('[sendDeviceCommandTool] Error:', error);
      throw new Error(
        `Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
