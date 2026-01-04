import { z } from 'zod';

/**
 * Mastra support 600+ models through various providers.:
 * - Mastra Model Router (string format: "provider/model")
 * - AI SDK providers (@ai-sdk/openai, @ai-sdk/anthropic, etc.)
 */
export const AIProviderConfigSchema = z.object({
  // Provider selection - Mastra soporta todos estos y más
  provider: z
    .enum([
      'openai',
      'anthropic',
      'google',
      'azure',
      'groq',
      'mistral',
      'xai',
      'custom',
    ])
    .default('openai'),

  // Model name
  model: z.string().optional(),

  // API credentials
  apiKey: z.string().optional(),

  // Model settings (se pasan a generate())
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(100000).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().min(0).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  seed: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),

  // Provider-specific options
  providerOptions: z
    .object({
      // OpenAI-specific
      reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
      parallelToolCalls: z.boolean().optional(),

      // Anthropic-specific
      thinking: z
        .object({
          type: z.literal('enabled'),
          budgetTokens: z.number().optional(),
        })
        .optional(),

      // Google-specific
      safetySettings: z.any().optional(),

      // Mistral-specific
      safePrompt: z.boolean().optional(),

      // Azure-specific
      resourceName: z.string().optional(),
      deploymentName: z.string().optional(),

      // Custom provider
      baseURL: z.string().optional(),
    })
    .optional(),

  // General settings
  enabled: z.boolean().default(true),
  maxRetries: z.number().min(0).max(10).default(2),
});

export type AIProviderConfig = z.infer<typeof AIProviderConfigSchema>;

/**
 * Default configuration for each provider
 * Based on the official Mastra documentation
 */
export const DEFAULT_AI_PROVIDER_CONFIGS: Record<string, Partial<AIProviderConfig>> = {
  openai: {
    provider: 'openai',
    model: 'gpt-4.1-nano',
    temperature: 0.5,
    maxTokens: 4000,
    enabled: true,
  },
  anthropic: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.5,
    maxTokens: 4096,
    enabled: true,
  },
  google: {
    provider: 'google',
    model: 'gemini-2.5-flash',
    temperature: 0.5,
    maxTokens: 8000,
    enabled: true,
  },
  groq: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    maxTokens: 4000,
    enabled: true,
  },
  mistral: {
    provider: 'mistral',
    model: 'mistral-large-latest',
    temperature: 0.5,
    maxTokens: 4000,
    enabled: true,
  },
  xai: {
    provider: 'xai',
    model: 'grok-2',
    temperature: 0.5,
    maxTokens: 4000,
    enabled: true,
  },
};

/**
 * Available models by provider
 */
export const AVAILABLE_MODELS: Record<string, string[]> = {
  openai: ['gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-sonnet-4-20250514',
    'claude-3-haiku-20240307',
    'claude-3-7-sonnet-20250219',
  ],
  google: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash',
    'gemini-3-pro-preview',
    'gemini-3-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama3-70b-8192',
    'llama3-8b-8192',
    'mixtral-8x7b-32768',
    'deepseek-r1-distill-llama-70b',
  ],
  mistral: ['mistral-large-latest', 'mistral-medium', 'mistral-small'],
  xai: ['grok-2', 'grok-beta'],
  azure: [], // Los modelos de Azure dependen del deployment
  custom: [], // Para proveedores personalizados
};

/**
 * Structure of attributes in the Organization table
 */
export interface OrganizationAttributes {
  aiProvider?: AIProviderConfig;
  [key: string]: any;
}
