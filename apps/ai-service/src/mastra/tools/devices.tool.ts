import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';

/**
 * Tool to get devices list for devices the user has access to
 */
export const devicesListTool = createTool({
  id: 'get-devices-list',
  description:
    'Get current devices list from the user\'s smart home. IMPORTANT: Use this tools to identify the devices the user and use device id to control them in other tools.',
  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined = context?.requestContext?.get('dbService');

    if (!userId) {
      throw new Error('User ID is required for devices data operations');
    }

    if (!dbService) {
      throw new Error('Database service not available');
    }

    try {
      // get all data
      const homesDevices = await dbService.userHome.findMany({
        where: { user_id: userId },
        select: {
          home: {
            select: {
              name: true,
              description: true,
              disabled: true,
              devices: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  disabled: true,
                }
              }
            },
          },
        },
      });

      console.log(`[devicesDataTool] Found ${homesDevices.length} homes with devices data`);

      return {
        totalDevices: homesDevices.reduce((acc, home) => acc + (home.home?.devices?.length || 0), 0),
        data: homesDevices,
      };
    } catch (error) {
      console.error(`[devicesDataTool] Error fetching devices data:`, error);
      throw new Error(
        `Failed to fetch devices data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
