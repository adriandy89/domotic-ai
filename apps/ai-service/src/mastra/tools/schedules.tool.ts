import { DbService } from '@app/db';
import {
  SCHEDULES_PATTERNS,
  getAvailableActions,
  getExposesFromAttributes,
  validateCommand,
} from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { createTool } from '@mastra/core/tools';
import { Prisma } from 'generated/prisma/client';
import {
  NotificationChannel,
  ScheduleDays,
  ScheduleFrequency,
} from 'generated/prisma/enums';
import z from 'zod';

const NOTIFICATION_CHANNELS = Object.values(NotificationChannel) as [
  string,
  ...string[],
];
const SCHEDULE_DAYS = Object.values(ScheduleDays) as [string, ...string[]];
const SCHEDULE_FREQUENCIES = Object.values(ScheduleFrequency) as [
  string,
  ...string[],
];

const MAX_ACTIONS = 20;

/**
 * Schedule shape that the rules-engine expects in `schedules.upsert`
 * (must match what api/schedule.service.ts emits).
 */
const SCHEDULE_EXECUTOR_SELECT = {
  id: true,
  active: true,
  date: true,
  frequency: true,
  days: true,
} satisfies Prisma.ScheduleSelect;

// -----------------------------------------------------------------------------
// list-schedules
// -----------------------------------------------------------------------------

