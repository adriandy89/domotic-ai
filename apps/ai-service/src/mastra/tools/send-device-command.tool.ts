import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

/**
 * Tool to send commands to a device by its database ID
 */
export const sendDeviceCommandTool = createTool({
  id: 'send-device-command',
  description:
    'Send a command to control a smart home device. IMPORTANT: You must provide BOTH deviceId AND command. First use get-device-full-info tool to get the availableActions, then call this tool with both the deviceId and a command object matching one of the available actions.',
  inputSchema: z.object({
    deviceId: z.string().describe('The device database ID (UUID format)'),
    command: z.record(z.any()).describe(
      'REQUIRED: Command object with property-value pairs based on availableActions from get-device-full-info. For binary actions like "state" use { "state": "ON" } or { "state": "OFF" }. For numeric actions like "brightness" use { "brightness": 100 }. For enum actions use the value from the values array.'
    ),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined = context?.requestContext?.get('dbService');
    const natsClient: NatsClientService | undefined = context?.requestContext?.get('natsClient');
    const organizationId: string | undefined = context?.requestContext?.get('organizationId');
    const { deviceId, command } = inputData;

    if (!userId) {
      throw new Error('User ID is required for device command operations');
    }

    if (!dbService) {
      throw new Error('Database service not available');
    }

    if (!natsClient) {
      throw new Error('NATS client not available');
    }

    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    try {
      // Get device with home info to build MQTT topic
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
          home: {
            select: {
              unique_id: true,
            },
          },
        },
      });

      if (!device) {
        return {
          success: false,
          error: 'Device not found or disabled',
        };
      }

      if (!device.home) {
        return {
          success: false,
          error: 'Device is not assigned to a home',
        };
      }

      console.log(
        `[sendDeviceCommandTool] Sending command to device "${device.name}":`,
        JSON.stringify(command),
      );

      // Send command via NATS to mqtt-core
      const result = await natsClient.sendMessage<
        { ok: boolean },
        { homeUniqueId: string; deviceUniqueId: string; command: Record<string, unknown> }
      >('mqtt-core.publish-command', {
        homeUniqueId: device.home.unique_id,
        deviceUniqueId: device.unique_id,
        command,
      });

      if (result?.ok) {
        return {
          success: true,
          message: `Command sent successfully to ${device.name}`,
          device: {
            id: device.id,
            name: device.name,
          },
          instruction: 'Inform the user that the action was sent.',
        };
      } else {
        return {
          success: false,
          error: 'Failed to send command to device',
        };
      }
    } catch (error) {
      console.error(`[sendDeviceCommandTool] Error sending command:`, error);
      throw new Error(
        `Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
