import { Bot, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { Button } from '../ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Switch } from '../ui/switch';

type AiProvider = 'openai' | 'google' | 'openrouter';

interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  enabled: boolean;
  temperature?: number;
  maxTokens?: number;
}

interface ProviderMeta {
  label: string;
  apiKeyHint: string;
  apiKeyPlaceholder: string;
  apiKeyUrl: string;
  modelHint: string;
  models: string[];
  defaultModel: string;
}

const PROVIDER_META: Record<AiProvider, ProviderMeta> = {
  openai: {
    label: 'OpenAI',
    apiKeyHint: 'Get one at platform.openai.com → API keys',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    modelHint: 'e.g. gpt-4.1-mini, gpt-5-mini',
    defaultModel: 'gpt-4.1-mini',
    models: [
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
  },
  google: {
    label: 'Google Gemini',
    apiKeyHint: 'Get one at Google AI Studio',
    apiKeyPlaceholder: 'AI...',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    modelHint: 'e.g. gemini-2.5-flash, gemini-2.5-pro',
    defaultModel: 'gemini-2.5-flash',
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    apiKeyHint:
      'Get one at openrouter.ai → Keys. Model id must include vendor (e.g. "anthropic/claude-haiku-4.5").',
    apiKeyPlaceholder: 'sk-or-v1-...',
    apiKeyUrl: 'https://openrouter.ai/keys',
    modelHint: 'e.g. anthropic/claude-haiku-4.5, openai/gpt-4o-mini',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      'openai/gpt-4o-mini',
      'openai/gpt-5-mini',
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4.5',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat-v3.1',
      'z-ai/glm-4.6',
    ],
  },
};

const SUPPORTED_PROVIDERS: AiProvider[] = ['openai', 'google', 'openrouter'];

function maskApiKey(key?: string): string {
  if (!key) return 'Not set';
  if (key.length < 10) return '••••';
  return `${key.substring(0, 4)}…${key.substring(key.length - 4)}`;
}

