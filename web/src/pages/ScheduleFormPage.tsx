import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
// import { useTranslation } from 'react-i18next';
import { Bell, ChevronLeft, Loader2, Save, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Switch } from '../components/ui/switch';
import { getPublishableExposes } from '../lib/device-capabilities';
import { cn } from '../lib/utils';
import { useDevicesStore, type DeviceExpose } from '../store/useDevicesStore';
import { useHomesStore } from '../store/useHomesStore';
import type {
  CreateScheduleRequest,
  NotificationChannel,
  ScheduleAction,
  ScheduleDay,
  ScheduleFrequency,
} from '../store/useSchedulesStore';
import { useSchedulesStore } from '../store/useSchedulesStore';

const FREQUENCIES: { value: ScheduleFrequency; label: string; hint: string }[] =
  [
    {
      value: 'ONCE',
      label: 'One time',
      hint: 'Run only once at the date/time',
    },
    { value: 'DAILY', label: 'Daily', hint: 'Run every day at the same time' },
    {
      value: 'CUSTOM',
      label: 'Custom days',
      hint: 'Run on selected days of the week',
    },
  ];

const DAYS: { value: ScheduleDay; short: string; full: string }[] = [
  { value: 'MONDAY', short: 'Mon', full: 'Monday' },
  { value: 'TUESDAY', short: 'Tue', full: 'Tuesday' },
  { value: 'WEDNESDAY', short: 'Wed', full: 'Wednesday' },
  { value: 'THURSDAY', short: 'Thu', full: 'Thursday' },
  { value: 'FRIDAY', short: 'Fri', full: 'Friday' },
  { value: 'SATURDAY', short: 'Sat', full: 'Saturday' },
  { value: 'SUNDAY', short: 'Sun', full: 'Sunday' },
];

// const DAY_KEY: Record<
//   ScheduleDay,
//   'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
// > = {
//   SUNDAY: 'sun',
//   MONDAY: 'mon',
//   TUESDAY: 'tue',
//   WEDNESDAY: 'wed',
//   THURSDAY: 'thu',
//   FRIDAY: 'fri',
//   SATURDAY: 'sat',
// };

const NOTIFICATION_CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'PUSH', label: 'App' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'WEBHOOK', label: 'Webhook' },
];

const NOTIFICATION_ATTRIBUTE = '__notification__';

// Helper to convert Date <-> "YYYY-MM-DDTHH:mm" format used by the input
function toLocalInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputValueToISO(local: string): string | null {
  if (!local) return null;
  // local is "YYYY-MM-DDTHH:mm", interpret as local time
  return new Date(local).toISOString();
}

