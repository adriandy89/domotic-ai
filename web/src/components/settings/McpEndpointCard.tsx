import { Copy, Eye, EyeOff, KeyRound, Loader2, Plug, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
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
import { api } from '../../lib/api';

interface McpTokenRow {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface CreateResponse {
  token: string;
  record: McpTokenRow;
}

const ENDPOINT_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'}/mcp`;

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleString();
}

export default function McpEndpointCard() {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<McpTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<McpTokenRow | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<McpTokenRow[]>('/users/me/mcp/tokens');
      setTokens(res.data);
    } catch {
      setError(t('settings.mcp.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await api.post<CreateResponse>('/users/me/mcp/tokens', {
        name: createName.trim(),
      });
      setIsCreateOpen(false);
      setCreateName('');
      setRevealToken(res.data.token);
      setShowSecret(false);
      setTokens((prev) => [res.data.record, ...prev]);
    } catch {
      setError(t('settings.mcp.createError'));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await api.delete(`/users/me/mcp/tokens/${id}`);
      setTokens((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t,
        ),
      );
      setRevokeTarget(null);
    } catch {
      setError(t('settings.mcp.revokeError'));
    } finally {
      setRevokingId(null);
    }
  }

  function copy(value: string, field: string) {
    void navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1200);
  }

  const activeTokens = tokens.filter((t) => !t.revoked_at);

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Plug className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">{t('settings.mcp.title')}</CardTitle>
          <CardDescription>{t('settings.mcp.description')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Endpoint URL block */}
        <div className="space-y-2">
          <Label>{t('settings.mcp.endpointUrl')}</Label>
          <div className="flex gap-2">
            <Input value={ENDPOINT_URL} readOnly className="font-mono text-sm" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copy(ENDPOINT_URL, 'endpoint')}
              title={t('settings.mcp.copyEndpoint')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {copiedField === 'endpoint' && (
            <p className="text-xs text-muted-foreground">
              {t('settings.mcp.copied')}
            </p>
          )}
        </div>

        {/* Tokens block */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                {t('settings.mcp.personalTokens')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('settings.mcp.tokensHint')}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setError(null);
                setCreateName('');
                setIsCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> {t('settings.mcp.newToken')}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center p-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />{' '}
              {t('common.loading')}
            </div>
          ) : activeTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-lg">
              <p className="text-muted-foreground mb-3 text-sm">
                {t('settings.mcp.noTokens')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  setCreateName('');
                  setIsCreateOpen(true);
                }}
              >
                {t('settings.mcp.createFirst')}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 divide-y divide-border/50 bg-background/50">
              {activeTokens.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">{row.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.token_prefix}…
                    </p>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center md:gap-6 gap-1 text-xs text-muted-foreground">
                    <span>
                      {t('settings.mcp.lastUsed', {
                        date: formatDate(row.last_used_at),
                      })}
                    </span>
                    <span>
                      {t('settings.mcp.created', {
                        date: formatDate(row.created_at),
                      })}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRevokeTarget(row)}
                    title={t('settings.mcp.revoke')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Setup instructions */}
        <details className="rounded-lg border border-border/50 bg-background/50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t('settings.mcp.setupInstructions')}
          </summary>
          <div className="space-y-3 mt-3 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">
                <Trans
                  i18nKey="settings.mcp.setupUrlOnly"
                  components={{ b: <strong /> }}
                />
              </p>
              <pre className="bg-muted/40 p-3 rounded text-xs overflow-x-auto">
{`${ENDPOINT_URL}?token=YOUR_TOKEN`}
              </pre>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.mcp.setupUrlOnlyNote')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">
                <Trans
                  i18nKey="settings.mcp.setupDesktop"
                  components={{ b: <strong />, code: <code className="text-xs" /> }}
                />
              </p>
              <pre className="bg-muted/40 p-3 rounded text-xs overflow-x-auto">
{`"mcpServers": {
  "domotic-ai": {
    "command": "npx",
    "args": ["-y", "mcp-remote",
             "${ENDPOINT_URL}",
             "--header", "Authorization: Bearer YOUR_TOKEN"]
  }
}`}
              </pre>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">
                <Trans
                  i18nKey="settings.mcp.setupInspector"
                  values={{ url: ENDPOINT_URL }}
                  components={{
                    b: <strong />,
                    em: <em />,
                    code: <code className="text-xs" />,
                  }}
                />
              </p>
            </div>
          </div>
        </details>
      </CardContent>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.mcp.createTitle')}</DialogTitle>
            <DialogDescription>{t('settings.mcp.createDesc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="mcp-name">{t('common.name')}</Label>
            <Input
              id="mcp-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t('settings.mcp.namePlaceholder')}
              autoFocus
              maxLength={80}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createName.trim()}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.create')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time-secret dialog */}
      <Dialog
        open={!!revealToken}
        onOpenChange={(open) => !open && setRevealToken(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings.mcp.tokenCreated')}</DialogTitle>
            <DialogDescription>
              {t('settings.mcp.tokenCreatedDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>{t('settings.mcp.tokenLabel')}</Label>
            <div className="relative">
              <Input
                readOnly
                value={revealToken ?? ''}
                type={showSecret ? 'text' : 'password'}
                className="font-mono text-sm pr-20"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                  aria-label={
                    showSecret
                      ? t('settings.mcp.hideToken')
                      : t('settings.mcp.showToken')
                  }
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    revealToken && copy(revealToken, 'reveal')
                  }
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                  aria-label={t('settings.mcp.copyToken')}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            {copiedField === 'reveal' && (
              <p className="text-xs text-muted-foreground">
                {t('settings.mcp.copied')}
              </p>
            )}

            <Label className="mt-3">{t('settings.mcp.urlWithToken')}</Label>
            <div className="relative">
              <Input
                readOnly
                value={
                  revealToken ? `${ENDPOINT_URL}?token=${revealToken}` : ''
                }
                type={showSecret ? 'text' : 'password'}
                className="font-mono text-xs pr-10"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    revealToken &&
                    copy(
                      `${ENDPOINT_URL}?token=${revealToken}`,
                      'reveal-url',
                    )
                  }
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                  aria-label={t('settings.mcp.copyUrl')}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            {copiedField === 'reveal-url' && (
              <p className="text-xs text-muted-foreground">
                {t('settings.mcp.copied')}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('settings.mcp.urlPasteHint')}
            </p>

            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('settings.mcp.treatLikePassword')}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealToken(null)}>
              {t('settings.mcp.savedIt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.mcp.revokeTitle')}</DialogTitle>
            <DialogDescription>
              <Trans
                i18nKey="settings.mcp.revokeDesc"
                values={{ name: revokeTarget?.name }}
                components={{ b: <strong /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => revokeTarget && handleRevoke(revokeTarget.id)}
              disabled={revokingId === revokeTarget?.id}
            >
              {revokingId === revokeTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('settings.mcp.revoke')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
