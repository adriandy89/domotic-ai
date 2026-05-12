import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { executeOneCommand } from './send-device-command.tool';

const MAX_BULK_COMMANDS = 20;

export const bulkSendDeviceCommandTool = createTool({
  id: 'bulk-send-device-command',
  description:
    'Send the same or different commands to multiple devices in one call. Use for "turn off all lights in the living room" type requests. Each entry is validated independently; one failure does not abort the others. Cap: 20 entries per call.',
  inputSchema: z.object({
    commands: z
      .array(
        z.object({
          deviceId: z.string().uuid().describe('Device database UUID'),
          command: z
            .record(z.any())
            .describe(
              'Property-value pairs matching the device availableActions. Same shape as send-device-command.',
            ),
        }),
      )
      .min(1)
      .max(MAX_BULK_COMMANDS)
      .describe(`Up to ${MAX_BULK_COMMANDS} commands.`),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const natsClient: NatsClientService | undefined =
      context?.requestContext?.get('natsClient');
    const organizationId: string | undefined =
      context?.requestContext?.get('organizationId');
    const { commands } = inputData;

    if (!userId)
      throw new Error('User ID is required for device command operations');
    if (!dbService) throw new Error('Database service not available');
    if (!natsClient) throw new Error('NATS client not available');
    if (!organizationId) throw new Error('Organization ID is required');

    const deps = { dbService, natsClient, organizationId, userId };

    const results = await Promise.all(
      commands.map(async ({ deviceId, command }) => {
        try {
          const r = await executeOneCommand(deps, deviceId, command);
          return { deviceId, ...r };
        } catch (error: any) {
          return {
            deviceId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),
    );

    const successCount = results.filter((r) => r.success).length;
    return {
      total: results.length,
      successCount,
      failureCount: results.length - successCount,
      results,
    };
  },
});
