import * as toolsLib from '@app/ai-tools';
import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { RequestContext } from '@mastra/core/request-context';
import { Injectable, Logger } from '@nestjs/common';
import type { Role } from 'generated/prisma/enums';
import zodToJsonSchema from 'zod-to-json-schema';
import {
  errResp,
  JsonRpcRequest,
  JsonRpcResponse,
  okResp,
  RPC_ERROR,
} from './xiaozhi-jsonrpc';

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

export interface OwnerCtx {
  id: string;
  role: Role;
  organization_id: string;
  timeZone: string;
}

interface ToolListItem {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
}

@Injectable()
export class XiaozhiToolDispatcher {
  private readonly logger = new Logger(XiaozhiToolDispatcher.name);
  private readonly debugIo: boolean;
  private readonly tools = new Map<string, any>();
  private readonly toolsListResult: { tools: ToolListItem[] };

  constructor(
    private readonly db: DbService,
    private readonly nats: NatsClientService,
  ) {
    this.debugIo =
      (process.env.INTEGRATIONS_DEBUG_TOOL_IO ?? 'false').toLowerCase() ===
      'true';

    for (const key of TOOL_KEYS) {
      const t = (toolsLib as Record<string, unknown>)[key];
      if (!t) {
        throw new Error(
          `XiaozhiToolDispatcher: missing tool "${key}" in @app/ai-tools`,
        );
      }
      this.tools.set((t as { id: string }).id, t);
    }

    this.toolsListResult = {
      tools: [...this.tools.values()].map((t) => ({
        name: t.id,
        description: t.description,
        inputSchema: t.inputSchema
          ? zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' })
          : { type: 'object' },
      })),
    };
  }

  handleInitialize(req: JsonRpcRequest): JsonRpcResponse {
    return okResp(req.id ?? null, {
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'domotic-ai', version: '1.0.0' },
      capabilities: { tools: { listChanged: false } },
    });
  }

  handleToolsList(req: JsonRpcRequest): JsonRpcResponse {
    return okResp(req.id ?? null, this.toolsListResult);
  }

  async handleToolsCall(
    req: JsonRpcRequest,
    owner: OwnerCtx,
  ): Promise<JsonRpcResponse> {
    const params = (req.params ?? {}) as {
      name?: string;
      arguments?: unknown;
    };
    const name = params.name ?? '';
    const tool = this.tools.get(name);
    if (!tool) {
      return errResp(
        req.id ?? null,
        RPC_ERROR.METHOD_NOT_FOUND,
        `Unknown tool: ${name}`,
      );
    }

    const inputArgs = params.arguments ?? {};
    let parsedArgs: unknown = inputArgs;
    if (tool.inputSchema?.safeParse) {
      const parsed = tool.inputSchema.safeParse(inputArgs);
      if (!parsed.success) {
        return errResp(
          req.id ?? null,
          RPC_ERROR.INVALID_PARAMS,
          'Invalid params',
          parsed.error.issues,
        );
      }
      parsedArgs = parsed.data;
    }

    if (this.debugIo) {
      this.logger.debug(
        `tool ${tool.id} owner=${owner.id} args=${JSON.stringify(parsedArgs)}`,
      );
    }

    const started = Date.now();
    try {
      const requestContext = new RequestContext();
      requestContext.set('userId', owner.id);
      requestContext.set('organizationId', owner.organization_id);
      requestContext.set('userRole', owner.role);
      requestContext.set('timeZone', owner.timeZone);
      requestContext.set('dbService', this.db);
      requestContext.set('natsClient', this.nats);

      const result = await tool.execute(parsedArgs, { requestContext });
      const duration = Date.now() - started;
      this.logger.log(
        `tool ${tool.id} owner=${owner.id} ok ${duration}ms`,
      );
      return okResp(req.id ?? null, {
        content: [
          { type: 'text', text: JSON.stringify(result) },
        ],
        isError: false,
      });
    } catch (err) {
      const duration = Date.now() - started;
      const message = err instanceof Error ? err.message : 'tool error';
      this.logger.warn(
        `tool ${tool.id} owner=${owner.id} fail ${duration}ms: ${message}`,
      );
      return okResp(req.id ?? null, {
        content: [{ type: 'text', text: message }],
        isError: true,
      });
    }
  }
}
