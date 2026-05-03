import { DbService } from '@app/db';
import { NatsClientService } from '@app/nats-client';
import { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { PostgresStore } from '@mastra/pg';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MastraAgentFactory } from './mastra-agent.factory';
import { AIProviderConfig } from './types';

interface CachedInstance {
  mastra: Mastra;
  lastUsed: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class MastraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MastraService.name);
  private readonly cache = new Map<string, CachedInstance>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly agentFactory: MastraAgentFactory,
    private readonly dbService: DbService,
    private readonly natsClient: NatsClientService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Mastra service...');
    await this.initPgVector();
    this.sweepTimer = setInterval(() => {
      void this.sweepStaleInstances();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const [orgId, entry] of this.cache.entries()) {
      await this.closeMastraConnections(entry.mastra);
      this.cache.delete(orgId);
    }
  }

  async initPgVector() {
    try {
      this.logger.log('🔧 Checking pgvector extension...');
      const databaseUrl = process.env.MASTRA_DATABASE_URL;
      if (!databaseUrl) {
        this.logger.warn(
          '⚠️  MASTRA_DATABASE_URL not configured. Memory features will be disabled.',
        );
        return;
      }
      const storage = new PostgresStore({
        id: 'temp-pgvector-init',
        connectionString: databaseUrl,
      });
      await storage.init();
      await storage.db.none('CREATE EXTENSION IF NOT EXISTS vector;');
      this.logger.log('✅ pgvector extension ready');
      await storage.close();
    } catch (error) {
      this.logger.error('❌ Error initializing pgvector:', error);
      this.logger.warn('⚠️  Continuing without memory features.');
    }
  }

  private async getOrCreateMastra(
    organizationId: string,
    aiConfig: Record<string, any>,
  ): Promise<Mastra> {
    const cached = this.cache.get(organizationId);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.mastra;
    }

    const config = this.getAIProviderConfig(aiConfig);
    if (!config) {
      throw new Error(
        'AI configuration not found. Set organization attributes.ai with a provider config.',
      );
    }
    if (!config.enabled) {
      throw new Error(
        'AI is disabled for organization (attributes.ai.enabled).',
      );
    }

    const mastra = await this.agentFactory.createMastra(organizationId, config);
    this.cache.set(organizationId, { mastra, lastUsed: Date.now() });
    this.logger.log(
      `Cached Mastra instance for org ${organizationId} (cache size=${this.cache.size})`,
    );
    return mastra;
  }

  private async sweepStaleInstances() {
    const now = Date.now();
    for (const [orgId, entry] of this.cache.entries()) {
      if (now - entry.lastUsed > CACHE_TTL_MS) {
        this.cache.delete(orgId);
        this.logger.log(`Evicted stale Mastra instance for org ${orgId}`);
        await this.closeMastraConnections(entry.mastra);
      }
    }
  }

  async generateResponse(
    userId: string,
    message: string,
    conversationId: string,
    timeZone?: string,
  ): Promise<string> {
    const user = await this.dbService.user.findUnique({
      where: { id: userId },
      select: {
        organization_id: true,
        role: true,
        organization: { select: { attributes: true } },
      },
    });

    if (!user?.organization?.attributes?.['ai']?.enabled) {
      return 'AI is not enabled for your organization. Please contact your administrator.';
    }

    const organizationId = user.organization_id;
    const rawAiConfig = user.organization.attributes['ai'];
    const aiConfig = this.getAIProviderConfig(rawAiConfig);
    if (!aiConfig) {
      return 'AI configuration is invalid. Please contact your administrator.';
    }

    const mastra = await this.getOrCreateMastra(organizationId, rawAiConfig);
    const agentName = `org-${organizationId}-agent`;

    try {
      const agent = mastra.getAgent(agentName);
      if (!agent) {
        throw new Error(`Agent not found for organization: ${organizationId}`);
      }

      this.logger.log(
        `📨 [user=${userId}] [conv=${conversationId}] "${message.substring(0, 100)}"`,
      );

      const requestContext = new RequestContext();
      requestContext.set('userId', userId);
      requestContext.set('organizationId', organizationId);
      requestContext.set('userRole', user.role);
      requestContext.set('timeZone', timeZone);
      requestContext.set('dbService', this.dbService);
      requestContext.set('natsClient', this.natsClient);

      const t0 = Date.now();
      try {
        const result = await agent.generate(message, {
          maxSteps: 5,
          memory: { thread: conversationId, resource: userId },
          requestContext,
          modelSettings: {
            temperature: aiConfig.temperature ?? 0.4,
            ...(aiConfig.maxTokens
              ? { maxOutputTokens: aiConfig.maxTokens }
              : {}),
            ...(aiConfig.topP !== undefined ? { topP: aiConfig.topP } : {}),
            ...(aiConfig.topK !== undefined ? { topK: aiConfig.topK } : {}),
            ...(aiConfig.presencePenalty !== undefined
              ? { presencePenalty: aiConfig.presencePenalty }
              : {}),
            ...(aiConfig.frequencyPenalty !== undefined
              ? { frequencyPenalty: aiConfig.frequencyPenalty }
              : {}),
            ...(aiConfig.seed !== undefined ? { seed: aiConfig.seed } : {}),
            ...(aiConfig.stopSequences
              ? { stopSequences: aiConfig.stopSequences }
              : {}),
            ...(aiConfig.maxRetries !== undefined
              ? { maxRetries: aiConfig.maxRetries }
              : {}),
          },
          providerOptions: this.buildRuntimeProviderOptions(aiConfig),
          system: `Current date/time: ${new Date().toISOString()}${timeZone ? ` (user timezone: ${timeZone})` : ''}. Wait for all tool calls to complete before drafting your final reply.`,
        });

        await this.recordAiUsage({
          organizationId,
          userId,
          conversationId,
          provider: aiConfig.provider,
          model: aiConfig.model,
          usage: this.extractUsage(result),
          toolCalls: this.extractToolCalls(result),
          latencyMs: Date.now() - t0,
        });

        return result.text;
      } catch (error) {
        await this.recordAiUsage({
          organizationId,
          userId,
          conversationId,
          provider: aiConfig.provider,
          model: aiConfig.model,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          toolCalls: 0,
          latencyMs: Date.now() - t0,
          error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Unknown error',
        });
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate response for user ${userId}`,
        error,
      );
      return error?.message || 'Failed to generate response.';
    }
  }

  private extractUsage(result: unknown): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    const u = (result as { usage?: Record<string, number> })?.usage ?? {};
    const promptTokens =
      Number(u.promptTokens ?? u.inputTokens ?? u.prompt_tokens ?? 0) || 0;
    const completionTokens =
      Number(u.completionTokens ?? u.outputTokens ?? u.completion_tokens ?? 0) ||
      0;
    const totalTokens =
      Number(u.totalTokens ?? u.total_tokens ?? 0) ||
      promptTokens + completionTokens;
    return { promptTokens, completionTokens, totalTokens };
  }

  private extractToolCalls(result: unknown): number {
    const tc = (result as { toolCalls?: unknown[] })?.toolCalls;
    if (Array.isArray(tc)) return tc.length;
    const steps = (result as { steps?: { toolCalls?: unknown[] }[] })?.steps;
    if (Array.isArray(steps)) {
      return steps.reduce(
        (acc, s) => acc + (Array.isArray(s.toolCalls) ? s.toolCalls.length : 0),
        0,
      );
    }
    return 0;
  }

  /**
   * Best-effort: record AI usage row. Never throws.
   */
  private async recordAiUsage(input: {
    organizationId: string;
    userId: string;
    conversationId: string;
    provider: string;
    model: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    toolCalls: number;
    latencyMs: number;
    error?: string;
  }): Promise<void> {
    try {
      await this.dbService.aiUsage.create({
        data: {
          organization_id: input.organizationId,
          user_id: input.userId,
          conversation_id: input.conversationId,
          provider: input.provider,
          model: input.model,
          prompt_tokens: input.usage.promptTokens,
          completion_tokens: input.usage.completionTokens,
          total_tokens: input.usage.totalTokens,
          tool_calls: input.toolCalls,
          latency_ms: input.latencyMs,
          error: input.error ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `ai_usage insert failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Convert our flat `providerOptions` config into Mastra's per-provider nested form.
   * See https://mastra.ai/models — `providerOptions: { openai: {...} }` etc.
   */
  private buildRuntimeProviderOptions(
    config: AIProviderConfig,
  ): Record<string, Record<string, unknown>> | undefined {
    const opts = config.providerOptions;
    if (!opts) return undefined;

    if (config.provider === 'openai') {
      const openai: Record<string, unknown> = {};
      if (opts.reasoningEffort) openai.reasoningEffort = opts.reasoningEffort;
      if (opts.parallelToolCalls !== undefined) {
        openai.parallelToolCalls = opts.parallelToolCalls;
      }
      return Object.keys(openai).length > 0 ? { openai } : undefined;
    }

    if (config.provider === 'google') {
      const google: Record<string, unknown> = {};
      if (opts.thinkingConfig) google.thinkingConfig = opts.thinkingConfig;
      if (opts.safetySettings) google.safetySettings = opts.safetySettings;
      return Object.keys(google).length > 0 ? { google } : undefined;
    }

    // OpenRouter forwards options to the underlying vendor; runtime options aren't
    // typically needed because the routing key in the model id picks the backend.
    return undefined;
  }

  private async closeMastraConnections(mastra: Mastra) {
    try {
      const stores = (mastra as any).stores;
      if (stores && Array.isArray(stores)) {
        for (const store of stores) {
          if (store && typeof store.close === 'function') {
            await store.close();
          }
        }
      }
    } catch (error) {
      this.logger.warn('Error closing Mastra connections:', error);
    }
  }

  private getAIProviderConfig(aiConfig: any): AIProviderConfig | null {
    if (!aiConfig) {
      this.logger.warn(
        'No AI configuration found in organization attributes.ai',
      );
      return null;
    }
    try {
      return this.agentFactory.validateConfig(aiConfig);
    } catch (error) {
      this.logger.error('Invalid AI configuration:', error);
      return null;
    }
  }

  getStats() {
    return {
      cacheSize: this.cache.size,
      organizations: Array.from(this.cache.keys()),
      pgvectorEnabled: !!process.env.MASTRA_DATABASE_URL,
    };
  }
}
