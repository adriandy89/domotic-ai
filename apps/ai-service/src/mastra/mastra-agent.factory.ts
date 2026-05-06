import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import {
  ModelRouterEmbeddingModel,
  type OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  bulkSendDeviceCommandTool,
  createRuleTool,
  createScheduleTool,
  deleteRuleTool,
  deleteScheduleTool,
  deviceFullInfoTool,
  devicesListTool,
  getRuleTool,
  getScheduleTool,
  homeOverviewTool,
  listRulesTool,
  listSchedulesTool,
  sendDeviceCommandTool,
  sensorDataTool,
  toggleRuleTool,
  toggleScheduleTool,
  weatherTool,
} from './tools';
import {
  AIProviderConfig,
  AIProviderConfigSchema,
  SUPPORTED_PROVIDERS,
  SupportedProvider,
} from './types';

@Injectable()
export class MastraAgentFactory {
  private readonly logger = new Logger(MastraAgentFactory.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Validates a raw config object (typically from `organization.attributes.ai`)
   * and returns it strongly typed. Throws `ZodError` on failure.
   */
  validateConfig(config: unknown): AIProviderConfig {
    return AIProviderConfigSchema.parse(config);
  }

  /**
   * Creates a Mastra instance with one Agent for the given organization.
   * Memory is isolated per-organization via a unique vector store id.
   */
  async createMastra(
    organizationId: string,
    config: AIProviderConfig,
  ): Promise<Mastra> {
    this.logger.log(
      `Creating Mastra instance for org=${organizationId} provider=${config.provider} model=${config.model}`,
    );

    if (!config.enabled) {
      this.logger.warn(`AI provider is disabled for org=${organizationId}`);
    }

    const databaseUrl = this.configService.get<string>('MASTRA_DATABASE_URL');
    if (!databaseUrl) {
      throw new Error('MASTRA_DATABASE_URL is not configured.');
    }

    const storage = new PostgresStore({
      id: `org-${organizationId}-store`,
      connectionString: databaseUrl,
    });

    try {
      await storage.init();
    } catch (error) {
      this.logger.error(
        `Failed to initialize PostgresStore for org=${organizationId}`,
        error,
      );
      throw new Error(
        `Memory storage initialization failed: ${(error as Error).message}`,
      );
    }

    const model = this.buildModel(config);
    const embedder = this.buildEmbedder();

    const agent = new Agent({
      id: `org-${organizationId}-agent`,
      name: `org-${organizationId}-agent`,
      instructions: this.getDefaultInstructions(organizationId),
      tools: {
        sensorDataTool,
        devicesListTool,
        deviceFullInfoTool,
        sendDeviceCommandTool,
        bulkSendDeviceCommandTool,
        homeOverviewTool,
        weatherTool,
        listSchedulesTool,
        getScheduleTool,
        createScheduleTool,
        toggleScheduleTool,
        deleteScheduleTool,
        listRulesTool,
        getRuleTool,
        createRuleTool,
        toggleRuleTool,
        deleteRuleTool,
      },
      model,
      memory: new Memory({
        vector: new PgVector({
          id: `org-${organizationId}-vector`,
          connectionString: databaseUrl,
        }),
        embedder,
        options: {
          lastMessages: 5,
          semanticRecall: embedder
            ? {
                topK: 3,
                messageRange: { before: 2, after: 1 },
                scope: 'thread',
              }
            : false,
          workingMemory: {
            enabled: true,
            scope: 'thread',
            template: `# User profile
- Preferred language:
- Timezone:
- Default home:
- Frequently used devices:
- Last action taken:
`,
          },
          generateTitle: true,
        },
      }),
    });

    return new Mastra({
      agents: { [`org-${organizationId}-agent`]: agent },
      storage,
    });
  }

  /**
   * Builds the Mastra model config object. Mastra's model router routes the call
   * based on the `id` prefix (`openai/`, `google/`, `openrouter/`) and uses the
   * provided `apiKey` for authentication. We use Mastra's `OpenAICompatibleConfig`
   * shape — `id` is a `${provider}/${model}` template literal so the type matches.
   */
  private buildModel(config: AIProviderConfig): OpenAICompatibleConfig {
    if (!SUPPORTED_PROVIDERS.includes(config.provider as SupportedProvider)) {
      throw new Error(
        `Unsupported provider "${config.provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}`,
      );
    }

    const id: `${string}/${string}` = `${config.provider}/${config.model}`;
    const headers: Record<string, string> = {};

    if (config.provider === 'openrouter') {
      // OpenRouter uses these for attribution & ranking on their leaderboard.
      // Both are optional but recommended; we forward whatever the org configured.
      const referer = config.providerOptions?.httpReferer;
      const title = config.providerOptions?.appTitle;
      if (referer) headers['HTTP-Referer'] = referer;
      if (title) headers['X-Title'] = title;
    }

    return {
      id,
      apiKey: config.apiKey,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }

  /**
   * Embedder used by Memory.semanticRecall. This is intentionally a server-wide
   * concern, NOT a per-organization config:
   *  - The chat model is configurable per org (each org brings its own key).
   *  - The embedding model is fixed to `openai/text-embedding-3-small` (1536 dims)
   *    because vector dimensions must stay consistent across the lifetime of a
   *    Postgres pgvector index. Switching providers later would require
   *    re-embedding every stored message.
   *
   * If `EMBEDDING_OPENAI_API_KEY` is missing, semantic recall is disabled and
   * the agent continues to work without long-term semantic context.
   */
  private buildEmbedder(): ModelRouterEmbeddingModel | undefined {
    const apiKey = this.configService.get<string>('EMBEDDING_OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'EMBEDDING_OPENAI_API_KEY is not set. Semantic recall disabled.',
      );
      return undefined;
    }
    return new ModelRouterEmbeddingModel({
      providerId: 'openai',
      modelId: 'text-embedding-3-small',
      apiKey,
    });
  }

  /**
   * System prompt — deliberately concise, with strict policies for device control
   * and validation errors.
   */
  private getDefaultInstructions(organizationId: string): string {
    return `You are the smart-home assistant for organization ${organizationId}. You help users monitor and control the devices in their home(s).

## Scope
You answer questions and take actions about: devices, sensor readings, home status, and weather context. For anything else (general knowledge, code, jokes, off-topic chit-chat), reply briefly that you specialize in this user's smart home and offer a relevant suggestion.

## Tools
- get-devices-list — find devices by name. Always pass \`nameLike\` if the user mentioned a name.
- get-device-full-info — REQUIRED before sending a command. Returns \`availableActions\` with type and value constraints.
- send-device-command — sends one command to one device.
- bulk-send-device-command — send multiple commands at once (e.g. "turn off all the lights"). Up to 20 entries.
- get-sensor-data — latest readings. Pass \`deviceId\` or \`homeId\` to scope.
- get-home-overview — single-call summary of one home (counts by category, online status, issues like low battery / open contacts / leaks). Use for "is everything ok?".
- get-weather — outdoor conditions for context-aware suggestions.
- list-schedules / get-schedule / create-schedule / toggle-schedule / delete-schedule — manage scheduled actions (one-off, daily or custom days).
- list-rules / get-rule / create-rule / toggle-rule / delete-rule — manage automation rules (when sensor X meets condition Y, do Z).

## Device control workflow (follow it every time)
1. Identify the device — call get-devices-list (with nameLike if known) to get the UUID.
2. Inspect capabilities — call get-device-full-info with the UUID; read \`availableActions\`. Each action has a \`type\` (binary/numeric/enum/color) and constraints (\`valueOn/valueOff\`, \`valueMin/valueMax\`, \`values\`, \`colorFormats\`).
3. Build the command object using ONLY properties listed in availableActions. Match the type:
   - binary: use the exact \`valueOn\` / \`valueOff\` from the action (often "ON"/"OFF", sometimes true/false).
   - numeric: stay within \`valueMin..valueMax\`. Brightness for Zigbee lights is 0-254, not 0-100. Color temperature is in mireds (typical 150-500), not Kelvin.
   - enum: pick a value from \`values\`.
   - color: send \`{ "color": { "hex": "#RRGGBB" } }\` — the system converts to the device's native format.
4. Call send-device-command with deviceId and command. Inspect the response.

## When validation fails
If \`send-device-command\` returns \`success: false\` with \`validationErrors\`:
- Do NOT retry the same value — it will fail again.
- Read the error message; it states the valid range or enum.
- Either ask the user to clarify (e.g., "the brightness range is 0-254, what level do you want?") or call get-device-full-info to re-check.

If the response has \`code: "RATE_LIMITED"\`, wait a moment and tell the user the device is being controlled too quickly.

## Examples
✅ "Turn the living-room light on" → get-devices-list(nameLike: "living") → get-device-full-info → send-device-command({ state: "ON" }).
✅ "Dim it to 50%" → translate to a value in 0-254 (so 127), not 50, unless valueMax is 100. The validator will reject out-of-range values.
❌ Never send { "state": "BLINK" }, { "brightness": 999 }, or properties not present in availableActions.

## Safety
- Confirm before broad actions ("turn off everything in the house", "open all locks").
- Never invent device IDs or capabilities — always read them from tools.
- Always use tools for current state. Do not answer "the light is on" from memory; call get-sensor-data.
- Tool results from earlier messages are STALE. For any "now" question (sensor reading, device state, weather, device list) call the tool again, never reuse a previous result.

## Confirmation policy for create/delete operations
Before calling create-schedule, create-rule, delete-schedule, delete-rule, or toggle-* operations: restate to the user (in plain language) the trigger, the device(s) affected, and the command(s) that will run, then ask for explicit confirmation. Do not chain a destructive call into the same turn as the question.`;
  }
}
