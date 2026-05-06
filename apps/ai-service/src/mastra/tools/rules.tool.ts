import { DbService } from '@app/db';
import {
  getAvailableActions,
  getExposesFromAttributes,
  getReadableAttributes,
  validateCommand,
} from '@app/models';
import { createTool } from '@mastra/core/tools';
import { Prisma } from 'generated/prisma/client';
import {
  NotificationChannel,
  Operation,
  ResultType,
  RuleType,
} from 'generated/prisma/enums';
import z from 'zod';

const NOTIFICATION_CHANNELS = Object.values(NotificationChannel) as [
  string,
  ...string[],
];
const OPERATIONS = Object.values(Operation) as [string, ...string[]];
const RULE_TYPES = Object.values(RuleType) as [string, ...string[]];
const RESULT_TYPES = Object.values(ResultType) as [string, ...string[]];

const MAX_CONDITIONS = 10;
const MAX_RESULTS = 10;

// -----------------------------------------------------------------------------
// list-rules
// -----------------------------------------------------------------------------

export const listRulesTool = createTool({
  id: 'list-rules',
  description:
    "List the user's rules. Each rule entry includes id, name, type, active, all (AND/OR), interval, home, and counts of conditions/results. Use this to find a rule id before get-rule, toggle-rule or delete-rule.",
  inputSchema: z
    .object({
      homeId: z.string().uuid().optional().describe('Restrict to one home id.'),
      activeOnly: z.boolean().optional(),
    })
    .optional(),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');
    const { homeId, activeOnly } = inputData ?? {};

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    const rules = await dbService.rule.findMany({
      where: {
        user_id: userId,
        ...(homeId ? { home_id: homeId } : {}),
        ...(activeOnly ? { active: true } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        active: true,
        all: true,
        interval: true,
        home: { select: { id: true, name: true } },
        _count: { select: { conditions: true, results: true } },
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      total: rules.length,
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        type: r.type,
        active: r.active,
        all: r.all,
        interval: r.interval,
        home: r.home,
        conditionsCount: r._count.conditions,
        resultsCount: r._count.results,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  },
});

// -----------------------------------------------------------------------------
// get-rule
// -----------------------------------------------------------------------------

export const getRuleTool = createTool({
  id: 'get-rule',
  description:
    'Get a single rule by id, including its full conditions and results. Conditions describe the trigger (deviceId, attribute, operation, value); results describe what to do (COMMAND with attribute+value, or NOTIFICATION with channel+event).',
  inputSchema: z.object({
    id: z.string().uuid().describe('Rule UUID'),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    const rule = await dbService.rule.findUnique({
      where: { id: inputData.id, user_id: userId },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        active: true,
        all: true,
        interval: true,
        home: { select: { id: true, name: true } },
        conditions: {
          select: {
            id: true,
            attribute: true,
            operation: true,
            data: true,
            device: { select: { id: true, name: true } },
          },
        },
        results: {
          select: {
            id: true,
            type: true,
            attribute: true,
            data: true,
            event: true,
            channel: true,
            resend_after: true,
            device: { select: { id: true, name: true } },
          },
        },
        created_at: true,
        updated_at: true,
      },
    });

    if (!rule) return { error: 'Rule not found' };

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        type: rule.type,
        active: rule.active,
        all: rule.all,
        interval: rule.interval,
        home: rule.home,
        conditions: rule.conditions.map((c) => ({
          id: c.id,
          deviceId: c.device?.id,
          deviceName: c.device?.name,
          attribute: c.attribute,
          operation: c.operation,
          value: (c.data as { value?: unknown })?.value,
        })),
        results: rule.results.map((r) => ({
          id: r.id,
          type: r.type,
          deviceId: r.device?.id,
          deviceName: r.device?.name,
          attribute: r.attribute,
          value: (r.data as { value?: unknown })?.value,
          event: r.event,
          channel: r.channel,
          resendAfter: r.resend_after,
        })),
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      },
    };
  },
});

// -----------------------------------------------------------------------------
// create-rule
// -----------------------------------------------------------------------------

const createRuleInput = z.object({
  name: z.string().min(2).max(124),
  description: z.string().max(500).optional(),
  active: z.boolean().optional().describe('Default true.'),
  all: z
    .boolean()
    .optional()
    .describe(
      'true = AND between conditions (all must match). false = OR (any). Default true.',
    ),
  interval: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Seconds to wait after conditions are met before firing results. Default 0.',
    ),
  type: z
    .enum(RULE_TYPES)
    .optional()
    .describe(
      'ONCE = fire once then deactivate. RECURRENT = fire every time conditions are met (with `interval` cooldown). Default RECURRENT.',
    ),
  homeId: z.string().uuid().describe('Home UUID owning the rule.'),
  conditions: z
    .array(
      z.object({
        deviceId: z.string().uuid(),
        attribute: z
          .string()
          .describe(
            'A readable attribute of the device (e.g. "temperature", "humidity", "occupancy", "state"). Must be reported by the device.',
          ),
        operation: z
          .enum(OPERATIONS)
          .describe('Comparison: EQ, GT, GTE, LT, LTE.'),
        value: z.unknown().describe('Threshold or value to compare against.'),
      }),
    )
    .min(1)
    .max(MAX_CONDITIONS),
  results: z
    .array(
      z.object({
        type: z.enum(RESULT_TYPES).describe('COMMAND or NOTIFICATION.'),
        deviceId: z
          .string()
          .uuid()
          .optional()
          .describe('Required when type=COMMAND.'),
        attribute: z
          .string()
          .optional()
          .describe(
            'For COMMAND: writable property to set on the device. For NOTIFICATION: ignored.',
          ),
        value: z
          .unknown()
          .optional()
          .describe('For COMMAND: value to set. For NOTIFICATION: ignored.'),
        event: z
          .string()
          .optional()
          .describe(
            'For NOTIFICATION: human-readable message text (required).',
          ),
        channel: z
          .array(z.enum(NOTIFICATION_CHANNELS))
          .optional()
          .describe(
            'For NOTIFICATION: at least one channel (PUSH, EMAIL, SMS, TELEGRAM, WEBHOOK).',
          ),
        resendAfter: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Cooldown in seconds before resending. Default 10.'),
      }),
    )
    .min(1)
    .max(MAX_RESULTS),
});

