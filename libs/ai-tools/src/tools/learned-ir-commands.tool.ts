import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { executeOneCommand } from './send-device-command.tool';

export const listLearnedIrCommandsTool = createTool({
  id: 'list-learned-ir-commands',
  description:
    'List IR remote commands previously learned by universal-remote devices (e.g. "Toggle TV on/off", "AC 24°C"). The user names each command when learning it, so match the user request to a command by name (and the parent device by name/description). Returns only metadata — to actually fire one, call send-learned-ir-command with the returned id.',
  inputSchema: z
    .object({
      deviceId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Restrict to a single device (the universal IR remote) by UUID. Omit to list across all devices the user can access.',
        ),
      nameLike: z
        .string()
        .optional()
        .describe(
          'Case-insensitive substring filter on the learned command name (e.g. "tv", "ac").',
        ),
    })
    .optional(),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const organizationId: string | undefined =
      context?.requestContext?.get('organizationId');
    const { deviceId, nameLike } = inputData ?? {};

    if (!userId)
      throw new Error('User ID is required for learned IR command operations');
    if (!dbService) throw new Error('Database service not available');
    if (!organizationId) throw new Error('Organization ID is required');

    try {
      const rows = await dbService.deviceLearnedCommands.findMany({
        where: {
          ...(nameLike
            ? { name: { contains: nameLike, mode: 'insensitive' as const } }
            : {}),
          device: {
            ...(deviceId ? { id: deviceId } : {}),
            organization_id: organizationId,
            disabled: false,
            home: {
              users: { some: { user_id: userId } },
            },
          },
        },
        select: {
          id: true,
          name: true,
          updated_at: true,
          device: {
            select: {
              id: true,
              name: true,
              description: true,
              home: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ device: { name: 'asc' } }, { name: 'asc' }],
        take: 500,
      });

      const commands = rows.map((r) => ({
        id: r.id,
        name: r.name,
        updatedAt: r.updated_at,
        device: {
          id: r.device.id,
          name: r.device.name,
          description: r.device.description,
          home: r.device.home
            ? { id: r.device.home.id, name: r.device.home.name }
            : null,
        },
      }));

      return { totalCommands: commands.length, commands };
    } catch (error: any) {
      console.error('[listLearnedIrCommandsTool] Error:', error);
      throw new Error(
        `Failed to list learned IR commands: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});

export const sendLearnedIrCommandTool = createTool({
  id: 'send-learned-ir-command',
  description:
    'Fire a previously-learned IR remote command by its id (obtained from list-learned-ir-commands). The stored IR code is forwarded to the universal remote that learned it. Use this instead of send-device-command when the user wants to trigger something on an IR-controlled appliance (TV, AC, sound system).',
  inputSchema: z.object({
    learnedCommandId: z
      .string()
      .uuid()
      .describe('UUID of the learned command to send.'),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const natsClient: NatsClientService | undefined =
      context?.requestContext?.get('natsClient');
    const organizationId: string | undefined =
      context?.requestContext?.get('organizationId');
    const { learnedCommandId } = inputData;

    if (!userId)
      throw new Error('User ID is required for learned IR command operations');
    if (!dbService) throw new Error('Database service not available');
    if (!natsClient) throw new Error('NATS client not available');
    if (!organizationId) throw new Error('Organization ID is required');

    try {
      const learned = await dbService.deviceLearnedCommands.findFirst({
        where: {
          id: learnedCommandId,
          device: {
            organization_id: organizationId,
            disabled: false,
          },
        },
        select: {
          id: true,
          name: true,
          command: true,
          device: { select: { id: true, name: true } },
        },
      });

      if (!learned) {
        return {
          success: false,
          error:
            'Learned IR command not found, or its device is disabled / not accessible.',
        };
      }

      const result = await executeOneCommand(
        { dbService, natsClient, organizationId, userId },
        learned.device.id,
        { ir_code_to_send: learned.command },
      );

      if (result.success) {
        return {
          ...result,
          message: `Sent learned IR command "${learned.name}" via ${learned.device.name}.`,
          learnedCommand: { id: learned.id, name: learned.name },
        };
      }

      return {
        ...result,
        learnedCommand: { id: learned.id, name: learned.name },
      };
    } catch (error: any) {
      console.error('[sendLearnedIrCommandTool] Error:', error);
      throw new Error(
        `Failed to send learned IR command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
