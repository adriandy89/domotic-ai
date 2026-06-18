import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

const DEVICE_DETAIL_CAP = 50;
const LOW_BATTERY_THRESHOLD = 15;
const LOW_LINKQUALITY_THRESHOLD = 20;

interface DeviceIssue {
  deviceId: string;
  deviceName: string;
  issue: string;
  detail?: string | number;
}

interface SensorBlob {
  [key: string]: any;
}

function inspectDeviceIssues(
  deviceId: string,
  deviceName: string,
  data: SensorBlob | null,
): DeviceIssue[] {
  if (!data || typeof data !== 'object') return [];
  const issues: DeviceIssue[] = [];

  if (
    typeof data.battery === 'number' &&
    data.battery < LOW_BATTERY_THRESHOLD
  ) {
    issues.push({
      deviceId,
      deviceName,
      issue: 'low_battery',
      detail: data.battery,
    });
  }

  if (
    typeof data.linkquality === 'number' &&
    data.linkquality < LOW_LINKQUALITY_THRESHOLD
  ) {
    issues.push({
      deviceId,
      deviceName,
      issue: 'weak_signal',
      detail: data.linkquality,
    });
  }

  // contact === false means a door/window is OPEN (zigbee2mqtt convention).
  if (data.contact === false) {
    issues.push({ deviceId, deviceName, issue: 'contact_open' });
  }

  if (data.water_leak === true) {
    issues.push({ deviceId, deviceName, issue: 'water_leak' });
  }

  if (data.smoke === true) {
    issues.push({ deviceId, deviceName, issue: 'smoke_detected' });
  }

  if (data.gas === true) {
    issues.push({ deviceId, deviceName, issue: 'gas_detected' });
  }

  if (data.tamper === true) {
    issues.push({ deviceId, deviceName, issue: 'tamper' });
  }

  return issues;
}

export const homeOverviewTool = createTool({
  id: 'get-home-overview',
  description:
    'Get a summary of one home: device counts grouped by category, online status, and a list of detected issues (low battery, weak signal, open contacts, leaks, smoke, gas, tamper). Use this for "is everything ok at home?" type questions in a single call instead of polling every device.',
  inputSchema: z
    .object({
      homeId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Home id. If omitted, uses the first home accessible to the user.',
        ),
    })
    .optional(),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const { homeId } = inputData ?? {};

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    try {
      const userHome = await dbService.userHome.findFirst({
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
              address: true,
              latitude: true,
              longitude: true,
              timezone: true,
              devices: {
                where: { disabled: false },
                select: {
                  id: true,
                  name: true,
                  category: true,
                  sensorDataLasts: {
                    select: { data: true, timestamp: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

      if (!userHome?.home) {
        return { error: 'No home found for this user' };
      }

      const home = userHome.home;
      const devices = home.devices ?? [];

      const byCategory: Record<string, number> = {};
      const issues: DeviceIssue[] = [];
      let onlineCount = 0;

      for (const d of devices) {
        const cat = d.category ?? 'uncategorized';
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;

        const last = d.sensorDataLasts?.[0];
        const data = (last?.data ?? null) as SensorBlob | null;
        if (data && typeof data === 'object') onlineCount += 1;

        issues.push(...inspectDeviceIssues(d.id, d.name, data));
      }

      const truncated = devices.length > DEVICE_DETAIL_CAP;

      return {
        home: {
          id: home.id,
          name: home.name,
          description: home.description,
          disabled: home.disabled,
          connected: home.connected,
          lastUpdate: home.last_update,
          address: home.address,
          latitude: home.latitude,
          longitude: home.longitude,
          timezone: home.timezone,
        },
        deviceCount: devices.length,
        onlineCount,
        offlineCount: devices.length - onlineCount,
        byCategory,
        issues,
        devices: truncated
          ? undefined
          : devices.map((d) => ({
              id: d.id,
              name: d.name,
              category: d.category,
              lastReading: d.sensorDataLasts?.[0] ?? null,
            })),
        truncated,
      };
    } catch (error: any) {
      console.error('[homeOverviewTool] Error:', error);
      throw new Error(
        `Failed to fetch home overview: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