export default function AiConfigCard() {
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
  const [aiSaveError, setAiSaveError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [editingAiConfig, setEditingAiConfig] = useState<AiConfig>({
    provider: 'openai',
    model: PROVIDER_META.openai.defaultModel,
    apiKey: '',
    enabled: true,
    temperature: 0.4,
    maxTokens: 4000,
  });

  const isAdmin = user?.role === 'ADMIN';

  const fetchAiConfig = async () => {
    try {
      const response = await api.get('/users/org/attributes/ai');
      if (response.data?.ai) {
        const configData = response.data.ai as AiConfig;

        // Sanitize: if the persisted provider is no longer supported (e.g. legacy
        // 'anthropic'), fall back to OpenAI defaults so the UI never shows an
        // option the backend can't honor.
        const provider: AiProvider = SUPPORTED_PROVIDERS.includes(
          configData.provider as AiProvider,
        )
          ? (configData.provider as AiProvider)
          : 'openai';

        setAiConfig({ ...configData, provider });
        setEditingAiConfig({
          ...configData,
          provider,
          model: configData.model || PROVIDER_META[provider].defaultModel,
          temperature: configData.temperature ?? 0.4,
          maxTokens: configData.maxTokens ?? 4000,
          apiKey: '', // Clear API key for security when editing
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch AI config', error);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAiConfig();
    }
  }, [isAdmin]);

  const validationError = useMemo(() => {
    if (!editingAiConfig.model.trim()) return 'Model is required.';
    if (
      editingAiConfig.provider === 'openrouter' &&
      !editingAiConfig.model.includes('/')
    ) {
      return 'OpenRouter model must include vendor prefix, e.g. "anthropic/claude-haiku-4.5".';
    }
    if (!editingAiConfig.apiKey && !aiConfig?.apiKey) {
      return 'API key is required.';
    }
    if (
      editingAiConfig.temperature !== undefined &&
      (editingAiConfig.temperature < 0 || editingAiConfig.temperature > 2)
    ) {
      return 'Temperature must be between 0 and 2.';
    }
    return null;
  }, [editingAiConfig, aiConfig]);

  const handleProviderChange = (next: AiProvider) => {
    const meta = PROVIDER_META[next];
    setEditingAiConfig((prev) => ({
      ...prev,
      provider: next,
      // If the current model isn't valid for the new provider, switch to the default.
      // Heuristic: openrouter requires "/", openai/google require no slash.
      model:
        next === 'openrouter'
          ? prev.model.includes('/')
            ? prev.model
            : meta.defaultModel
          : prev.model.includes('/')
            ? meta.defaultModel
            : prev.model || meta.defaultModel,
      apiKey: '', // Force re-entry when switching provider
    }));
    setAiSaveError(null);
  };

  const handleUpdateAiConfig = async () => {
    if (validationError) {
      setAiSaveError(validationError);
      return;
    }
    try {
      setLoading(true);
      setAiSaveError(null);

      const payload: AiConfig = { ...editingAiConfig };
      if (!payload.apiKey && aiConfig?.apiKey) {
        payload.apiKey = aiConfig.apiKey;
      }

      await api.put('/users/org/attributes/ai', payload);
      await fetchAiConfig();
      setIsAiConfigOpen(false);
    } catch (error: any) {
      console.error('Failed to update AI config', error);
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Failed to update AI configuration.';
      setAiSaveError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">AI Configuration</CardTitle>
          <CardDescription>
            Configure the AI provider for your organization.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiConfig ? (
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {PROVIDER_META[aiConfig.provider]?.label ?? aiConfig.provider}
                </span>
                <span className="text-muted-foreground text-sm">
                  · {aiConfig.model}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {maskApiKey(aiConfig.apiKey)}
              </p>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${aiConfig.enabled ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="text-xs text-muted-foreground">
                  {aiConfig.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setShowApiKey(false);
                setAiSaveError(null);
                setIsAiConfigOpen(true);
              }}
            >
              Edit
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-4">
              No AI configuration found
            </p>
            <Button
              onClick={() => {
                setShowApiKey(false);
                setAiSaveError(null);
                setIsAiConfigOpen(true);
              }}
            >
              Configure AI
            </Button>
          </div>
        )}

        <Dialog
          open={isAiConfigOpen}
          onOpenChange={(open) => {
            setIsAiConfigOpen(open);
            if (!open) {
              setAiSaveError(null);
              setShowApiKey(false);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>AI Configuration</DialogTitle>
              <DialogDescription>
                Pick a provider and model. Each organization brings its own API
                key.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              {/* Provider */}
              <div className="grid gap-2">
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={editingAiConfig.provider}
                  onValueChange={(value) =>
                    handleProviderChange(value as AiProvider)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PROVIDER_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model — combobox-ish: dropdown with suggestions + free text */}
              <div className="grid gap-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  list="ai-model-suggestions"
                  value={editingAiConfig.model}
                  onChange={(e) =>
                    setEditingAiConfig({
                      ...editingAiConfig,
                      model: e.target.value,
                    })
                  }
                  placeholder={PROVIDER_META[editingAiConfig.provider].modelHint}
                />
                <datalist id="ai-model-suggestions">
                  {PROVIDER_META[editingAiConfig.provider].models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  {PROVIDER_META[editingAiConfig.provider].modelHint}
                </p>
              </div>

              {/* API key */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="apiKey">API Key</Label>
                  <a
                    href={PROVIDER_META[editingAiConfig.provider].apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Get a key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? 'text' : 'password'}
                    value={editingAiConfig.apiKey || ''}
                    onChange={(e) =>
                      setEditingAiConfig({
                        ...editingAiConfig,
                        apiKey: e.target.value,
                      })
                    }
                    placeholder={
                      aiConfig?.apiKey
                        ? `Current: ${maskApiKey(aiConfig.apiKey)} (leave empty to keep)`
                        : PROVIDER_META[editingAiConfig.provider]
                            .apiKeyPlaceholder
                    }
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showApiKey ? 'Hide key' : 'Show key'}
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {PROVIDER_META[editingAiConfig.provider].apiKeyHint}
                </p>
              </div>

              {/* Advanced */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="temperature">
                    Temperature ({editingAiConfig.temperature ?? 0.4})
                  </Label>
                  <Input
                    id="temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={editingAiConfig.temperature ?? 0.4}
                    onChange={(e) =>
                      setEditingAiConfig({
                        ...editingAiConfig,
                        temperature: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="maxTokens">Max output tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    min={1}
                    max={200000}
                    step={100}
                    value={editingAiConfig.maxTokens ?? ''}
                    onChange={(e) =>
                      setEditingAiConfig({
                        ...editingAiConfig,
                        maxTokens: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="optional"
                  />
                </div>
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3">
                <div>
                  <Label htmlFor="ai-enabled">Enable AI Assistant</Label>
                  <p className="text-xs text-muted-foreground">
                    Disabling stops the chat assistant for the whole
                    organization.
                  </p>
                </div>
                <Switch
                  id="ai-enabled"
                  checked={editingAiConfig.enabled}
                  onCheckedChange={(checked) =>
                    setEditingAiConfig({
                      ...editingAiConfig,
                      enabled: checked,
                    })
                  }
                />
              </div>

              {/* Validation / save errors */}
              {(aiSaveError || validationError) && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {aiSaveError ?? validationError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAiConfigOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdateAiConfig}
                disabled={loading || !!validationError}
              >
                {loading ? 'Saving...' : 'Save Configuration'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