export const listSchedulesTool = createTool({
  id: 'list-schedules',
  description:
    "List the user's schedules (id, name, active, frequency, days, time, channel, home, action count). Use this to find a schedule id before get-schedule, toggle-schedule or delete-schedule.",
  inputSchema: z
    .object({
      homeId: z.string().uuid().optional().describe('Restrict to one home id.'),
      activeOnly: z
        .boolean()
        .optional()
        .describe('Return only schedules with active=true.'),
    })
    .optional(),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const { homeId, activeOnly } = inputData ?? {};

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    const schedules = await dbService.schedule.findMany({
      where: {
        user_id: userId,
        ...(homeId ? { home_id: homeId } : {}),
        ...(activeOnly ? { active: true } : {}),
      },
      select: {
        id: true,
        name: true,
        active: true,
        date: true,
        frequency: true,
        days: true,
        channel: true,
        home: { select: { id: true, name: true } },
        _count: { select: { actions: true } },
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      total: schedules.length,
      schedules: schedules.map((s) => ({
        id: s.id,
        name: s.name,
        active: s.active,
        date: s.date,
        frequency: s.frequency,
        days: s.days,
        channel: s.channel,
        home: s.home,
        actionsCount: s._count.actions,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    };
  },
});

// -----------------------------------------------------------------------------
// get-schedule
// -----------------------------------------------------------------------------

export const getScheduleTool = createTool({
  id: 'get-schedule',
  description:
    'Get a single schedule by id, including the full list of actions (deviceId, attribute, value).',
  inputSchema: z.object({
    id: z.string().uuid().describe('Schedule UUID'),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    const schedule = await dbService.schedule.findUnique({
      where: { id: inputData.id, user_id: userId },
      select: {
        id: true,
        name: true,
        active: true,
        date: true,
        frequency: true,
        days: true,
        channel: true,
        home: { select: { id: true, name: true } },
        actions: {
          select: {
            id: true,
            attribute: true,
            data: true,
            device: { select: { id: true, name: true } },
          },
        },
        created_at: true,
        updated_at: true,
      },
    });

    if (!schedule) return { error: 'Schedule not found' };

    return {
      schedule: {
        id: schedule.id,
        name: schedule.name,
        active: schedule.active,
        date: schedule.date,
        frequency: schedule.frequency,
        days: schedule.days,
        channel: schedule.channel,
        home: schedule.home,
        actions: schedule.actions.map((a) => ({
          id: a.id,
          deviceId: a.device?.id,
          deviceName: a.device?.name,
          attribute: a.attribute,
          value: (a.data as { value?: unknown })?.value,
        })),
        createdAt: schedule.created_at,
        updatedAt: schedule.updated_at,
      },
    };
  },
});

// -----------------------------------------------------------------------------
// create-schedule
// -----------------------------------------------------------------------------

const createScheduleInput = z.object({
  name: z
    .string()
    .min(2)
    .max(124)
    .describe('Human-readable name (2-124 chars).'),
  active: z
    .boolean()
    .optional()
    .describe('Whether the schedule starts active. Default true.'),
  homeId: z.string().uuid().describe('Home UUID owning the schedule.'),
  frequency: z
    .enum(SCHEDULE_FREQUENCIES)
    .describe(
      'ONCE = single fire at the given date. DAILY = every day at the time of date (HH:MM in UTC). CUSTOM = at the time of date but only on the given days.',
    ),
  date: z
    .string()
    .describe(
      'Always required. ISO 8601 datetime. For DAILY/CUSTOM only the time-of-day matters (in UTC). For ONCE the full instant is used and must be in the future.',
    ),
  days: z
    .array(z.enum(SCHEDULE_DAYS))
    .optional()
    .describe('Required when frequency=CUSTOM. Otherwise ignored.'),
  channel: z
    .array(z.enum(NOTIFICATION_CHANNELS))
    .optional()
    .describe('Notification channels for this schedule. Default [].'),
  actions: z
    .array(
      z.object({
        deviceId: z.string().uuid().describe('Device UUID'),
        attribute: z
          .string()
          .describe(
            'Property to set, e.g. "state", "brightness", "color_temp". Must match an availableAction of the device.',
          ),
        value: z
          .unknown()
          .describe(
            'Value to set. Must respect the constraints of availableAction (binary valueOn/Off, numeric range, enum values).',
          ),
      }),
    )
    .min(1)
    .max(MAX_ACTIONS)
    .describe(
      `Actions to run when the schedule fires (1-${MAX_ACTIONS}). Each action sets one attribute on one device.`,
    ),
});

export const createScheduleTool = createTool({
  id: 'create-schedule',
  description:
    "Create a new schedule. Validates that home belongs to the user, that each action references a device in the user's organization, and that the resulting command (attribute+value) is legal for that device. Confirm with the user before calling.",
  inputSchema: createScheduleInput,

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const organizationId: string | undefined =
      context?.requestContext?.get('organizationId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const natsClient: NatsClientService | undefined =
      context?.requestContext?.get('natsClient');

    if (!userId) throw new Error('User ID is required');
    if (!organizationId) throw new Error('Organization ID is required');
    if (!dbService) throw new Error('Database service not available');
    if (!natsClient) throw new Error('NATS client not available');

    const {
      name,
      active = true,
      homeId,
      frequency,
      date,
      days,
      channel,
      actions,
    } = inputData;

    // 1. Home belongs to user
    const userHome = await dbService.userHome.findUnique({
      where: { user_id_home_id: { user_id: userId, home_id: homeId } },
    });
    if (!userHome) {
      return {
        success: false,
        error: 'Home not found or not accessible to this user',
      };
    }

    // 2. Frequency / date coherence
    const dateObj = new Date(date);
    if (Number.isNaN(dateObj.getTime())) {
      return { success: false, error: 'Invalid `date` (could not parse ISO).' };
    }

    if (frequency === ScheduleFrequency.ONCE) {
      if (dateObj.getTime() <= Date.now()) {
        return {
          success: false,
          error: 'For frequency=ONCE, `date` must be in the future.',
        };
      }
    } else if (frequency === ScheduleFrequency.CUSTOM) {
      if (!days || days.length === 0) {
        return {
          success: false,
          error: 'For frequency=CUSTOM, at least one day must be provided.',
        };
      }
    }

    // 3. Validate every action against device exposes
    const actionErrors: Array<{
      index: number;
      deviceId: string;
      attribute: string;
      error: string;
      validationErrors?: unknown;
    }> = [];

    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const device = await dbService.device.findUnique({
        where: {
          id: a.deviceId,
          organization_id: organizationId,
          disabled: false,
        },
        select: { id: true, name: true, attributes: true },
      });

      if (!device) {
        actionErrors.push({
          index: i,
          deviceId: a.deviceId,
          attribute: a.attribute,
          error: 'Device not found in your organization or disabled',
        });
        continue;
      }

      const exposes = getExposesFromAttributes(device.attributes);
      const availableActions = getAvailableActions(exposes);
      const command = { [a.attribute]: a.value };
      const validation = validateCommand(command, availableActions);
      if (!validation.valid) {
        actionErrors.push({
          index: i,
          deviceId: a.deviceId,
          attribute: a.attribute,
          error: 'Command rejected: invalid for this device.',
          validationErrors: validation.errors,
        });
      }
    }

    if (actionErrors.length > 0) {
      return {
        success: false,
        error: 'One or more actions failed validation; nothing was created.',
        actionErrors,
        hint: 'Call get-device-full-info on each failing deviceId to check availableActions.',
      };
    }

    // 4. Create
    const created = await dbService.schedule.create({
      data: {
        name,
        active,
        date: dateObj,
        frequency: frequency as ScheduleFrequency,
        days: (days ?? []) as ScheduleDays[],
        channel: (channel ?? []) as NotificationChannel[],
        home: { connect: { id: homeId } },
        user: { connect: { id: userId } },
        actions: {
          createMany: {
            data: actions.map((a) => ({
              attribute: a.attribute,
              data: { value: a.value } as Prisma.InputJsonValue,
              device_id: a.deviceId,
            })),
          },
        },
      },
      select: {
        id: true,
        name: true,
        active: true,
        date: true,
        frequency: true,
        days: true,
        channel: true,
        home: { select: { id: true, name: true } },
      },
    });

    // 5. Emit NATS upsert (executor in rules-engine listens)
    try {
      await natsClient.emit(SCHEDULES_PATTERNS.UPSERT, {
        id: created.id,
        active: created.active,
        date: created.date,
        frequency: created.frequency,
        days: created.days,
      });
    } catch (err) {
      console.error('[createScheduleTool] emit upsert failed', err);
    }

    return {
      success: true,
      schedule: {
        id: created.id,
        name: created.name,
        active: created.active,
        date: created.date,
        frequency: created.frequency,
        days: created.days,
        channel: created.channel,
        home: created.home,
        actionsCount: actions.length,
      },
    };
  },
});

// -----------------------------------------------------------------------------
// toggle-schedule
// -----------------------------------------------------------------------------

export const toggleScheduleTool = createTool({
  id: 'toggle-schedule',
  description:
    'Activate or deactivate a schedule. Deactivating cancels its repeatable job in the executor; reactivating reschedules it.',
  inputSchema: z.object({
    id: z.string().uuid().describe('Schedule UUID'),
    active: z.boolean().describe('Target active state'),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const natsClient: NatsClientService | undefined =
      context?.requestContext?.get('natsClient');

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');
    if (!natsClient) throw new Error('NATS client not available');

    const existing = await dbService.schedule.findUnique({
      where: { id: inputData.id, user_id: userId },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: 'Schedule not found' };
    }

    const updated = await dbService.schedule.update({
      where: { id: inputData.id, user_id: userId },
      data: { active: inputData.active },
      select: SCHEDULE_EXECUTOR_SELECT,
    });

    try {
      await natsClient.emit(SCHEDULES_PATTERNS.UPSERT, updated);
    } catch (err) {
      console.error('[toggleScheduleTool] emit upsert failed', err);
    }

    return { success: true, schedule: updated };
  },
});

// -----------------------------------------------------------------------------
// delete-schedule
// -----------------------------------------------------------------------------

export const deleteScheduleTool = createTool({
  id: 'delete-schedule',
  description:
    'Permanently delete a schedule and cancel any pending fire. Confirm with the user before calling.',
  inputSchema: z.object({
    id: z.string().uuid().describe('Schedule UUID'),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const natsClient: NatsClientService | undefined =
      context?.requestContext?.get('natsClient');

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');
    if (!natsClient) throw new Error('NATS client not available');

    const existing = await dbService.schedule.findUnique({
      where: { id: inputData.id, user_id: userId },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: 'Schedule not found' };
    }

    await dbService.schedule.delete({
      where: { id: inputData.id, user_id: userId },
    });

    try {
      await natsClient.emit(SCHEDULES_PATTERNS.DELETE, { id: inputData.id });
    } catch (err) {
      console.error('[deleteScheduleTool] emit delete failed', err);
    }

    return { success: true, deletedId: inputData.id };
  },
});
