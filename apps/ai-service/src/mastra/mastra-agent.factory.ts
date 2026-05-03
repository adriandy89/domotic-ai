import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  deviceFullInfoTool,
  devicesListTool,
  sendDeviceCommandTool,
  sensorDataTool,
  weatherTool,
} from './tools';
import { AIProviderConfig, DEFAULT_AI_PROVIDER_CONFIGS } from './types';

/**
 * Factory to create Mastra AI agents
 * Each organization will have its own independent agent
 */
@Injectable()
export class MastraAgentFactory {
  private readonly logger = new Logger(MastraAgentFactory.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Creates a Mastra instance with an agent for a specific organization
   * @param organizationId - Organization ID
   * @param config - AI Provider Configuration
   * @returns Configured Mastra instance
   */
  async createMastra(
    organizationId: string,
    config: AIProviderConfig,
  ): Promise<Mastra> {
    this.logger.log(
      `Creating Mastra instance for organization: ${organizationId}`,
    );

    if (!config.enabled) {
      this.logger.warn(
        `AI provider is disabled for organization: ${organizationId}`,
      );
    }

    // Configure the model according to the provider
    const model = this.getModel(config);

    // Get Mastra database URL
    const databaseUrl = this.configService.get<string>('MASTRA_DATABASE_URL');

    if (!databaseUrl) {
      throw new Error(
        'MASTRA_DATABASE_URL is not configured. Please add it to your .env file.',
      );
    }

    // Create PostgresStore with unique id per organization for isolated memory
    const storage = new PostgresStore({
      id: `org-${organizationId}-vector-store`,
      connectionString: databaseUrl,
    });

    // Initialize storage before using it
    try {
      await storage.init();
      this.logger.log(
        `PostgresStore initialized for organization: ${organizationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize PostgresStore for organization ${organizationId}:`,
        error,
      );
      throw new Error(`Memory storage initialization failed: ${error.message}`);
    }

    // Create the agent
    const agent = new Agent({
      id: `org-${organizationId}-agent`,
      name: `org-${organizationId}-agent`,
      instructions: this.getDefaultInstructions(organizationId),
      // inputProcessors: [
      //   new TopicValidatorProcessor({
      //     allowedTopics: [
      //       'smart home',
      //       'home automation',
      //       'devices',
      //       'sensors',
      //       'sensor data',
      //       'energy management',
      //       'device control',
      //       'climate'
      //     ],
      //     model,
      //     blockStrategy: 'block',
      //     threshold: 0.7,
      //     customMessage:
      //       'I specialize in smart home automation and device management. Please ask questions related to home automation, devices, sensors, or automation rules.',
      //   }),
      // ],
      tools: {
        sensorDataTool,
        devicesListTool,
        deviceFullInfoTool,
        sendDeviceCommandTool,
        weatherTool,
      },
      model,
      memory: new Memory({
        vector: new PgVector({
          id: `org-${organizationId}-vector`,
          connectionString: databaseUrl,
        }),
        embedder: 'openai/text-embedding-3-small',
        options: {
          lastMessages: 8,
          semanticRecall: {
            topK: 3,
            messageRange: { before: 2, after: 1 },
          },
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

    // Create Mastra instance with agent and storage
    const mastra = new Mastra({
      agents: { [`org-${organizationId}-agent`]: agent },
      storage,
    });

    this.logger.log(
      `Mastra instance created for organization ${organizationId} using ${config.provider}/${config.model}`,
    );

    return mastra;
  }

  /**
   * Gets the AI model according to configuration
   * Supports OpenAI and Anthropic (installed)
   * For other providers, install the corresponding package
   */
  private getModel(config: AIProviderConfig) {
    const { provider, model: modelName, apiKey } = config;

    switch (provider) {
      case 'openai': {
        const modelId = modelName || DEFAULT_AI_PROVIDER_CONFIGS.openai.model!;

        if (!apiKey) {
          throw new Error(
            'OpenAI API key is required. Set it in organization attributes.ai.apiKey',
          );
        }

        const openaiProvider = createOpenAI({ apiKey });
        return openaiProvider(modelId);
      }

      case 'anthropic': {
        const modelId =
          modelName || DEFAULT_AI_PROVIDER_CONFIGS.anthropic.model!;

        if (!apiKey) {
          throw new Error(
            'Anthropic API key is required. Set it in organization attributes.ai.apiKey',
          );
        }

        const anthropicProvider = createAnthropic({ apiKey });
        return anthropicProvider(modelId);
      }

      case 'google': {
        // Requires: pnpm add @ai-sdk/google
        const modelId = modelName || DEFAULT_AI_PROVIDER_CONFIGS.google.model!;

        if (!apiKey) {
          throw new Error(
            'Google Generative AI API key is required. Set it in organization attributes.ai.apiKey',
          );
        }

        const googleProvider = createGoogleGenerativeAI({ apiKey });
        return googleProvider(modelId);
      }

      case 'groq': {
        // Requires: pnpm add @ai-sdk/groq
        const modelId = modelName || DEFAULT_AI_PROVIDER_CONFIGS.groq.model!;

        if (!apiKey) {
          throw new Error(
            'Groq API key is required. Set it in organization attributes.ai.apiKey',
          );
        }

        const groqProvider = createGroq({ apiKey });
        return groqProvider(modelId);
      }

      case 'mistral': {
        // Requires: pnpm add @ai-sdk/mistral
        const modelId = modelName || DEFAULT_AI_PROVIDER_CONFIGS.mistral.model!;

        if (!apiKey) {
          throw new Error(
            'Mistral API key is required. Set it in organization attributes.ai.apiKey',
          );
        }

        const mistralProvider = createMistral({ apiKey });
        return mistralProvider(modelId);
      }

      case 'xai': {
        // Requires: pnpm add @ai-sdk/xai
        const modelId = modelName || DEFAULT_AI_PROVIDER_CONFIGS.xai.model!;

        if (!apiKey) {
          throw new Error(
            'xAI API key is required. Set it in organization attributes.ai.apiKey',
          );
        }

        const xaiProvider = createXai({ apiKey });
        return xaiProvider(modelId);
      }

      case 'azure': {
        // Requires: pnpm add @ai-sdk/azure
        const resourceName = config.providerOptions?.resourceName;

        if (!apiKey) {
          throw new Error(
            'Azure API key is required. Set it in organization attributes.ai.apiKey',
          );
        }

        if (!resourceName) {
          throw new Error(
            'Azure resource name is required. Set it in organization attributes.ai.providerOptions.resourceName',
          );
        }

        const azureProvider = createAzure({
          apiKey,
          resourceName,
        });
        return azureProvider(
          config.providerOptions?.deploymentName || modelName!,
        );
      }

      case 'custom': {
        // Requires: pnpm add @ai-sdk/openai-compatible
        const baseURL = config.providerOptions?.baseURL;

        if (!baseURL) {
          throw new Error(
            'Custom provider requires baseURL in attributes.ai.providerOptions.baseURL',
          );
        }

        const customProvider = createOpenAICompatible({
          name: 'custom-provider',
          apiKey,
          baseURL,
        });
        return customProvider.chatModel(modelName!);
      }

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  /**
   * Default instructions for the agent
   */
  private getDefaultInstructions(organizationId: string): string {
    return `You are the smart-home assistant for organization ${organizationId}. You control Zigbee devices through a Zigbee2MQTT bridge.

## Scope
You answer questions and take actions about: devices, sensor readings, home status, and weather context. For anything else (general knowledge, code, jokes, off-topic chit-chat), reply briefly that you specialize in this user's smart home and offer a relevant suggestion.

## Tools
- get-devices-list — find devices by name. Always pass \`nameLike\` if the user mentioned a name.
- get-device-full-info — REQUIRED before sending a command. Returns \`availableActions\` with type and value constraints.
- send-device-command — sends the command. Inputs are validated against the device's exposes; invalid commands are rejected.
- get-sensor-data — latest readings. Pass \`deviceId\` or \`homeId\` to scope.
- get-weather — outdoor conditions for context-aware suggestions.

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
- Always use tools for current state. Do not answer "the light is on" from memory; call get-sensor-data.`;
  }

  /**
   * Validates AI provider configuration
   */
  validateConfig(config: any): AIProviderConfig {
    try {
      const { AIProviderConfigSchema } = require('./types');
      return AIProviderConfigSchema.parse(config);
    } catch (error) {
      this.logger.error('Invalid AI provider configuration', error);
      throw new Error('Invalid AI provider configuration');
    }
  }
}
