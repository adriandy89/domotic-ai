import * as toolsLib from '@app/ai-tools';
import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import type { Role } from 'generated/prisma/enums';

export const MCP_SERVER = Symbol('MCP_SERVER');

export interface McpDeps {
  db: DbService;
  nats: NatsClientService;
}

interface AuthExtra {
  userId: string;
  organizationId: string;
  userRole: Role;
  timeZone?: string;
  tokenId: string;
}

const TOOL_KEYS = [
  'sensorDataTool',
  'devicesListTool',
  'deviceFullInfoTool',
  'sendDeviceCommandTool',
  'bulkSendDeviceCommandTool',
  'listLearnedIrCommandsTool',
  'sendLearnedIrCommandTool',
  'homeOverviewTool',
  'weatherTool',
  'listSchedulesTool',
  'getScheduleTool',
  'createScheduleTool',
  'toggleScheduleTool',
  'deleteScheduleTool',
  'listRulesTool',
  'getRuleTool',
  'createRuleTool',
  'toggleRuleTool',
  'deleteRuleTool',
] as const;

type ToolKey = (typeof TOOL_KEYS)[number];

function wrapForMcp(tool: any, deps: McpDeps) {
  return createTool({
    id: tool.id,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    execute: async (input: any, ctx: any) => {
      const authInfo = ctx?.mcp?.extra?.authInfo as
        | { token?: string; extra?: AuthExtra }
        | undefined;
      const auth = authInfo?.extra;
      if (!auth?.userId || !auth?.organizationId) {
        throw new Error('Unauthenticated MCP call');
      }
      const requestContext =
        ctx?.requestContext ?? new RequestContext();
      requestContext.set('userId', auth.userId);
      requestContext.set('organizationId', auth.organizationId);
      requestContext.set('userRole', auth.userRole);
      requestContext.set('timeZone', auth.timeZone);
      requestContext.set('dbService', deps.db);
      requestContext.set('natsClient', deps.nats);
      return tool.execute(input, { ...ctx, requestContext });
    },
  });
}

export function buildMcpServer(deps: McpDeps): MCPServer {
  const tools: Record<string, ReturnType<typeof createTool>> = {};
  for (const key of TOOL_KEYS) {
    const original = (toolsLib as Record<string, unknown>)[key];
    if (!original) {
      throw new Error(`MCP server: missing tool "${key}" in @app/ai-tools`);
    }
    tools[key] = wrapForMcp(original, deps);
  }

  return new MCPServer({
    id: 'domotic-ai',
    name: 'Domotic AI',
    version: '1.0.0',
    description:
      'Smart-home tools (devices, sensors, rules, schedules, IR remote, weather).',
    instructions: [
      'Authenticated tool surface for the user behind the MCP token.',
      'Always call get-devices-list / get-device-full-info before send-device-command — commands are validated against availableActions.',
      'For IR-controlled appliances, use list-learned-ir-commands + send-learned-ir-command instead of crafting an ir_code_to_send manually.',
    ].join(' '),
    tools,
  });
}

export type { ToolKey };
