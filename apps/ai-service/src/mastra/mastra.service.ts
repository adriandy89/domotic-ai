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
    const mastra = await this.getOrCreateMastra(
      organizationId,
      user.organization.attributes['ai'],
    );
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

      const result = await agent.generate(message, {
        maxSteps: 5,
        memory: { thread: conversationId, resource: userId },
        requestContext,
        modelSettings: { temperature: 0.3 },
        system: `Current date/time: ${new Date().toISOString()}${timeZone ? ` (user timezone: ${timeZone})` : ''}. Wait for all tool calls to complete before drafting your final reply.`,
      });

      return result.text;
    } catch (error) {
      this.logger.error(
        `Failed to generate response for user ${userId}`,
        error,
      );
      return error?.message || 'Failed to generate response.';
    }
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
