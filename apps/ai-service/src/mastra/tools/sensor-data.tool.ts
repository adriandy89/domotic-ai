import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

export const sensorDataTool = createTool({
  id: 'get-sensor-data',
  description:
    'Get the latest sensor readings (temperature, humidity, contact, presence, etc.) from devices the user has access to. Use deviceId to fetch one device, homeId for one home, or no filter to list all.',
  inputSchema: z
    .object({
      deviceId: z.string().optional(),
      homeId: z.string().optional(),
    })
    .optional(),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const { deviceId, homeId } = inputData ?? {};

    if (!userId)
      throw new Error('User ID is required for sensor data operations');
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
              connected: true,
              last_update: true,
              devices: {
                where: {
                  disabled: false,
                  ...(deviceId ? { id: deviceId } : {}),
                },
                select: {
                  id: true,
                  name: true,
                  description: true,
                  disabled: true,
                  sensorDataLasts: {
                    select: { data: true, timestamp: true },
                  },
                },
                take: 200,
              },
            },
          },
        },
      });

      const totalDevices = userHomes.reduce(
        (acc, h) => acc + (h.home?.devices?.length ?? 0),
        0,
      );

      return { totalDevices, data: userHomes };
    } catch (error) {
      console.error('[sensorDataTool] Error:', error);
      throw new Error(
        `Failed to fetch sensor data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
