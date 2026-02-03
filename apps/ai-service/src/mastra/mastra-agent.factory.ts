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
import { deviceFullInfoTool, devicesListTool, sendDeviceCommandTool, sensorDataTool, weatherTool } from './tools';
import { AIProviderConfig, DEFAULT_AI_PROVIDER_CONFIGS } from './types';

/**
 * Factory to create Mastra AI agents
 * Each organization will have its own independent agent
 */
@Injectable()
export class MastraAgentFactory {
  private readonly logger = new Logger(MastraAgentFactory.name);

  constructor(private readonly configService: ConfigService) { }

  /**
   * Creates a Mastra instance with an agent for a specific organization
   * @param organizationId - Organization ID
   * @param config - AI Provider Configuration
   * @returns Configured Mastra instance
   */
  async createMastra(organizationId: string, config: AIProviderConfig): Promise<Mastra> {
    this.logger.log(`Creating Mastra instance for organization: ${organizationId}`);

    if (!config.enabled) {
      this.logger.warn(`AI provider is disabled for organization: ${organizationId}`);
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
      this.logger.log(`PostgresStore initialized for organization: ${organizationId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize PostgresStore for organization ${organizationId}:`, error);
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
        // Storage from main Mastra instance (PostgreSQL)

        // Vector store for semantic recall (optional, currently disabled)
        /* FIXME(mastra): Add a unique `id` parameter. See: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/mastra#required-id-parameter-for-all-mastra-primitives */
        vector: new PgVector({
          id: 'tracking-agent-vector-store',
          connectionString: databaseUrl,
        }),

        // OpenAI embeddings
        embedder: 'openai/text-embedding-3-small',

        options: {
          // Keep last 2 messages for management context
          lastMessages: 2,

          // Semantic recall disabled for real-time performance
          // Enable if you need cross-session analytics context
          semanticRecall: false,

          // Working memory for user preferences
          workingMemory: {
            enabled: true,
            scope: 'thread',
            template: `# Profile
- **User**: 
- **Language**: (es/en)

# CRITICAL RULES
- NEVER USE CACHED/OLD DATES FOR QUERIES
- ALWAYS GENERATE A RESPONSE.
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
        const modelId = modelName || DEFAULT_AI_PROVIDER_CONFIGS.anthropic.model!;

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
        return azureProvider(config.providerOptions?.deploymentName || modelName!);
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
    return `You are an AI assistant for organization ${organizationId}.
    
Your role is to help users manage their smart home devices, create automation rules,
and provide insights about their home's status.

You have access to:
- Homes and their devices
- Sensor data and device states
- Device control (turn on/off, set brightness, etc.)
- Automation rules and schedules
- User preferences and settings

DEVICE CONTROL WORKFLOW:
1. Use devices-list tool to find the device ID
2. Use get-device-full-info with deviceId to see availableActions
3. Use send-device-command with BOTH parameters:
   - deviceId: the device UUID
   - command: an object like { "state": "ON" } or { "brightness": 50 }
   
EXAMPLE: To turn on a light:
- Call send-device-command with deviceId="uuid-of-the-device" and command={ "state": "ON" }
- Respond to the user the action was performed.

Always provide helpful, accurate, and safe responses. 
NEVER RESPOND TO UNRELATED TOPICS.

CRITICAL: USE AVAILABLE TOOLS ALWAYS, NEVER RESPOND WITHOUT USING TOOLS WITH CACHED DATA.`;
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
