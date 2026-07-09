import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WashingMachine, Plus, Trash2, Pencil, Loader2 } from 'lucide-react';
import {
  useApplianceMonitorsStore,
  type ApplianceMonitor,
  type CreateApplianceMonitorRequest,
} from '../store/useApplianceMonitorsStore';
import { useHomesStore } from '../store/useHomesStore';
import { useDevicesStore } from '../store/useDevicesStore';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '../components/ui/dialog';

const APPLIANCE_TYPES = ['washing_machine', 'dishwasher', 'dryer', 'other'];

const emptyForm = (homeId: string): CreateApplianceMonitorRequest => ({
  name: '',
  home_id: homeId,
  source_device_id: '',
  appliance_type: 'washing_machine',
  power_field: 'power',
  run_threshold_w: 10,
  idle_threshold_w: 2,
  min_run_seconds: 30,
  min_finish_seconds: 120,
  active: true,
});

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

export default function ApplianceMonitorsPage() {
  const { t } = useTranslation();
  const {
    monitors,
    isLoading,
    error,
    fetchMonitors,
    createMonitor,
    updateMonitor,
    toggleMonitor,
    deleteMonitor,
  } = useApplianceMonitorsStore();
  const { homes, homeIds } = useHomesStore();
  const { fetchDevices, getDevicesByHomeId } = useDevicesStore();

  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateApplianceMonitorRequest>(emptyForm(''));

  useEffect(() => {
    fetchMonitors();
    fetchDevices();
  }, [fetchMonitors, fetchDevices]);

  const homeList = useMemo(
    () => homeIds.map((id) => homes[id]).filter(Boolean),
    [homeIds, homes],
  );

  const filtered = useMemo(
    () =>
      selectedHomeId
        ? monitors.filter((m) => m.home_id === selectedHomeId)
        : monitors,
    [monitors, selectedHomeId],
  );

  const formDevices = useMemo(
    () => (form.home_id ? getDevicesByHomeId(form.home_id) : []),
    [form.home_id, getDevicesByHomeId],
  );

  const openCreate = () => {
    const homeId = selectedHomeId ?? homeList[0]?.id ?? '';
    setForm(emptyForm(homeId));
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (m: ApplianceMonitor) => {
    setForm({
      name: m.name,
      home_id: m.home_id,
      source_device_id: m.source_device_id,
      appliance_type: m.appliance_type,
      power_field: m.power_field,
      run_threshold_w: Number(m.run_threshold_w),
      idle_threshold_w: Number(m.idle_threshold_w),
      min_run_seconds: m.min_run_seconds,
      min_finish_seconds: m.min_finish_seconds,
      active: m.active,
    });
    setEditingId(m.id);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.home_id || !form.source_device_id) return;
    const ok = editingId
      ? await updateMonitor(editingId, form)
      : await createMonitor(form);
    if (ok) setDialogOpen(false);
  };

  const setField = <K extends keyof CreateApplianceMonitorRequest>(
    key: K,
    value: CreateApplianceMonitorRequest[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <WashingMachine className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            {t('applianceMonitors.title')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {homeList.length > 1 && (
            <select
              className={selectClass + ' w-auto'}
              value={selectedHomeId ?? ''}
              onChange={(e) => setSelectedHomeId(e.target.value || null)}
            >
              <option value="">{t('applianceMonitors.allHomes')}</option>
              {homeList.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
          <Button onClick={openCreate} disabled={homeList.length === 0}>
            <Plus className="h-4 w-4 mr-1" />
            {t('applianceMonitors.new')}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground max-w-3xl">
        {t('applianceMonitors.description')}
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading && monitors.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('applianceMonitors.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-foreground">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.source_device?.name ?? m.source_device_unique_id}
                    </div>
                  </div>
                  <Badge variant={m.active ? 'default' : 'secondary'}>
                    {t(`applianceMonitors.type.${m.appliance_type}`, {
                      defaultValue: m.appliance_type,
                    })}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                  <span>
                    {t('applianceMonitors.runThresholdW')}:{' '}
                    {Number(m.run_threshold_w)}
                  </span>
                  <span>
                    {t('applianceMonitors.idleThresholdW')}:{' '}
                    {Number(m.idle_threshold_w)}
                  </span>
                  <span>
                    {t('applianceMonitors.minRunS')}: {m.min_run_seconds}
                  </span>
                  <span>
                    {t('applianceMonitors.minFinishS')}: {m.min_finish_seconds}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={m.active}
                      onCheckedChange={(v) => toggleMonitor(m.id, v)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {m.active
                        ? t('applianceMonitors.active')
                        : t('applianceMonitors.inactive')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMonitor(m.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t('applianceMonitors.editTitle')
                : t('applianceMonitors.newTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('applianceMonitors.name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder={t('applianceMonitors.namePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('applianceMonitors.home')}</Label>
                <select
                  className={selectClass}
                  value={form.home_id}
                  onChange={(e) => {
                    setField('home_id', e.target.value);
                    setField('source_device_id', '');
                  }}
                >
                  {homeList.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t('applianceMonitors.appliance')}</Label>
                <select
                  className={selectClass}
                  value={form.appliance_type}
                  onChange={(e) => setField('appliance_type', e.target.value)}
                >
                  {APPLIANCE_TYPES.map((typ) => (
                    <option key={typ} value={typ}>
                      {t(`applianceMonitors.type.${typ}`, { defaultValue: typ })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t('applianceMonitors.sourcePlug')}</Label>
              <select
                className={selectClass}
                value={form.source_device_id}
                onChange={(e) => setField('source_device_id', e.target.value)}
              >
                <option value="">
                  {t('applianceMonitors.selectPlug')}
                </option>
                {formDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t('applianceMonitors.sourcePlugHint')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('applianceMonitors.runThresholdW')}</Label>
                <Input
                  type="number"
                  value={form.run_threshold_w}
                  onChange={(e) =>
                    setField('run_threshold_w', Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('applianceMonitors.idleThresholdW')}</Label>
                <Input
                  type="number"
                  value={form.idle_threshold_w}
                  onChange={(e) =>
                    setField('idle_threshold_w', Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('applianceMonitors.minRunS')}</Label>
                <Input
                  type="number"
                  value={form.min_run_seconds}
                  onChange={(e) =>
                    setField('min_run_seconds', Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('applianceMonitors.minFinishS')}</Label>
                <Input
                  type="number"
                  value={form.min_finish_seconds}
                  onChange={(e) =>
                    setField('min_finish_seconds', Number(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.active ?? true}
                onCheckedChange={(v) => setField('active', v)}
              />
              <span className="text-sm text-muted-foreground">
                {t('applianceMonitors.active')}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={save}
              disabled={
                isLoading ||
                !form.name ||
                !form.home_id ||
                !form.source_device_id
              }
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
