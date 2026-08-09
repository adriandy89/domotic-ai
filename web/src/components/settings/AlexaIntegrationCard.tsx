import {
  Copy,
  Eye,
  EyeOff,
  Link2,
  Link2Off,
  Loader2,
  Mic,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
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

interface AlexaClient {
  id: string;
  client_id: string;
  name: string;
  redirect_uris: string[];
  disabled: boolean;
  created_at: string;
  updated_at: string | null;
}

interface AlexaStatus {
  client: AlexaClient | null;
  linked: boolean;
  last_linked_at: string | null;
  is_org_admin: boolean;
}

interface SecretResponse {
  client_secret: string;
  record: AlexaClient;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const AUTHORIZE_URL = `${API_BASE}/alexa/oauth/authorize`;
const TOKEN_URL = `${API_BASE}/alexa/oauth/token`;

export default function AlexaIntegrationCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AlexaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createName, setCreateName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [savingUris, setSavingUris] = useState(false);

  const [secret, setSecret] = useState<SecretResponse | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AlexaStatus>('/users/me/integrations/alexa');
      setStatus(res.data);
      setRedirectUris(res.data.client?.redirect_uris.join('\n') ?? '');
    } catch {
      setError(t('settings.alexa.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<SecretResponse>(
        '/users/me/integrations/alexa/client',
        { name: createName.trim(), redirect_uris: [] },
      );
      setSecret(res.data);
      setShowSecret(false);
      setCreateName('');
      await load();
    } catch {
      setError(t('settings.alexa.createError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveUris() {
    setSavingUris(true);
    setError(null);
    try {
      const uris = redirectUris
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);
      await api.patch('/users/me/integrations/alexa/client', {
        redirect_uris: uris,
      });
      await load();
    } catch {
      setError(t('settings.alexa.redirectUrisError'));
    } finally {
      setSavingUris(false);
    }
  }

  async function handleRotate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<SecretResponse>(
        '/users/me/integrations/alexa/client/rotate-secret',
      );
      setSecret(res.data);
      setShowSecret(false);
    } catch {
      setError(t('settings.alexa.rotateError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/users/me/integrations/alexa/client');
      setConfirmDelete(false);
      await load();
    } catch {
      setError(t('settings.alexa.deleteError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/users/me/integrations/alexa/link');
      await load();
    } catch {
      setError(t('settings.alexa.unlinkError'));
    } finally {
      setBusy(false);
    }
  }

  function copy(value: string, field: string) {
    void navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1200);
  }

  function copyableRow(label: string, value: string, field: string) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <div className="flex gap-2">
          <Input value={value} readOnly className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => copy(value, field)}
            title={t('settings.alexa.copy')}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {copiedField === field && (
          <p className="text-xs text-muted-foreground">
            {t('settings.alexa.copied')}
          </p>
        )}
      </div>
    );
  }

  const client = status?.client ?? null;

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Mic className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">{t('settings.alexa.title')}</CardTitle>
          <CardDescription>{t('settings.alexa.description')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('common.loading')}
          </div>
        ) : (
          <>
            {/* Personal link state (every member) */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3">
              <div className="flex items-center gap-2 text-sm">
                {status?.linked ? (
                  <>
                    <Link2 className="h-4 w-4 text-emerald-500" />
                    <span>{t('settings.alexa.linked')}</span>
                    {status.last_linked_at && (
                      <span className="text-xs text-muted-foreground">
                        {t('settings.alexa.linkedSince', {
                          date: new Date(status.last_linked_at).toLocaleString(),
                        })}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Link2Off className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {t('settings.alexa.notLinked')}
                    </span>
                  </>
                )}
              </div>
              {status?.linked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnlink}
                  disabled={busy}
                >
                  {t('settings.alexa.unlink')}
                </Button>
              )}
            </div>

            {/* Org client management (admin) or read-only hint */}
            {status?.is_org_admin ? (
              client ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.alexa.clientCreated', {
                          date: new Date(client.created_at).toLocaleString(),
                        })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRotate}
                        disabled={busy}
                        title={t('settings.alexa.rotateSecret')}
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(true)}
                        title={t('settings.alexa.deleteClient')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {copyableRow(
                    t('settings.alexa.clientId'),
                    client.client_id,
                    'client_id',
                  )}
                  {copyableRow(
                    t('settings.alexa.authorizationUri'),
                    AUTHORIZE_URL,
                    'authorize',
                  )}
                  {copyableRow(t('settings.alexa.tokenUri'), TOKEN_URL, 'token')}

                  <div className="space-y-1">
                    <Label htmlFor="alexa-redirects">
                      {t('settings.alexa.redirectUris')}
                    </Label>
                    <textarea
                      id="alexa-redirects"
                      className="w-full min-h-20 rounded-md border border-border bg-background/50 p-2 font-mono text-xs"
                      placeholder={
                        'https://layla.amazon.com/api/skill/link/…\nhttps://pitangui.amazon.com/api/skill/link/…\nhttps://alexa.amazon.co.jp/api/skill/link/…'
                      }
                      value={redirectUris}
                      onChange={(e) => setRedirectUris(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t('settings.alexa.redirectUrisHint')}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveUris}
                        disabled={savingUris}
                      >
                        {savingUris ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t('common.save')
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    {t('settings.alexa.noClient')}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder={t('settings.alexa.namePlaceholder')}
                      maxLength={80}
                    />
                    <Button
                      onClick={handleCreate}
                      disabled={busy || !createName.trim()}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('settings.alexa.createClient')
                      )}
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                {client
                  ? t('settings.alexa.memberHint')
                  : t('settings.alexa.askAdmin')}
              </p>
            )}

            {/* Runbook */}
            <details className="rounded-lg border border-border/50 bg-background/50 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {t('settings.alexa.setupInstructions')}
              </summary>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>{t('settings.alexa.setupStep1')}</li>
                <li>{t('settings.alexa.setupStep2')}</li>
                <li>{t('settings.alexa.setupStep3')}</li>
                <li>{t('settings.alexa.setupStep4')}</li>
                <li>{t('settings.alexa.setupStep5')}</li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                <Trans
                  i18nKey="settings.alexa.setupDocs"
                  components={{
                    a: (
                      // eslint-disable-next-line jsx-a11y/anchor-has-content
                      <a
                        href="https://github.com/anukys/domotic-ai/blob/main/docs/alexa-integration-guide.md"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      />
                    ),
                  }}
                />
              </p>
            </details>
          </>
        )}
      </CardContent>

      {/* One-time secret dialog */}
      <Dialog open={!!secret} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings.alexa.secretTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.alexa.secretDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>{t('settings.alexa.clientId')}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={secret?.record.client_id ?? ''}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    secret && copy(secret.record.client_id, 'dlg-id')
                  }
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('settings.alexa.clientSecret')}</Label>
              <div className="relative">
                <Input
                  readOnly
                  value={secret?.client_secret ?? ''}
                  type={showSecret ? 'text' : 'password'}
                  className="font-mono text-xs pr-20"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground"
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
                      secret && copy(secret.client_secret, 'dlg-secret')
                    }
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {(copiedField === 'dlg-secret' || copiedField === 'dlg-id') && (
                <p className="text-xs text-muted-foreground">
                  {t('settings.alexa.copied')}
                </p>
              )}
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('settings.alexa.secretWarning')}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>
              {t('settings.alexa.savedIt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.alexa.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.alexa.deleteDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('settings.alexa.deleteClient')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
