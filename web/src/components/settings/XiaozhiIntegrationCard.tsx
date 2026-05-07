import {
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { Switch } from '../ui/switch';
import { api } from '../../lib/api';

const ENDPOINT_REGEX =
  /^wss:\/\/api\.xiaozhi\.me\/mcp\/\?token=[A-Za-z0-9._\-]+$/;

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface XiaozhiIntegrationRow {
  id: string;
  name: string;
  endpoint_prefix: string;
  enabled: boolean;
  connection_state: ConnectionState;
  last_error: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  created_at: string;
  updated_at: string | null;
}

const STATE_COLORS: Record<ConnectionState, string> = {
  idle: 'bg-muted-foreground',
  connecting: 'bg-amber-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
};

const STATE_LABELS: Record<ConnectionState, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export default function XiaozhiIntegrationCard() {
  const [rows, setRows] = useState<XiaozhiIntegrationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEndpoint, setCreateEndpoint] = useState('');
  const [showEndpoint, setShowEndpoint] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<XiaozhiIntegrationRow | null>(
    null,
  );

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void load();
    pollRef.current = setInterval(() => void load(true), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const res = await api.get<XiaozhiIntegrationRow[]>(
        '/users/me/integrations/xiaozhi',
      );
      setRows(res.data);
    } catch {
      if (!silent) setError('Could not load Xiaozhi integrations');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleCreate() {
    setCreateError(null);
    if (!createName.trim()) {
      setCreateError('Name is required');
      return;
    }
    if (!ENDPOINT_REGEX.test(createEndpoint.trim())) {
      setCreateError(
        'Endpoint must be wss://api.xiaozhi.me/mcp/?token=…',
      );
      return;
    }
    setCreating(true);
    try {
      await api.post('/users/me/integrations/xiaozhi', {
        name: createName.trim(),
        endpoint: createEndpoint.trim(),
      });
      setIsCreateOpen(false);
      setCreateName('');
      setCreateEndpoint('');
      setShowEndpoint(false);
      await load();
    } catch {
      setCreateError('Could not create integration');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(row: XiaozhiIntegrationRow) {
    setBusyId(row.id);
    try {
      await api.patch(`/users/me/integrations/xiaozhi/${row.id}`, {
        enabled: !row.enabled,
      });
      await load();
    } catch {
      setError('Could not update integration');
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(row: XiaozhiIntegrationRow) {
    setBusyId(row.id);
    try {
      await api.post(`/users/me/integrations/xiaozhi/${row.id}/test`);
      setTimeout(() => void load(true), 2000);
    } catch {
      setError('Could not test integration');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: XiaozhiIntegrationRow) {
    setBusyId(row.id);
    try {
      await api.delete(`/users/me/integrations/xiaozhi/${row.id}`);
      setDeleteTarget(null);
      await load();
    } catch {
      setError('Could not delete integration');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Plug className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">Xiaozhi.me Integration</CardTitle>
          <CardDescription>
            Let your xiaozhi.me account control this smart home through the same
            secure tools.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Each integration is one outbound WebSocket from this server to
            xiaozhi.me.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setCreateError(null);
              setCreateName('');
              setCreateEndpoint('');
              setShowEndpoint(false);
              setIsCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New integration
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-3 text-sm">
              No Xiaozhi integrations yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
            >
              Add your first integration
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border/50 divide-y divide-border/50 bg-background/50">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${STATE_COLORS[row.connection_state]}`}
                      title={
                        row.last_error
                          ? `${STATE_LABELS[row.connection_state]} — ${row.last_error}`
                          : STATE_LABELS[row.connection_state]
                      }
                    />
                    <p className="font-medium text-sm">{row.name}</p>
                    {!row.enabled && (
                      <span className="text-xs text-muted-foreground">
                        (disabled)
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground truncate">
                    {row.endpoint_prefix}…
                  </p>
                  {row.last_error && row.connection_state === 'error' && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {row.last_error}
                    </p>
                  )}
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:gap-6 gap-1 text-xs text-muted-foreground">
                  <span>Connected: {formatDate(row.last_connected_at)}</span>
                  <span>Created: {formatDate(row.created_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={row.enabled}
                    onCheckedChange={() => handleToggle(row)}
                    disabled={busyId === row.id}
                    title={row.enabled ? 'Disable' : 'Enable'}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTest(row)}
                    disabled={busyId === row.id || !row.enabled}
                    title="Reconnect / Test"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(row)}
                    disabled={busyId === row.id}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <details className="rounded-lg border border-border/50 bg-background/50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Setup instructions
          </summary>
          <div className="space-y-3 mt-3 text-sm text-muted-foreground">
            <p>
              1. In your Xiaozhi.me account, generate an MCP endpoint URL — it
              looks like{' '}
              <code className="text-xs">
                wss://api.xiaozhi.me/mcp/?token=…
              </code>
              .
            </p>
            <p>
              2. Paste it into "+ New integration" above. The token is encrypted
              at rest before being stored.
            </p>
            <p>
              3. Once enabled, this server opens a long-lived WebSocket to
              xiaozhi and exposes the 19 smart-home tools (devices, sensors,
              schedules, rules, IR remote, weather). Xiaozhi's LLM can call
              them on your behalf.
            </p>
            <p className="text-amber-600 dark:text-amber-400">
              Safety: tools include destructive actions (delete schedule/rule,
              send commands). xiaozhi may invoke them without per-action
              confirmation. Disable or delete the integration to revoke access.
            </p>
          </div>
        </details>
      </CardContent>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Xiaozhi integration</DialogTitle>
            <DialogDescription>
              Give the integration a name and paste your xiaozhi.me MCP
              endpoint.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="xz-name">Name</Label>
              <Input
                id="xz-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Living-room xiaozhi"
                autoFocus
                maxLength={80}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="xz-endpoint">Endpoint URL</Label>
              <div className="relative">
                <Input
                  id="xz-endpoint"
                  value={createEndpoint}
                  onChange={(e) => setCreateEndpoint(e.target.value)}
                  placeholder="wss://api.xiaozhi.me/mcp/?token=…"
                  type={showEndpoint ? 'text' : 'password'}
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEndpoint((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
                  aria-label={showEndpoint ? 'Hide endpoint' : 'Show endpoint'}
                >
                  {showEndpoint ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {createError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {createError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Add'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete integration</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.name}" will be disconnected and deleted. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={busyId === deleteTarget?.id}
            >
              {busyId === deleteTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
