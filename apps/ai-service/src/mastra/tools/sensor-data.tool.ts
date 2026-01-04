import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';

/**
 * Tool to get current sensor data for devices the user has access to
 * Queries SensorDataLast and filters by user's accessible homes
 */
export const sensorDataTool = createTool({
  id: 'get-sensor-data',
  description:
    'Get current sensor data and device states from the user\'s smart home. Use this when the user asks about sensor readings, device states, temperatures, humidity, motion detection, light status, or any device data. Returns the latest data for all devices or optionally filtered by home or device.',
  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined = context?.requestContext?.get('dbService');

    if (!userId) {
      throw new Error('User ID is required for sensor data operations');
    }

    if (!dbService) {
      throw new Error('Database service not available');
    }

    try {
      // get all data
      const userHomes = await dbService.userHome.findMany({
        where: { user_id: userId },
        select: {
          home: {
            select: {
              name: true,
              devices: {
                select: {
                  name: true,
                  disabled: true,
                  sensorDataLasts: {
                    select: {
                      data: true,
                      timestamp: true,
                    }
                  }
                }
              }
            },
          },
        },
      });

      console.log(`[SensorDataTool] Found ${userHomes.length} homes with sensor data`);

      return {
        totalDevices: userHomes.reduce((acc, home) => acc + (home.home?.devices?.length || 0), 0),
        data: userHomes,
      };
    } catch (error) {
      console.error(`[SensorDataTool] Error fetching sensor data:`, error);
      throw new Error(
        `Failed to fetch sensor data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
