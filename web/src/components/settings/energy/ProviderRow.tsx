import { Check, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { AdminPricingProvider } from '../../../store/usePricingStore';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

const PROVIDER_HELP: Record<
  string,
  { text: string; href: string; linkLabel: string }
> = {
  esios_pvpc: {
    text: 'Free personal token — request it by email from Red Eléctrica.',
    href: 'mailto:consultasios@ree.es',
    linkLabel: 'consultasios@ree.es',
  },
  entsoe: {
    text: 'Register at transparency.entsoe.eu, then email transparency@entsoe.eu with subject "Restful API access" — the token option only appears in My Account Settings after they approve it (~1-3 days).',
    href: 'mailto:transparency@entsoe.eu?subject=Restful%20API%20access',
    linkLabel: 'transparency@entsoe.eu',
  },
};

const STATUS_BADGE: Record<
  AdminPricingProvider['token_status'],
  { variant: 'success' | 'warning' | 'destructive'; label: string }
> = {
  configured: { variant: 'success', label: 'Configured' },
  not_configured: { variant: 'warning', label: 'Not configured' },
  rejected: { variant: 'destructive', label: 'Token rejected' },
};

interface ProviderRowProps {
  provider: AdminPricingProvider;
  onSave: (source: string, token: string) => Promise<boolean>;
}

export default function ProviderRow({ provider, onSave }: ProviderRowProps) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = STATUS_BADGE[provider.token_status];
  const help = PROVIDER_HELP[provider.source];

  async function handleSave() {
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    const ok = await onSave(provider.source, token.trim());
    setSaving(false);
    if (ok) {
      setToken('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError('Failed to save the token. Try again.');
    }
  }

  return (
    <div className="p-4 rounded-lg border border-border/50 bg-background/50 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{provider.label}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {provider.source}
          </p>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {provider.token_status === 'rejected' && (
        <p className="text-sm text-red-500 bg-red-500/10 p-2 rounded">
          The saved token was rejected by the provider. Save a new one to
          re-enable it.
        </p>
      )}

      {provider.token_status === 'configured' && provider.token_masked && (
        <p className="text-sm text-muted-foreground">
          Active token{' '}
          <span className="font-mono">{provider.token_masked}</span>
          {provider.token_origin === 'env' && (
            <span> · from environment variable</span>
          )}
        </p>
      )}

      <div className="space-y-1.5">
        <Label
          htmlFor={`token-${provider.source}`}
          className="text-xs text-muted-foreground"
        >
          API token
        </Label>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-56">
            <Input
              id={`token-${provider.source}`}
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                provider.token_masked
                  ? `Current: ${provider.token_masked} (enter new to replace)`
                  : 'Paste token…'
              }
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showToken ? 'Hide token' : 'Show token'}
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
            >
              {showToken ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <Button onClick={handleSave} disabled={saving || !token.trim()}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4 mr-1 text-green-500" />
            ) : null}
            {saved ? 'Saved' : 'Save token'}
          </Button>
        </div>
      </div>

      {help && (
        <p className="text-xs text-muted-foreground">
          {help.text}{' '}
          <a
            href={help.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            {help.linkLabel} <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      )}

      {error && (
        <p className="text-red-500 text-sm bg-red-500/10 p-2 rounded">{error}</p>
      )}
    </div>
  );
}
