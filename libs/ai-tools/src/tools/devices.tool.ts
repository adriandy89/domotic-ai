import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

export const devicesListTool = createTool({
  id: 'get-devices-list',
  description:
    'List devices accessible to the user. Use this to find a device id by name, then call get-device-full-info or send-device-command. Pass nameLike to filter on the server (avoid pulling thousands of devices).',
  inputSchema: z
    .object({
      nameLike: z
        .string()
        .optional()
        .describe('Case-insensitive substring to filter device or home name.'),
      homeId: z
        .string()
        .uuid()
        .optional()
        .describe('Restrict to a single home id.'),
      includeDisabled: z
        .boolean()
        .optional()
        .describe('Include disabled devices (default false).'),
    })
    .optional(),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const { nameLike, homeId, includeDisabled } = inputData ?? {};

    if (!userId)
      throw new Error('User ID is required for devices data operations');
    if (!dbService) throw new Error('Database service not available');

    try {
      const userHomes = await dbService.userHome.findMany({
        where: {
          user_id: userId,
          ...(homeId ? { home_id: homeId } : {}),
        },
        select: {
          home: {
            select: {
              id: true,
              name: true,
              description: true,
              disabled: true,
              devices: {
                where: {
                  ...(includeDisabled ? {} : { disabled: false }),
                  ...(nameLike
                    ? {
                        name: {
                          contains: nameLike,
                          mode: 'insensitive' as const,
                        },
                      }
                    : {}),
                },
                select: {
                  id: true,
                  name: true,
                  description: true,
                  disabled: true,
                  model: true,
                  category: true,
                },
                take: 200,
              },
            },
          },
        },
      });

      const devices = userHomes.flatMap((uh) => {
        const home = uh.home;
        if (!home) return [];
        const homeMeta = {
          id: home.id,
          name: home.name,
          description: home.description,
          disabled: home.disabled,
        };
        return home.devices.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          disabled: d.disabled,
          model: d.model,
          category: d.category,
          home: homeMeta,
        }));
      });

      return { totalDevices: devices.length, devices };
    } catch (error: any) {
      console.error('[devicesListTool] Error:', error);
      throw new Error(
        `Failed to fetch devices: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
