import { DbService } from '@app/db';
import { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { PostgresStore } from '@mastra/pg';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MastraAgentFactory } from './mastra-agent.factory';
import {
  AIProviderConfig
} from './types';

/**
 * Service that manages on-demand creation of Mastra instances
 * Does not keep instances in memory for better scalability
 */
@Injectable()
export class MastraService implements OnModuleInit {
  private readonly logger = new Logger(MastraService.name);

  constructor(
    private readonly agentFactory: MastraAgentFactory,
    private readonly dbService: DbService,
  ) { }

  async onModuleInit() {
    this.logger.log('Initializing Mastra service...');
    await this.initPgVector();
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

      // Create temporary storage just to verify/create the pgvector extension
      const storage = new PostgresStore({
        id: 'temp-pgvector-init',
        connectionString: databaseUrl,
      });

      // Initialize storage
      await storage.init();

      // Create pgvector extension if it doesn't exist
      await storage.db.none('CREATE EXTENSION IF NOT EXISTS vector;');

      this.logger.log('✅ pgvector extension ready!');
      this.logger.log(
        '📋 Mastra will create isolated memory tables per organization on first use',
      );

      // Close temporary connection
      await storage.close();
    } catch (error) {
      this.logger.error('❌ Error initializing pgvector:', error);
      this.logger.warn(
        '⚠️  Continuing without memory features. AI agents will work but without conversation history.',
      );
    }
  }

  /**
   * Creates an on-demand Mastra instance for an organization
   */
  private async createMastra(organizationId: string, aiConfig: Record<string, any>): Promise<Mastra> {

    // Get AI provider configuration
    const config = this.getAIProviderConfig(aiConfig);

    if (!config) {
      throw new Error(
        `AI configuration not found for organization. Please configure AI provider in organization attributes.ai`,
      );
    }

    if (!config.enabled) {
      throw new Error(
        `AI is disabled for organization. Enable it in organization attributes.ai.enabled`,
      );
    }

    // Create Mastra instance
    const mastra = this.agentFactory.createMastra(organizationId, config);

    return mastra;
  }

  /**
   * Generates a response using the organization's agent
   * @param userId - User ID
   * @param message - User message
   * @param conversationId - Conversation ID (used as threadId in Mastra)
   * @param timeZone - User timezone (optional)
   * @param context - Additional context (optional)
   */
  async generateResponse(
    userId: string,
    message: string,
    conversationId: string,
    timeZone?: string,
  ): Promise<string> {
    // Get user and their organization
    const user = await this.dbService.user.findUnique({
      where: { id: userId },
      select: {
        organization_id: true, role: true,
        organization: { select: { attributes: true } }
      },
    });

    if (!user?.organization?.attributes?.['ai']?.enabled) {
      return 'AI is not enabled for your organization. Please contact your administrator.';
    }

    const organizationId = user.organization_id;

    // Create on-demand Mastra instance
    const mastra = await this.createMastra(organizationId, user.organization.attributes['ai']);
    const agentName = `org-${organizationId}-agent`;

    try {
      const agent = mastra.getAgent(agentName);

      if (!agent) {
        throw new Error(`Agent not found for organization: ${organizationId}`);
      }

      this.logger.log(`📨 [Chat-Mastra] Processing message for user ${userId}, conversation ${conversationId}`);
      this.logger.log(`💬 Message: "${message.substring(0, 100)}..."`);

      const requestContext = new RequestContext();
      requestContext.set('userId', userId);
      requestContext.set('organizationId', user.organization_id);
      requestContext.set('userRole', user.role);
      requestContext.set('timeZone', timeZone);
      requestContext.set('dbService', this.dbService);

      const now = new Date();

      const result = await agent.generate(message, {
        maxSteps: 3, // Limit tool execution steps to prevent duplicate calls
        memory: {
          thread: conversationId,
          resource: userId,
        },
        requestContext,
        system: [
          'ALWAYS WAIT FOR TOOLS AND WORKFLOWS FINISHED TO GENERATE A RESPONSE.',
          'DO NOT EXECUTE TWO TIMES THE SAME TOOL OR WORKFLOW IN A ROW.',
          `⚠️ CRITICAL: Current full date is ${now.toISOString()}`,
        ].join('\n'),
      });

      // Extract response text
      return result.text;
    } catch (error) {
      this.logger.error(
        `Failed to generate response for user ${userId}`,
        error,
      );
      return error.message || "Failed to generate response for user";
    } finally {
      await this.closeMastraConnections(mastra);
    }
  }

  /**
   * Closes PostgresStore connections of a Mastra instance
   */
  private async closeMastraConnections(mastra: Mastra) {
    try {
      // Access internal Mastra stores and close them
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

  /**
   * Gets AI provider configuration from attributes
   */
  private getAIProviderConfig(aiConfig: any): AIProviderConfig | null {
    if (!aiConfig) {
      this.logger.warn('No AI configuration found in organization attributes.ai');
      return null;
    }

    // Validate and return configuration
    try {
      return this.agentFactory.validateConfig(aiConfig);
    } catch (error) {
      this.logger.error('Invalid AI configuration:', error);
      return null;
    }
  }

  /**
   * Gets Mastra service statistics
   */
  getStats() {
    return {
      message: 'Mastra instances are created on-demand for better scalability',
      pgvectorEnabled: !!process.env.MASTRA_DATABASE_URL,
    };
  }
}
