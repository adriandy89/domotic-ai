import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';

export const listHomesTool = createTool({
  id: 'list-homes',
  description:
    'List ALL homes accessible to the user, each with its id, name, address, connection status and device count. Use this FIRST when the user mentions a specific home by name or when more than one home may exist, then pass the chosen `homeId` to the other tools (get-home-overview, get-devices-list, create-rule, etc.).',

  execute: async (_inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    try {
      const userHomes = await dbService.userHome.findMany({
        where: { user_id: userId },
        orderBy: { home: { created_at: 'asc' } },
        select: {
          home: {
            select: {
              id: true,
              name: true,
              description: true,
              address: true,
              connected: true,
              disabled: true,
              _count: {
                select: { devices: { where: { disabled: false } } },
              },
            },
          },
        },
      });

      const homes = userHomes
        .map((uh) => uh.home)
        .filter((h): h is NonNullable<typeof h> => Boolean(h))
        .map((h) => ({
          id: h.id,
          name: h.name,
          description: h.description,
          address: h.address,
          connected: h.connected,
          disabled: h.disabled,
          deviceCount: h._count.devices,
        }));

      return { homes, count: homes.length };
    } catch (error: any) {
      console.error('[listHomesTool] Error:', error);
      throw new Error(
        `Failed to list homes: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
