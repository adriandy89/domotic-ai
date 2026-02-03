import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

/**
 * Tool to get device full info by device id
 */
export const deviceFullInfoTool = createTool({
  id: 'get-device-full-info',
  description:
    'Get current device full info by device id. IMPORTANT: Use this tools to get the device full info and use device id to control them in other tools.',
  inputSchema: z.object({
    deviceId: z.string().describe('Device ID'),
  }),
  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined = context?.requestContext?.get('dbService');
    const { deviceId } = inputData;

    if (!userId) {
      throw new Error('User ID is required for devices data operations');
    }

    if (!dbService) {
      throw new Error('Database service not available');
    }

    try {
      // get device full data
      const device = await dbService.device.findUnique({
        where: { id: deviceId },
        select: {
          id: true,
          name: true,
          description: true,
          disabled: true,
          sensorDataLasts: {
            select: {
              data: true,
              timestamp: true,
            }
          },
          attributes: true,
        }
      });

      console.log(`[deviceFullTool] Found device: ${device?.name}`);

      return {
        device,
      };
    } catch (error) {
      console.error(`[deviceFullTool] Error fetching device data:`, error);
      throw new Error(
        `Failed to fetch device data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