export const createRuleTool = createTool({
  id: 'create-rule',
  description:
    'Create a new automation rule (e.g. "if living-room temperature > 25 then turn on AC"). Validates that home, devices, condition attributes (readable) and result commands (writable + valid value) all exist for this user. Confirm with the user before calling.',
  inputSchema: createRuleInput,

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const organizationId: string | undefined =
      context?.requestContext?.get('organizationId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');

    if (!userId) throw new Error('User ID is required');
    if (!organizationId) throw new Error('Organization ID is required');
    if (!dbService) throw new Error('Database service not available');

    const {
      name,
      description,
      active = true,
      all = true,
      interval = 0,
      type = RuleType.RECURRENT,
      homeId,
      conditions,
      results,
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

    // 2. Validate conditions (readable attributes)
    const conditionErrors: Array<{
      index: number;
      deviceId: string;
      attribute: string;
      error: string;
      readableAttributes?: string[];
    }> = [];

    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      const device = await dbService.device.findUnique({
        where: {
          id: c.deviceId,
          organization_id: organizationId,
          disabled: false,
        },
        select: { id: true, name: true, attributes: true },
      });
      if (!device) {
        conditionErrors.push({
          index: i,
          deviceId: c.deviceId,
          attribute: c.attribute,
          error: 'Device not found in your organization or disabled',
        });
        continue;
      }
      const exposes = getExposesFromAttributes(device.attributes);
      const readable = getReadableAttributes(exposes);
      const found = readable.find((r) => r.property === c.attribute);
      if (!found) {
        conditionErrors.push({
          index: i,
          deviceId: c.deviceId,
          attribute: c.attribute,
          error: `Attribute "${c.attribute}" is not a readable attribute of this device`,
          readableAttributes: readable.map((r) => r.property),
        });
      }
    }

    // 3. Validate results
    const resultErrors: Array<{
      index: number;
      error: string;
      validationErrors?: unknown;
    }> = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.type === ResultType.COMMAND) {
        if (!r.deviceId || !r.attribute || r.value === undefined) {
          resultErrors.push({
            index: i,
            error: 'COMMAND result requires deviceId, attribute and value',
          });
          continue;
        }
        const device = await dbService.device.findUnique({
          where: {
            id: r.deviceId,
            organization_id: organizationId,
            disabled: false,
          },
          select: { id: true, attributes: true },
        });
        if (!device) {
          resultErrors.push({
            index: i,
            error: `Device ${r.deviceId} not found in your organization or disabled`,
          });
          continue;
        }
        const exposes = getExposesFromAttributes(device.attributes);
        const availableActions = getAvailableActions(exposes);
        const validation = validateCommand(
          { [r.attribute]: r.value },
          availableActions,
        );
        if (!validation.valid) {
          resultErrors.push({
            index: i,
            error: 'Command rejected: invalid for this device.',
            validationErrors: validation.errors,
          });
        }
      } else if (r.type === ResultType.NOTIFICATION) {
        if (!r.event || r.event.trim().length === 0) {
          resultErrors.push({
            index: i,
            error: 'NOTIFICATION result requires a non-empty `event` text',
          });
        }
        if (!r.channel || r.channel.length === 0) {
          resultErrors.push({
            index: i,
            error: 'NOTIFICATION result requires at least one channel',
          });
        }
      }
    }

    if (conditionErrors.length > 0 || resultErrors.length > 0) {
      return {
        success: false,
        error: 'Validation failed; nothing was created.',
        conditionErrors:
          conditionErrors.length > 0 ? conditionErrors : undefined,
        resultErrors: resultErrors.length > 0 ? resultErrors : undefined,
      };
    }

    // 4. Create rule + nested conditions/results
    const created = await dbService.rule.create({
      data: {
        name,
        description: description ?? null,
        active,
        all,
        interval,
        type: type as RuleType,
        home: { connect: { id: homeId } },
        user: { connect: { id: userId } },
        conditions: {
          createMany: {
            data: conditions.map((c) => ({
              device_id: c.deviceId,
              attribute: c.attribute,
              operation: c.operation as Operation,
              data: { value: c.value } as Prisma.InputJsonValue,
            })),
          },
        },
        results: {
          createMany: {
            data: results.map((r) => ({
              type: r.type as ResultType,
              device_id: r.deviceId ?? null,
              attribute: r.attribute ?? null,
              data:
                r.value !== undefined
                  ? ({ value: r.value } as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              event: r.event ?? '',
              channel: (r.channel ?? []) as NotificationChannel[],
              resend_after: r.resendAfter ?? 10,
            })),
          },
        },
      },
      select: {
        id: true,
        name: true,
        active: true,
        type: true,
        home: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      rule: {
        id: created.id,
        name: created.name,
        active: created.active,
        type: created.type,
        home: created.home,
        conditionsCount: conditions.length,
        resultsCount: results.length,
      },
    };
  },
});

