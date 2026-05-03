import { DbService } from '@app/db';
import {
  DeviceAction,
  getAvailableActions,
  getExposesFromAttributes,
} from '@app/models';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

function describeAction(action: DeviceAction): string {
  if (action.type === 'color') {
    const fmts = action.colorFormats?.join('/') ?? 'xy';
    return `{ "color": { "hex": "#RRGGBB" } } (device accepts ${fmts}; hex is auto-converted)`;
  }
  if (action.type === 'binary') {
    return `{ "${action.property}": ${JSON.stringify(action.valueOn)} } | ${JSON.stringify(action.valueOff)}`;
  }
  if (action.type === 'numeric') {
    const min = action.valueMin ?? 0;
    const max = action.valueMax ?? '∞';
    const unit = action.unit ? ` ${action.unit}` : '';
    return `{ "${action.property}": NUMBER }  // range ${min}-${max}${unit}`;
  }
  if (action.type === 'enum' && action.values) {
    return `{ "${action.property}": VALUE }  // one of: ${action.values.join(', ')}`;
  }
  return `{ "${action.property}": VALUE }`;
}

export const deviceFullInfoTool = createTool({
  id: 'get-device-full-info',
  description:
    'Get full device info by id, including the writable actions (with type and value constraints). Always call this before send-device-command so you can build a command that respects the device capabilities.',
  inputSchema: z.object({
    deviceId: z.string().describe('Device database UUID'),
  }),
  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const { deviceId } = inputData;

    if (!userId)
      throw new Error('User ID is required for device data operations');
    if (!dbService) throw new Error('Database service not available');

    try {
      const device = await dbService.device.findUnique({
        where: { id: deviceId },
        select: {
          id: true,
          name: true,
          description: true,
          disabled: true,
          sensorDataLasts: { select: { data: true, timestamp: true } },
          attributes: true,
        },
      });

      if (!device) return { error: 'Device not found' };

      const exposes = getExposesFromAttributes(device.attributes);
      const availableActions = getAvailableActions(exposes);
      const commandExamples = availableActions.map(describeAction);

      return {
        device: {
          id: device.id,
          name: device.name,
          description: device.description,
          disabled: device.disabled,
          sensorDataLasts: device.sensorDataLasts,
        },
        availableActions,
        commandExamples,
        actionInstructions:
          availableActions.length > 0
            ? `Use send-device-command with deviceId="${device.id}" and a command object whose properties and values match availableActions. The validator will reject anything else.`
            : 'This device has no controllable actions.',
      };
    } catch (error) {
      console.error('[deviceFullTool] Error:', error);
      throw new Error(
        `Failed to fetch device data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