export default function ScheduleFormPage() {
  // const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const {
    getScheduleById,
    createSchedule,
    updateSchedule,
    currentSchedule,
    isLoading,
    clearCurrentSchedule,
  } = useSchedulesStore();
  const { homes, homeIds } = useHomesStore();
  const { devices, devicesByHome, fetchDevices } = useDevicesStore();

  // Form state
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [frequency, setFrequency] = useState<ScheduleFrequency>('DAILY');
  const [date, setDate] = useState<string>(''); // local input value
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [channel, setChannel] = useState<NotificationChannel[]>([]);
  const [homeId, setHomeId] = useState('');
  const [actions, setActions] = useState<Omit<ScheduleAction, 'id'>[]>([]);

  // Load schedule for edit mode
  useEffect(() => {
    if (isEditMode && id) {
      getScheduleById(id);
    }
    return () => {
      clearCurrentSchedule();
    };
  }, [id, isEditMode, getScheduleById, clearCurrentSchedule]);

  // Ensure the devices store is hydrated so device pickers have data.
  useEffect(() => {
    if (Object.keys(devices).length === 0) {
      fetchDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Populate form when schedule is loaded
  useEffect(() => {
    if (currentSchedule && isEditMode) {
      setName(currentSchedule.name);
      setActive(currentSchedule.active);
      setFrequency(currentSchedule.frequency);
      setDate(toLocalInputValue(currentSchedule.date));
      setDays(currentSchedule.days);
      setChannel(currentSchedule.channel);
      setHomeId(currentSchedule.home_id);
      setActions(
        currentSchedule.actions.map((a) => ({
          device_id: a.device_id ?? null,
          attribute: a.attribute,
          data: a.data,
        })),
      );
    }
  }, [currentSchedule, isEditMode]);

  const homeList = useMemo(
    () => homeIds.map((hId) => homes[hId]).filter(Boolean),
    [homeIds, homes],
  );

  const homeDevices = useMemo(() => {
    if (!homeId) return [];
    const ids = devicesByHome[homeId] || [];
    return ids.map((d) => devices[d]).filter(Boolean);
  }, [homeId, devicesByHome, devices]);

  const getPublishableDeviceExposes = useCallback(
    (deviceId: string): DeviceExpose[] => {
      const device = devices[deviceId];
      return device ? getPublishableExposes(device) : [];
    },
    [devices],
  );

  const getDeviceName = (deviceId: string) => devices[deviceId]?.name || '';

  // Action handlers
  const addAction = () => {
    setActions([
      ...actions,
      { device_id: '', attribute: '', data: { value: '' } },
    ]);
  };

  const addNotificationAction = () => {
    setActions([
      ...actions,
      {
        device_id: null,
        attribute: NOTIFICATION_ATTRIBUTE,
        data: { value: '' },
      },
    ]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, field: string, value: unknown) => {
    setActions(
      actions.map((a, i) => {
        if (i !== index) return a;
        const updated = { ...a, [field]: value };
        if (field === 'device_id') {
          updated.attribute = '';
          updated.data = { value: '' };
        }
        if (field === 'attribute') {
          updated.data = { value: '' };
        }
        return updated;
      }),
    );
  };

  const handleHomeChange = (newHomeId: string) => {
    if (newHomeId !== homeId) {
      setHomeId(newHomeId);
      // device-level actions become invalid if home changes
      setActions(actions.filter((a) => a.attribute === NOTIFICATION_ATTRIBUTE));
    }
  };

  const toggleDay = (day: ScheduleDay) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleChannel = (ch: NotificationChannel) => {
    setChannel((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  };

  const hasNotificationAction = actions.some(
    (a) => a.attribute === NOTIFICATION_ATTRIBUTE,
  );

  const isFormValid = useMemo(() => {
    if (!name.trim() || !homeId) return false;
    // date required for ONCE, optional for DAILY/CUSTOM (default = run on next match? require for now)
    if (!date) return false;
    if (frequency === 'CUSTOM' && days.length === 0) return false;
    if (actions.length === 0) return false;
    // device actions need device_id + attribute + value
    const validActions = actions.every((a) => {
      if (a.attribute === NOTIFICATION_ATTRIBUTE) {
        // notification needs at least 1 channel and a message in data.value
        return (
          channel.length > 0 &&
          typeof a.data?.value === 'string' &&
          a.data.value.trim() !== ''
        );
      }
      return (
        !!a.device_id &&
        !!a.attribute &&
        a.data?.value !== '' &&
        a.data?.value !== undefined
      );
    });
    return validActions;
  }, [name, homeId, date, frequency, days, actions, channel]);

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error('Name is required');
    if (!homeId) return toast.error('Please select a home');
    if (!date) return toast.error('Date/time is required');
    if (frequency === 'CUSTOM' && days.length === 0)
      return toast.error('Pick at least one day for custom schedules');
    if (actions.length === 0) return toast.error('Add at least one action');

    if (hasNotificationAction && channel.length === 0) {
      return toast.error('Notification actions need at least one channel');
    }

    const payload: CreateScheduleRequest = {
      name: name.trim(),
      active,
      date: localInputValueToISO(date),
      frequency,
      days: frequency === 'CUSTOM' ? days : [],
      channel: hasNotificationAction ? channel : [],
      home_id: homeId,
      actions: actions.map((a) => ({
        device_id:
          a.attribute === NOTIFICATION_ATTRIBUTE ? null : a.device_id || null,
        attribute: a.attribute,
        data: a.data,
      })),
    };

    let success = false;
    if (isEditMode && id) {
      success = await updateSchedule(id, payload);
      if (success) toast.success('Schedule updated');
    } else {
      success = await createSchedule(payload);
      if (success) toast.success('Schedule created');
    }
    if (success) navigate('/schedules');
  };

  if (isLoading && isEditMode && !currentSchedule) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/schedules')}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isEditMode ? 'Edit Schedule' : 'Create Schedule'}
        </h1>
      </div>

      {/* Basic Info */}
      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="Turn off bedroom lights at night"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="home">Home *</Label>
              <Select
                value={homeId}
                onValueChange={handleHomeChange}
                disabled={isEditMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select home">
                    {homeId ? homes[homeId]?.name : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {homeList.map((home) => (
                    <SelectItem key={home.id} value={home.id}>
                      {home.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>Active</Label>
          </div>
        </CardContent>
      </Card>

      {/* When */}
      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">When to run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Frequency selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                onClick={() => setFrequency(f.value)}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all',
                  frequency === f.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card/30 hover:bg-card/60',
                )}
              >
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {f.hint}
                </div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">
                {frequency === 'ONCE' ? 'Date and time *' : 'Time anchor *'}
              </Label>
              <Input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {frequency === 'ONCE'
                  ? 'The schedule fires once at this exact moment.'
                  : 'Only the time-of-day matters for recurrent schedules.'}
              </p>
            </div>
          </div>

          {/* Day picker for CUSTOM */}
          {frequency === 'CUSTOM' && (
            <div className="space-y-2">
              <Label>Days of week *</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                      days.includes(d.value)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card/30 hover:bg-card/60 text-muted-foreground',
                    )}
                    type="button"
                  >
                    {d.short}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {days.length === 0
                  ? 'Pick at least one day.'
                  : `${days.length} day${days.length !== 1 ? 's' : ''} selected.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="bg-card/40 border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Actions to run</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addNotificationAction}>
              <Bell className="w-4 h-4 mr-1" /> Notification
            </Button>
            <Button size="sm" onClick={addAction}>
              <Send className="w-4 h-4 mr-1" /> Device action
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              No actions yet. Add a device action or a notification.
            </p>
          ) : (
            actions.map((action, index) => {
              const isNotif = action.attribute === NOTIFICATION_ATTRIBUTE;
              const publishableExposes = action.device_id
                ? getPublishableDeviceExposes(action.device_id)
                : [];
              const selectedExpose =
                action.device_id && action.attribute
                  ? publishableExposes.find(
                      (e) =>
                        e.property === action.attribute ||
                        e.name === action.attribute,
                    )
                  : null;

              return (
                <div
                  key={index}
                  className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    {isNotif ? (
                      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-2 items-start">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 text-amber-500 text-sm font-medium whitespace-nowrap">
                          <Bell className="w-4 h-4" />
                          Notification
                        </div>
                        <Input
                          placeholder="Notification message..."
                          value={String(action.data?.value ?? '')}
                          onChange={(e) =>
                            updateAction(index, 'data', {
                              value: e.target.value,
                            })
                          }
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {/* Device Select */}
                        <Select
                          value={action.device_id ?? ''}
                          onValueChange={(v) =>
                            updateAction(index, 'device_id', v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Device">
                              {action.device_id
                                ? getDeviceName(action.device_id)
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {homeDevices.map((device) => (
                              <SelectItem key={device.id} value={device.id}>
                                {device.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Attribute Select */}
                        <Select
                          value={action.attribute || ''}
                          onValueChange={(v) =>
                            updateAction(index, 'attribute', v)
                          }
                          disabled={!action.device_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Attribute">
                              {action.attribute || null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {publishableExposes.map((expose) => (
                              <SelectItem
                                key={expose.property || expose.name}
                                value={expose.property || expose.name}
                              >
                                {expose.label || expose.property || expose.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Value Input */}
                        {selectedExpose?.type === 'binary' ? (
                          <Select
                            value={String(action.data?.value ?? '')}
                            onValueChange={(v) => {
                              const val =
                                v === 'true' ? true : v === 'false' ? false : v;
                              updateAction(index, 'data', { value: val });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Value">
                                {action.data?.value !== undefined
                                  ? String(action.data.value)
                                  : null}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem
                                value={String(
                                  selectedExpose.value_on ?? 'true',
                                )}
                              >
                                {String(selectedExpose.value_on ?? 'ON')}
                              </SelectItem>
                              <SelectItem
                                value={String(
                                  selectedExpose.value_off ?? 'false',
                                )}
                              >
                                {String(selectedExpose.value_off ?? 'OFF')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : selectedExpose?.type === 'enum' &&
                          selectedExpose.values ? (
                          <Select
                            value={String(action.data?.value ?? '')}
                            onValueChange={(v) =>
                              updateAction(index, 'data', { value: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Value">
                                {action.data?.value !== undefined
                                  ? String(action.data.value)
                                  : null}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {selectedExpose.values.map((val) => (
                                <SelectItem key={val} value={val}>
                                  {val}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={
                              selectedExpose?.type === 'numeric'
                                ? 'number'
                                : 'text'
                            }
                            placeholder={
                              selectedExpose?.type === 'numeric'
                                ? selectedExpose.value_min !== undefined ||
                                  selectedExpose.value_max !== undefined
                                  ? `${selectedExpose.value_min ?? 0} - ${selectedExpose.value_max ?? '∞'}${selectedExpose.unit ? ` ${selectedExpose.unit}` : ''}`
                                  : selectedExpose.unit
                                    ? `Value (${selectedExpose.unit})`
                                    : 'Value'
                                : 'Value'
                            }
                            min={selectedExpose?.value_min}
                            max={selectedExpose?.value_max}
                            step={selectedExpose?.value_step || 1}
                            value={String(action.data?.value ?? '')}
                            onChange={(e) =>
                              updateAction(index, 'data', {
                                value: e.target.value,
                              })
                            }
                            disabled={!action.attribute}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeAction(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Notification channels (only if any notification action) */}
      {hasNotificationAction && (
        <Card className="bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              Notification channels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Pick where notifications will be delivered. At least one is
              required when there is a notification action.
            </p>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_CHANNELS.map((ch) => (
                <button
                  key={ch.value}
                  onClick={() => toggleChannel(ch.value)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm transition-all',
                    channel.includes(ch.value)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card/30 hover:bg-card/60 text-muted-foreground',
                  )}
                  type="button"
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Submit */}
      <div className="flex items-center justify-end gap-4">
        <Button variant="outline" onClick={() => navigate('/schedules')}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isLoading || !isFormValid}>
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isEditMode ? 'Update Schedule' : 'Create Schedule'}
        </Button>
      </div>
    </div>
  );
}