// -----------------------------------------------------------------------------
// toggle-rule
// -----------------------------------------------------------------------------

export const toggleRuleTool = createTool({
  id: 'toggle-rule',
  description:
    'Activate or deactivate a rule. Inactive rules are skipped by the rules engine when evaluating sensor data.',
  inputSchema: z.object({
    id: z.string().uuid(),
    active: z.boolean(),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    const existing = await dbService.rule.findUnique({
      where: { id: inputData.id, user_id: userId },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: 'Rule not found' };
    }

    const updated = await dbService.rule.update({
      where: { id: inputData.id, user_id: userId },
      data: { active: inputData.active },
      select: { id: true, name: true, active: true },
    });

    return { success: true, rule: updated };
  },
});

// -----------------------------------------------------------------------------
// delete-rule
// -----------------------------------------------------------------------------

export const deleteRuleTool = createTool({
  id: 'delete-rule',
  description:
    'Permanently delete a rule. Confirm with the user before calling.',
  inputSchema: z.object({
    id: z.string().uuid(),
  }),

  execute: async (inputData, context) => {
    const userId: string | undefined = context?.requestContext?.get('userId');
    const dbService: DbService | undefined =
      context?.requestContext?.get('dbService');

    if (!userId) throw new Error('User ID is required');
    if (!dbService) throw new Error('Database service not available');

    const existing = await dbService.rule.findUnique({
      where: { id: inputData.id, user_id: userId },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: 'Rule not found' };
    }

    await dbService.rule.delete({
      where: { id: inputData.id, user_id: userId },
    });

    return { success: true, deletedId: inputData.id };
  },
});
