import { DbService } from '@app/db';
import { createTool } from '@mastra/core/tools';
import z from 'zod';

/**
 * Expose interface for device capabilities
 */
interface DeviceExpose {
  name?: string;
  type: string;
  label?: string;
  access?: number;
  property?: string;
  unit?: string;
  category?: string;
  value_on?: boolean | string;
  value_off?: boolean | string;
  value_max?: number;
  value_min?: number;
  value_step?: number;
  values?: string[];
  description?: string;
  features?: DeviceExpose[];
}

/**
 * Available action that can be sent to a device
 */
interface DeviceAction {
  property: string;
  type: string;
  label?: string;
  description?: string;
  unit?: string;
  // Value constraints
  valueOn?: boolean | string;
  valueOff?: boolean | string;
  valueMin?: number;
  valueMax?: number;
  valueStep?: number;
  values?: string[]; // For enum types
}

/**
 * Flatten nested exposes to get all properties
 */
function flattenExposes(exposes: DeviceExpose[]): DeviceExpose[] {
  const result: DeviceExpose[] = [];
  for (const expose of exposes) {
    if (expose.features && expose.features.length > 0) {
      result.push(...flattenExposes(expose.features));
    } else if (expose.property || expose.name) {
      result.push(expose);
    }
  }
  return result;
}

/**
 * Get available actions from device exposes
 * Actions are exposes with write access (access & 0b010)
 * Handles color composites (color_xy, color_hs, color_rgb) as single color actions
 */
function getAvailableActions(exposes: DeviceExpose[]): DeviceAction[] {
  const actions: DeviceAction[] = [];
  const colorTypes = ['color_xy', 'color_hs', 'color_rgb'];

  function processExpose(expose: DeviceExpose): void {
    // Handle composite color features - keep as single "color" action
    if (expose.type === 'composite' && colorTypes.includes(expose.name || '')) {
      // Check if any sub-feature has write access
      const hasWriteAccess = expose.features?.some(f => f.access && (f.access & 0b010));
      if (hasWriteAccess) {
        actions.push({
          property: 'color',
          type: 'color',
          label: expose.label || 'Color',
          description: 'Send color as hex format: { "color": { "hex": "#RRGGBB" } }',
        });
      }
      return;
    }

    // Handle other composite types (light, switch, etc.) - recurse into features
    if (expose.features && expose.features.length > 0) {
      for (const feature of expose.features) {
        processExpose(feature);
      }
      return;
    }

    // Handle simple exposes with write access
    if (expose.access && (expose.access & 0b010) && (expose.property || expose.name)) {
      const action: DeviceAction = {
        property: expose.property || expose.name || '',
        type: expose.type,
        label: expose.label,
        description: expose.description,
        unit: expose.unit,
      };

      // Add value constraints based on type
      if (expose.type === 'binary') {
        action.valueOn = expose.value_on ?? true;
        action.valueOff = expose.value_off ?? false;
      } else if (expose.type === 'numeric') {
        action.valueMin = expose.value_min;
        action.valueMax = expose.value_max;
        action.valueStep = expose.value_step;
      } else if (expose.type === 'enum' && expose.values) {
        action.values = expose.values;
      }

      actions.push(action);
    }
  }

  for (const expose of exposes) {
    processExpose(expose);
  }

  // Remove duplicate color actions (in case device has multiple color formats)
  const uniqueActions: DeviceAction[] = [];
  const seenProperties = new Set<string>();
  for (const action of actions) {
    if (!seenProperties.has(action.property)) {
      seenProperties.add(action.property);
      uniqueActions.push(action);
    }
  }

  return uniqueActions;
}

/**
 * Tool to get device full info by device id
 */
export const deviceFullInfoTool = createTool({
  id: 'get-device-full-info',
  description:
    'Get current device full info by device id including available actions/commands. IMPORTANT: Use this tool to get the device full info, understand what actions are available, and use device id to control them with the send-device-command tool.',
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

      if (!device) {
        return { error: 'Device not found' };
      }

      console.log(`[deviceFullTool] Found device: ${device.name}`);

      // Extract available actions from device attributes
      const attributes = device.attributes as { definition?: { exposes?: DeviceExpose[] } } | null;
      const exposes = attributes?.definition?.exposes || [];
      const availableActions = getAvailableActions(exposes);

      // Generate specific command examples for each action
      const commandExamples = availableActions.map(action => {
        if (action.type === 'color') {
          return `{ "color": { "hex": "#RRGGBB" } } for color (use any hex color like "#FF0000" for red)`;
        } else if (action.type === 'binary') {
          return `{ "${action.property}": ${JSON.stringify(action.valueOn)} } to turn ON, { "${action.property}": ${JSON.stringify(action.valueOff)} } to turn OFF`;
        } else if (action.type === 'numeric') {
          return `{ "${action.property}": NUMBER } (range: ${action.valueMin ?? 0}-${action.valueMax ?? 100})`;
        } else if (action.type === 'enum' && action.values) {
          return `{ "${action.property}": VALUE } where VALUE is one of: ${action.values.join(', ')}`;
        }
        return `{ "${action.property}": VALUE }`;
      });

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
        actionInstructions: availableActions.length > 0
          ? `Use send-device-command with deviceId="${device.id}" and one of these commands: ${commandExamples.join(' OR ')}`
          : 'This device does not have controllable actions.',
      };
    } catch (error) {
      console.error(`[deviceFullTool] Error fetching device data:`, error);
      throw new Error(
        `Failed to fetch device data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});
