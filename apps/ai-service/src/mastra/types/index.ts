import { z } from 'zod';

/**
 * Supported AI providers.
 *
 * We use Mastra's Model Router (string id `provider/model` + optional `apiKey`/`headers`),
 * so each provider listed here corresponds to a route Mastra knows.
 *
 * - `openai`     → e.g. "openai/gpt-4.1-mini"
 * - `google`     → e.g. "google/gemini-2.5-flash"
 * - `openrouter` → e.g. "openrouter/anthropic/claude-haiku-4.5" (model id always includes the upstream vendor)
 */
export const SUPPORTED_PROVIDERS = ['openai', 'google', 'openrouter'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Provider-specific options. Only the keys recognized by Mastra for each provider.
 * Anything else is rejected by the schema to keep configs clean.
 */
const ProviderOptionsSchema = z.object({
  // OpenAI: see https://mastra.ai/models/providers/openai
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  parallelToolCalls: z.boolean().optional(),

  // Google: thinkingConfig + safetySettings (we keep them as `unknown` since the shape changes per model)
  thinkingConfig: z
    .object({
      thinkingBudget: z.number().optional(),
      includeThoughts: z.boolean().optional(),
    })
    .partial()
    .optional(),
  safetySettings: z
    .array(
      z.object({
        category: z.string(),
        threshold: z.string(),
      }),
    )
    .optional(),

  // OpenRouter: optional attribution headers per https://openrouter.ai/docs/api-reference/overview
  httpReferer: z.string().url().optional(),
  appTitle: z.string().max(120).optional(),
});

export type AIProviderOptions = z.infer<typeof ProviderOptionsSchema>;

/**
 * The provider config persisted at `organization.attributes.ai`.
 *
 * Validation rules per provider (enforced in `refine` below):
 *  - `apiKey` is required (we do not fall back to env vars at runtime — orgs bring their own key).
 *  - `model` is required.
 *  - For `openrouter`, `model` must contain `/` (e.g. `anthropic/claude-haiku-4.5`).
 */
export const AIProviderConfigSchema = z
  .object({
    provider: z.enum(SUPPORTED_PROVIDERS),
    model: z.string().min(1, 'model is required'),
    apiKey: z.string().min(8, 'apiKey is required'),

    // Generation parameters (passed through to `agent.generate`)
    temperature: z.number().min(0).max(2).default(0.5),
    maxTokens: z.number().int().min(1).max(200_000).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(0).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    seed: z.number().int().optional(),
    stopSequences: z.array(z.string()).optional(),

    providerOptions: ProviderOptionsSchema.optional(),

    enabled: z.boolean().default(true),
    maxRetries: z.number().int().min(0).max(10).default(2),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.provider === 'openrouter' && !cfg.model.includes('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['model'],
        message:
          'OpenRouter model must include vendor prefix, e.g. "anthropic/claude-haiku-4.5"',
      });
    }
  });

export type AIProviderConfig = z.infer<typeof AIProviderConfigSchema>;

/**
 * Defaults per provider (used by the frontend / when seeding a new org).
 * Models here are the ones Mastra exposes as of writing — see `models/providers/*` in Mastra docs.
 */
export const DEFAULT_AI_PROVIDER_CONFIGS: Record<
  SupportedProvider,
  Pick<AIProviderConfig, 'provider' | 'model' | 'temperature' | 'maxTokens' | 'enabled'>
> = {
  openai: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    temperature: 0.4,
    maxTokens: 4000,
    enabled: true,
  },
  google: {
    provider: 'google',
    model: 'gemini-2.5-flash',
    temperature: 0.4,
    maxTokens: 8000,
    enabled: true,
  },
  openrouter: {
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    temperature: 0.4,
    maxTokens: 4000,
    enabled: true,
  },
};

/**
 * Curated suggestions surfaced in the UI dropdown. The user can still type any model id.
 * For OpenRouter we list the most common backends; the actual catalog is much larger.
 */
export const AVAILABLE_MODELS: Record<SupportedProvider, string[]> = {
  openai: [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'o4-mini',
  ],
  google: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
  ],
  openrouter: [
    'openai/gpt-4o-mini',
    'openai/gpt-5-mini',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-sonnet-4.5',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat-v3.1',
    'z-ai/glm-4.6',
  ],
};

/**
 * Human-readable provider metadata for the UI.
 */
export const PROVIDER_META: Record<
  SupportedProvider,
  {
    label: string;
    apiKeyHint: string;
    apiKeyPlaceholder: string;
    apiKeyUrl: string;
    docsUrl: string;
    modelHint: string;
  }
> = {
  openai: {
    label: 'OpenAI',
    apiKeyHint: 'Get one at platform.openai.com → API keys',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/models',
    modelHint: 'e.g. gpt-4.1-mini, gpt-5-mini',
  },
  google: {
    label: 'Google Gemini',
    apiKeyHint: 'Get one at Google AI Studio',
    apiKeyPlaceholder: 'AI...',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    modelHint: 'e.g. gemini-2.5-flash, gemini-2.5-pro',
  },
  openrouter: {
    label: 'OpenRouter',
    apiKeyHint: 'Get one at openrouter.ai → Keys. Model id must be vendor/model.',
    apiKeyPlaceholder: 'sk-or-v1-...',
    apiKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/models',
    modelHint: 'e.g. anthropic/claude-haiku-4.5, openai/gpt-4o-mini',
  },
};

/**
 * Structure of attributes in the Organization table.
 */
export interface OrganizationAttributes {
  ai?: AIProviderConfig;
  [key: string]: unknown;
}
