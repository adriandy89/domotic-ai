import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Plus, Trash2, Loader2, Save, HeartPulse } from 'lucide-react';
import { useRulesStore } from '../store/useRulesStore';
import type {
  CreateRuleRequest,
  Condition,
  Result,
  Operation,
  ResultType,
  NotificationChannel,
  RuleType,
} from '../store/useRulesStore';
import { useHomesStore } from '../store/useHomesStore';
import { useDevicesStore, type DeviceExpose } from '../store/useDevicesStore';
import {
  getDeviceExposes as deviceExposes,
  getPublishableExposes as devicePublishableExposes,
  flattenExposes,
  hasExpose,
} from '../lib/device-capabilities';
import {
  RULE_TEMPLATES,
  PRESENCE_ATTRIBUTES,
  LOW_BATTERY_ADDON,
  SILENT_ADDON,
  DURATION_UNIT_SECONDS,
  isAbsenceOperation,
  secondsToDuration,
  secondsToIntervalParts,
  durationToSeconds,
  ruleHasCareSignals,
  type RuleTemplate,
  type DurationUnit,
} from '../lib/rule-templates';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

// Operations by expose type
const OPERATION_OPTIONS: Record<string, Operation[]> = {
  binary: ['EQ', 'INACTIVE'],
  numeric: ['EQ', 'GT', 'GTE', 'LT', 'LTE'],
  enum: ['EQ'],
  composite: ['EQ'],
  text: ['EQ'],
};

const OPERATION_LABELS: Record<Operation, { label: string; symbol: string }> = {
  EQ: { label: 'Equal', symbol: '=' },
  NEQ: { label: 'Not Equal', symbol: '≠' },
  GT: { label: 'Greater Than', symbol: '>' },
  LT: { label: 'Less Than', symbol: '<' },
  GTE: { label: 'Greater or Equal', symbol: '≥' },
  LTE: { label: 'Less or Equal', symbol: '≤' },
  CONTAINS: { label: 'Contains', symbol: '∋' },
  INACTIVE: { label: 'Inactive for', symbol: '⏳' },
  STALE: { label: 'No report for', symbol: '📡' },
};

const DURATION_UNITS: DurationUnit[] = ['minutes', 'hours', 'days'];

const RESULT_TYPES: { value: ResultType; label: string }[] = [
  { value: 'COMMAND', label: 'Send Action' },
  { value: 'NOTIFICATION', label: 'Notification Only' },
];

const NOTIFICATION_CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'PUSH', label: 'App' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'WEBHOOK', label: 'Webhook' },
];

export default function RuleFormPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const {
    getRuleById,
    createRule,
    updateRule,
    currentRule,
    isLoading,
    clearCurrentRule,
  } = useRulesStore();
  const { homes, homeIds } = useHomesStore();
  const { devices, devicesByHome, fetchDevices } = useDevicesStore();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ruleType, setRuleType] = useState<RuleType>('RECURRENT');
  const [interval, setInterval] = useState(0);
  // Display-only unit selector for `interval` (stored value is always seconds).
  const [intervalValue, setIntervalValue] = useState(0);
  const [intervalUnit, setIntervalUnit] = useState<DurationUnit>('minutes');
  const [active, setActive] = useState(true);
  const [all, setAll] = useState(true);
  const [homeId, setHomeId] = useState('');
  const [conditions, setConditions] = useState<Omit<Condition, 'id'>[]>([]);
  const [results, setResults] = useState<Omit<Result, 'id'>[]>([]);

  // Care/Wellness template state (creation only)
  const [activeTemplate, setActiveTemplate] = useState<RuleTemplate | null>(
    null,
  );
  const [addonLowBattery, setAddonLowBattery] = useState(false);
  const [addonSilent, setAddonSilent] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  // Load rule data for edit mode
  useEffect(() => {
    if (isEditMode && id) {
      getRuleById(id);
    }
    return () => {
      clearCurrentRule();
    };
  }, [id, isEditMode, getRuleById, clearCurrentRule]);

  // Ensure devices store is hydrated for the device pickers.
  useEffect(() => {
    if (Object.keys(devices).length === 0) {
      fetchDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Populate form when rule is loaded
  useEffect(() => {
    if (currentRule && isEditMode) {
      setName(currentRule.name);
      setDescription(currentRule.description || '');
      setRuleType(currentRule.type);
      setInterval(currentRule.interval);
      const parts = secondsToIntervalParts(currentRule.interval);
      setIntervalValue(parts.value);
      setIntervalUnit(parts.unit);
      setActive(currentRule.active);
      setAll(currentRule.all);
      setHomeId(currentRule.home_id);

      const loaded = currentRule.conditions.map(({ id: _id, ...rest }) => rest);
      // For care rules, lift the add-on conditions (low-battery / silent) back
      // into their toggles so editing shows the same clean UI as creation,
      // instead of raw extra condition rows. New rules tag add-ons with
      // `data.addon`; legacy rows are detected positionally (any non-primary
      // battery-LT / STALE condition).
      const careRule = ruleHasCareSignals({
        conditions: loaded.map((c) => ({ operation: c.operation })),
        results: currentRule.results,
      });
      if (careRule) {
        let lowBat = false;
        let silent = false;
        const base = loaded.filter((c, i) => {
          const marker = (c.data as { addon?: string } | undefined)?.addon;
          const isLowBat =
            marker === 'lowBattery' ||
            (marker === undefined &&
              i > 0 &&
              c.operation === 'LT' &&
              c.attribute === LOW_BATTERY_ADDON.attribute);
          const isSilent =
            marker === 'silent' ||
            (marker === undefined && i > 0 && c.operation === 'STALE');
          if (isLowBat) {
            lowBat = true;
            return false;
          }
          if (isSilent) {
            silent = true;
            return false;
          }
          return true;
        });
        setConditions(base);
        setAddonLowBattery(lowBat);
        setAddonSilent(silent);
      } else {
        setConditions(loaded);
      }

      setResults(currentRule.results.map(({ id: _id, ...rest }) => rest));
      const recipients = currentRule.results
        .map((r) => (r.data?.recipients as string[] | undefined) || [])
        .find((arr) => arr.length > 0);
      setRecipientEmail(recipients?.join(', ') || '');
    }
  }, [currentRule, isEditMode]);

  // Get home list
  const homeList = useMemo(() => {
    return homeIds.map((hId) => homes[hId]).filter(Boolean);
  }, [homeIds, homes]);

  // Get devices for selected home
  const homeDevices = useMemo(() => {
    if (!homeId) return [];
    const deviceIds = devicesByHome[homeId] || [];
    return deviceIds.map((dId) => devices[dId]).filter(Boolean);
  }, [homeId, devicesByHome, devices]);

  // Devices offered in the pickers, narrowed by the active template's focus
  // (presence sensors / battery devices). Falls back to all if none match.
  const pickerDevices = useMemo(() => {
    if (!activeTemplate || activeTemplate.deviceFilter === 'any')
      return homeDevices;
    const wanted =
      activeTemplate.deviceFilter === 'presence'
        ? PRESENCE_ATTRIBUTES
        : ['battery'];
    const filtered = homeDevices.filter((d) => hasExpose(d, wanted));
    return filtered.length > 0 ? filtered : homeDevices;
  }, [activeTemplate, homeDevices]);

  // Care context: a template is active or the rule already uses absence ops.
  const isCareContext = useMemo(
    () =>
      !!activeTemplate ||
      conditions.some((c) => isAbsenceOperation(c.operation)) ||
      // Low-battery care rules carry no absence op; an external recipient still
      // marks them as care so the care card stays available when editing.
      recipientEmail.trim() !== '',
    [activeTemplate, conditions, recipientEmail],
  );

  // The device the add-on conditions attach to (the primary condition's device).
  const primaryDeviceId = conditions[0]?.device_id || '';

  // Get device exposes by device ID (protocol-agnostic, flattened for the pickers)
  const getDeviceExposes = useCallback(
    (deviceId: string): DeviceExpose[] => {
      const device = devices[deviceId];
      return device ? flattenExposes(deviceExposes(device)) : [];
    },
    [devices],
  );

  // Get publishable exposes for a device (for results/commands)
  const getPublishableDeviceExposes = useCallback(
    (deviceId: string): DeviceExpose[] => {
      const device = devices[deviceId];
      return device ? devicePublishableExposes(device) : [];
    },
    [devices],
  );

  // Get expose by attribute name
  const getExpose = useCallback(
    (deviceId: string, attribute: string): DeviceExpose | null => {
      const exposes = getDeviceExposes(deviceId);
      return (
        exposes.find((e) => e.property === attribute || e.name === attribute) ||
        null
      );
    },
    [getDeviceExposes],
  );

  // Get operations for an expose type
  const getOperationsForExpose = (expose: DeviceExpose | null): Operation[] => {
    if (!expose) return ['EQ'];
    return OPERATION_OPTIONS[expose.type] || ['EQ'];
  };

  // Helper to get device name by ID
  const getDeviceName = (deviceId: string) => {
    return devices[deviceId]?.name || '';
  };

  // Add condition
  const addCondition = () => {
    setConditions([
      ...conditions,
      { device_id: '', attribute: '', operation: 'EQ', data: { value: '' } },
    ]);
  };

  // Remove condition
  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  // Update condition
  const updateCondition = (index: number, field: string, value: unknown) => {
    setConditions(
      conditions.map((c, i) => {
        if (i !== index) return c;
        const updated = { ...c, [field]: value };
        const isAbsence = isAbsenceOperation(updated.operation);
        // Reset dependent fields when device changes — but keep absence
        // semantics (duration, active target) intact for care conditions.
        if (field === 'device_id') {
          if (isAbsence) {
            // For INACTIVE on a presence sensor, auto-pick the presence attribute.
            if (updated.operation === 'INACTIVE') {
              const exposes = getDeviceExposes(value as string);
              const match = exposes.find(
                (e) =>
                  PRESENCE_ATTRIBUTES.includes(e.property) ||
                  PRESENCE_ATTRIBUTES.includes(e.name),
              );
              updated.attribute = match?.property || match?.name || '';
            }
          } else {
            updated.attribute = '';
            updated.operation = 'EQ';
            updated.data = { value: '' };
          }
        }
        // Reset operation and value when attribute changes (non-absence only)
        if (field === 'attribute' && !isAbsence) {
          updated.operation = 'EQ';
          updated.data = { value: '' };
        }
        return updated;
      }),
    );
  };

  // Add result
  const addResult = () => {
    setResults([
      ...results,
      {
        device_id: '',
        event: '',
        type: 'NOTIFICATION',
        attribute: '',
        data: { value: '' },
        channel: [],
      },
    ]);
  };

  // Remove result
  const removeResult = (index: number) => {
    setResults(results.filter((_, i) => i !== index));
  };

  // Update result
  const updateResult = (index: number, field: string, value: unknown) => {
    setResults(
      results.map((r, i) => {
        if (i !== index) return r;
        const updated = { ...r, [field]: value };
        // Reset fields when type changes
        if (field === 'type') {
          updated.device_id = '';
          updated.attribute = '';
          updated.data = { value: '' };
          if (value === 'NOTIFICATION') {
            updated.channel = [];
          }
        }
        // Reset attribute and value when device changes
        if (field === 'device_id') {
          updated.attribute = '';
          updated.data = { value: '' };
        }
        return updated;
      }),
    );
  };

  // Apply a care template: prefill name + a primary condition + an email
  // notification result. Device & timings are then tuned by the user.
  const applyTemplate = (template: RuleTemplate) => {
    setActiveTemplate(template);
    setName(t(template.nameKey));
    setRuleType('RECURRENT');
    setAll(true);
    setAddonLowBattery(false);
    setAddonSilent(false);

    const data: Record<string, unknown> = {};
    if (isAbsenceOperation(template.operation)) {
      data.forSeconds = template.defaultForSeconds ?? 12 * 3600;
      if (template.activeValue !== undefined) data.value = template.activeValue;
    } else {
      data.value = template.defaultValue ?? 20;
    }

    setConditions([
      {
        device_id: '',
        attribute: template.attribute ?? '',
        operation: template.operation,
        data,
      },
    ]);
    setResults([
      {
        device_id: '',
        event: t(template.eventKey),
        type: 'NOTIFICATION',
        attribute: '',
        data: { value: '' },
        channel: ['EMAIL'],
      },
    ]);
  };

  // Handle home change - clear conditions and results when home changes
  const handleHomeChange = (newHomeId: string) => {
    if (newHomeId !== homeId) {
      setHomeId(newHomeId);
      // Clear conditions and results since devices are home-specific, then
      // re-seed the active care template (its device picker is now valid).
      if (activeTemplate) {
        applyTemplate(activeTemplate);
      } else {
        setConditions([]);
        setResults([]);
      }
    }
  };

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    const hasValidConditions = conditions.some((c) => {
      if (isAbsenceOperation(c.operation)) {
        if (!c.device_id || !(Number(c.data?.forSeconds) > 0)) return false;
        // INACTIVE tracks a specific attribute; STALE watches the whole device.
        return c.operation === 'INACTIVE' ? !!c.attribute : true;
      }
      return (
        c.device_id &&
        c.attribute &&
        c.data?.value !== '' &&
        c.data?.value !== undefined
      );
    });
    const hasValidResults = results.some((r) =>
      r.type === 'NOTIFICATION'
        ? r.event && r.channel && r.channel.length > 0
        : r.device_id &&
          r.attribute &&
          r.data?.value !== '' &&
          r.data?.value !== undefined,
    );
    return (
      name.trim() !== '' &&
      homeId !== '' &&
      hasValidConditions &&
      hasValidResults &&
      interval >= 0
    );
  }, [name, homeId, conditions, results, interval]);

  // Handle submit
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('rules.form.toast.nameRequired'));
      return;
    }
    if (!homeId) {
      toast.error(t('rules.form.toast.selectHome'));
      return;
    }
    if (conditions.length === 0) {
      toast.error(t('rules.form.toast.conditionRequired'));
      return;
    }
    // INACTIVE needs an attribute to track activity against; reject empty ones
    // so we never persist a silently-broken "no motion" condition.
    const missingAttr = conditions.find(
      (c) => c.operation === 'INACTIVE' && c.device_id && !c.attribute,
    );
    if (missingAttr) {
      toast.error(t('rules.form.toast.attributeRequired'));
      return;
    }
    if (results.length === 0) {
      toast.error(t('rules.form.toast.resultRequired'));
      return;
    }

    // Parse external caregiver recipients (comma-separated emails).
    const recipients = recipientEmail
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Base conditions: INACTIVE needs an attribute; STALE watches the whole
    // device so it doesn't.
    const baseConditions = conditions.filter((c) =>
      isAbsenceOperation(c.operation)
        ? c.operation === 'INACTIVE'
          ? c.device_id && c.attribute
          : c.device_id
        : c.device_id && c.attribute,
    );

    // Add-on conditions toggled in the care card, attached to the primary
    // device. Tagged with `data.addon` so editing can lift them back into their
    // toggles. Rebuilt on every save (create and edit) for idempotency.
    const addonConditions: Omit<Condition, 'id'>[] = [];
    if (addonLowBattery && primaryDeviceId) {
      addonConditions.push({
        device_id: primaryDeviceId,
        attribute: LOW_BATTERY_ADDON.attribute,
        operation: LOW_BATTERY_ADDON.operation,
        data: { value: LOW_BATTERY_ADDON.value, addon: 'lowBattery' },
      });
    }
    if (addonSilent && primaryDeviceId) {
      addonConditions.push({
        device_id: primaryDeviceId,
        attribute: '',
        operation: SILENT_ADDON.operation,
        data: { forSeconds: SILENT_ADDON.forSeconds, addon: 'silent' },
      });
    }

    const finalConditions = [...baseConditions, ...addonConditions];
    // Any add-on means "alert if primary OR add-on" → OR semantics.
    const useAll = addonConditions.length > 0 ? false : all;

    const data: CreateRuleRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      type: ruleType,
      interval,
      active,
      all: useAll,
      home_id: homeId,
      conditions: finalConditions,
      results: results
        .filter((r) =>
          r.type === 'NOTIFICATION' ? r.event : r.device_id && r.attribute,
        )
        .map(({ recipients: _drop, ...r }) => {
          if (r.type === 'NOTIFICATION') {
            // Ensure EMAIL is enabled when an external recipient is set.
            const channel =
              recipients.length > 0 && !r.channel.includes('EMAIL')
                ? [...r.channel, 'EMAIL' as NotificationChannel]
                : r.channel;
            // Recipients live inside `data` (no dedicated column).
            return {
              ...r,
              device_id: undefined,
              attribute: undefined,
              data: recipients.length > 0 ? { recipients } : undefined,
              channel,
            };
          }
          return {
            ...r,
            device_id: !r.device_id ? undefined : r.device_id,
            attribute: !r.attribute ? undefined : r.attribute,
            data: !r.data?.value ? undefined : r.data,
          };
        }),
    };

    let success = false;
    if (isEditMode && id) {
      success = await updateRule(id, data);
      if (success) toast.success(t('rules.form.toast.updated'));
    } else {
      success = await createRule(data);
      if (success) toast.success(t('rules.form.toast.created'));
    }

    if (success) {
      navigate('/rules');
    }
  };

  if (isLoading && isEditMode && !currentRule) {
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
        <Button variant="ghost" size="icon" onClick={() => navigate('/rules')}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isEditMode ? t('rules.form.editTitle') : t('rules.form.createTitle')}
        </h1>
      </div>

      {/* Template band (creation only) */}
      {!isEditMode && (
        <Card className="bg-card/40 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-500" />
              {t('rules.templates.title')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('rules.templates.subtitle')}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {RULE_TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                const selected = activeTemplate?.id === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    title={t(tpl.descKey)}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                      selected
                        ? 'border-rose-500/60 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'border-border bg-background/50 hover:bg-accent/50',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t(tpl.labelKey)}
                  </button>
                );
              })}
              {activeTemplate && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTemplate(null);
                    setConditions([]);
                    setResults([]);
                    setAddonLowBattery(false);
                    setAddonSilent(false);
                  }}
                  className="flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
                >
                  {t('rules.templates.blank')}
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Basic Info */}
      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">{t('rules.form.basicInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('rules.form.name')}</Label>
              <Input
                id="name"
                placeholder={t('rules.form.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="home">{t('rules.form.home')}</Label>
              <Select
                value={homeId}
                onValueChange={handleHomeChange}
                disabled={isEditMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('rules.form.selectHome')}>
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
          <div className="space-y-2">
            <Label htmlFor="description">{t('rules.form.description')}</Label>
            <Input
              id="description"
              placeholder={t('rules.form.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">{t('rules.form.type')}</Label>
              <Select
                value={ruleType}
                onValueChange={(v: string) => setRuleType(v as RuleType)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {ruleType === 'RECURRENT'
                      ? t('rules.form.recurrent')
                      : t('rules.form.once')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECURRENT">
                    {t('rules.form.recurrent')}
                  </SelectItem>
                  <SelectItem value="ONCE">{t('rules.form.once')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Care rules are evaluated by the watchdog on a timer, which
                ignores `interval` — hide it to avoid a no-op field. */}
            {!isCareContext && (
              <div className="space-y-2">
                <Label htmlFor="interval">{t('rules.form.waitSeconds')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="interval"
                    type="number"
                    min={0}
                    className="flex-1"
                    value={intervalValue}
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      setIntervalValue(v);
                      setInterval(v * DURATION_UNIT_SECONDS[intervalUnit]);
                    }}
                  />
                  <Select
                    value={intervalUnit}
                    onValueChange={(u: string) => {
                      const unit = u as DurationUnit;
                      setIntervalUnit(unit);
                      setInterval(intervalValue * DURATION_UNIT_SECONDS[unit]);
                    }}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue>
                        {t('rules.form.unit.' + intervalUnit)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        ['seconds', 'minutes', 'hours', 'days'] as DurationUnit[]
                      ).map((u) => (
                        <SelectItem key={u} value={u}>
                          {t('rules.form.unit.' + u)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="flex items-center gap-6 pt-6">
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <Label>{t('rules.form.active')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={all} onCheckedChange={setAll} />
                <Label>
                  {all ? t('rules.form.allMatch') : t('rules.form.anyMatch')}
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card className="bg-card/40 border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('rules.form.conditions')}</CardTitle>
          <Button size="sm" onClick={addCondition}>
            <Plus className="w-4 h-4 mr-1" /> {t('rules.form.add')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {conditions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              {t('rules.form.noConditions')}
            </p>
          ) : (
            conditions.map((condition, index) => {
              const exposes = condition.device_id
                ? getDeviceExposes(condition.device_id)
                : [];
              const selectedExpose =
                condition.device_id && condition.attribute
                  ? getExpose(condition.device_id, condition.attribute)
                  : null;
              const isAbsence = isAbsenceOperation(condition.operation);
              // Union the type-based ops with absence ops + the current op so a
              // pre-set STALE/INACTIVE stays selectable even without an expose.
              const availableOps = Array.from(
                new Set<Operation>([
                  ...getOperationsForExpose(selectedExpose),
                  'STALE',
                  condition.operation,
                ]),
              );
              const duration = secondsToDuration(
                Number(condition.data?.forSeconds) || 0,
              );

              return (
                <div
                  key={index}
                  className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                    {/* Device Select */}
                    <Select
                      value={condition.device_id}
                      onValueChange={(v: string) =>
                        updateCondition(index, 'device_id', v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('rules.form.device')}>
                          {condition.device_id
                            ? getDeviceName(condition.device_id)
                            : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {pickerDevices.map((device) => (
                          <SelectItem key={device.id} value={device.id}>
                            {device.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Attribute Select */}
                    <Select
                      value={condition.attribute}
                      onValueChange={(v: string) =>
                        updateCondition(index, 'attribute', v)
                      }
                      disabled={!condition.device_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('rules.form.attribute')}>
                          {condition.attribute || null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {exposes.map((expose) => (
                          <SelectItem
                            key={expose.property || expose.name}
                            value={expose.property || expose.name}
                          >
                            {expose.label || expose.property || expose.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operation Select */}
                    <Select
                      value={condition.operation}
                      onValueChange={(v: string) =>
                        updateCondition(index, 'operation', v)
                      }
                      // Absence ops (STALE) can have no attribute, so gate on the
                      // device instead; value-based ops still need an attribute.
                      disabled={
                        isAbsence ? !condition.device_id : !condition.attribute
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {condition.operation
                            ? `${OPERATION_LABELS[condition.operation]?.symbol || ''} ${t('rules.form.op.' + condition.operation)}`
                            : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availableOps.map((op) => (
                          <SelectItem key={op} value={op}>
                            {OPERATION_LABELS[op]?.symbol}{' '}
                            {t('rules.form.op.' + op)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value Input - depends on expose type */}
                    {isAbsence ? (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={1}
                          className="flex-1"
                          value={duration.value}
                          onChange={(e) =>
                            updateCondition(index, 'data', {
                              ...condition.data,
                              forSeconds: durationToSeconds(
                                Number(e.target.value) || 1,
                                duration.unit,
                              ),
                            })
                          }
                        />
                        <Select
                          value={duration.unit}
                          onValueChange={(u: string) =>
                            updateCondition(index, 'data', {
                              ...condition.data,
                              forSeconds: durationToSeconds(
                                duration.value,
                                u as DurationUnit,
                              ),
                            })
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue>
                              {t('rules.form.unit.' + duration.unit)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {DURATION_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {t('rules.form.unit.' + u)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : selectedExpose?.type === 'binary' ? (
                      <Select
                        value={String(condition.data?.value || '')}
                        onValueChange={(v: string) => {
                          const val =
                            v === 'true' ? true : v === 'false' ? false : v;
                          updateCondition(index, 'data', { value: val });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('rules.form.value')}>
                            {condition.data?.value !== undefined
                              ? String(condition.data.value)
                              : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            value={String(selectedExpose.value_on ?? 'true')}
                          >
                            {String(selectedExpose.value_on ?? 'ON')}
                          </SelectItem>
                          <SelectItem
                            value={String(selectedExpose.value_off ?? 'false')}
                          >
                            {String(selectedExpose.value_off ?? 'OFF')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : selectedExpose?.type === 'enum' &&
                      selectedExpose.values ? (
                      <Select
                        value={String(condition.data?.value || '')}
                        onValueChange={(v: string) =>
                          updateCondition(index, 'data', { value: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('rules.form.value')}>
                            {condition.data?.value !== undefined
                              ? String(condition.data.value)
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
                          selectedExpose?.type === 'numeric' ? 'number' : 'text'
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
                        value={String(condition.data?.value ?? '')}
                        onChange={(e) =>
                          updateCondition(index, 'data', {
                            value:
                              selectedExpose?.type === 'numeric' &&
                              e.target.value !== ''
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                        disabled={!condition.attribute}
                      />
                    )}
                    {/* INACTIVE without a resolved attribute would persist a
                        silently-broken "no motion" condition — flag it. */}
                    {condition.operation === 'INACTIVE' &&
                      condition.device_id &&
                      !condition.attribute && (
                        <p className="md:col-span-4 text-xs text-destructive">
                          {t('rules.form.attributeRequiredHint')}
                        </p>
                      )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeCondition(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Care options */}
      {isCareContext && (
        <Card className="bg-rose-500/5 border-rose-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-rose-500" />
              {t('rules.care.title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('rules.care.subtitle')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* External recipient */}
            <div className="space-y-2">
              <Label htmlFor="recipient">{t('rules.care.recipient')}</Label>
              <Input
                id="recipient"
                type="text"
                placeholder={t('rules.care.recipientPlaceholder')}
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('rules.care.recipientHint')}
              </p>
            </div>

            {/* Add-on conditions (toggles) — editable on create and edit. */}
            <div className="space-y-2 pt-2 border-t border-rose-500/10">
              <div className="flex items-center justify-between p-3 rounded-lg bg-background/40">
                <Label className="cursor-pointer font-normal">
                  {t('rules.care.addonLowBattery')}
                </Label>
                <Switch
                  checked={addonLowBattery}
                  onCheckedChange={setAddonLowBattery}
                  disabled={!primaryDeviceId}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-background/40">
                <Label className="cursor-pointer font-normal">
                  {t('rules.care.addonSilent')}
                </Label>
                <Switch
                  checked={addonSilent}
                  onCheckedChange={setAddonSilent}
                  disabled={!primaryDeviceId}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card className="bg-card/40 border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('rules.form.results')}</CardTitle>
          <Button size="sm" onClick={addResult}>
            <Plus className="w-4 h-4 mr-1" /> {t('rules.form.add')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {results.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              {t('rules.form.noResults')}
            </p>
          ) : (
            results.map((result, index) => {
              const publishableExposes = result.device_id
                ? getPublishableDeviceExposes(result.device_id)
                : [];
              const selectedExpose =
                result.device_id && result.attribute
                  ? publishableExposes.find(
                      (e) =>
                        e.property === result.attribute ||
                        e.name === result.attribute,
                    )
                  : null;

              return (
                <div
                  key={index}
                  className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      {/* Result Type */}
                      <Select
                        value={result.type}
                        onValueChange={(v: string) =>
                          updateResult(index, 'type', v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue>
                            {RESULT_TYPES.some((rt) => rt.value === result.type)
                              ? t('rules.form.resultType.' + result.type)
                              : result.type}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {RESULT_TYPES.map((rt) => (
                            <SelectItem key={rt.value} value={rt.value}>
                              {t('rules.form.resultType.' + rt.value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {result.type === 'COMMAND' ? (
                        <>
                          {/* Device Select */}
                          <Select
                            value={result.device_id || ''}
                            onValueChange={(v: string) =>
                              updateResult(index, 'device_id', v)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('rules.form.device')}>
                                {result.device_id
                                  ? getDeviceName(result.device_id)
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
                            value={result.attribute || ''}
                            onValueChange={(v: string) =>
                              updateResult(index, 'attribute', v)
                            }
                            disabled={!result.device_id}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('rules.form.attribute')}>
                                {result.attribute || null}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {publishableExposes.map((expose) => (
                                <SelectItem
                                  key={expose.property || expose.name}
                                  value={expose.property || expose.name}
                                >
                                  {expose.label ||
                                    expose.property ||
                                    expose.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Value Input */}
                          {selectedExpose?.type === 'binary' ? (
                            <Select
                              value={String(result.data?.value || '')}
                              onValueChange={(v: string) => {
                                const val =
                                  v === 'true'
                                    ? true
                                    : v === 'false'
                                      ? false
                                      : v;
                                updateResult(index, 'data', { value: val });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('rules.form.value')}>
                                  {result.data?.value !== undefined
                                    ? String(result.data.value)
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
                              value={String(result.data?.value || '')}
                              onValueChange={(v: string) =>
                                updateResult(index, 'data', { value: v })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('rules.form.value')}>
                                  {result.data?.value !== undefined
                                    ? String(result.data.value)
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
                          ) : selectedExpose?.property === 'ir_code_to_send' ||
                            selectedExpose?.name === 'ir_code_to_send' ? (
                            // IR Remote Control - show learned commands selector
                            <Select
                              value={String(result.data?.value || '')}
                              onValueChange={(v: string) =>
                                updateResult(index, 'data', { value: v })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('rules.form.selectCommand')}>
                                  {result.data?.value && result.device_id
                                    ? devices[
                                        result.device_id
                                      ]?.learned_commands?.find(
                                        (cmd) =>
                                          cmd.command === result.data?.value,
                                      )?.name || String(result.data.value)
                                    : null}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {result.device_id &&
                                devices[result.device_id]?.learned_commands
                                  ?.length ? (
                                  devices[
                                    result.device_id
                                  ]?.learned_commands?.map((cmd) => (
                                    <SelectItem
                                      key={cmd.id}
                                      value={cmd.command}
                                    >
                                      {cmd.name}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                    {t('rules.form.noLearnedCommands')}
                                  </div>
                                )}
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
                                      ? `${t('rules.form.value')} (${selectedExpose.unit})`
                                      : t('rules.form.value')
                                  : t('rules.form.value')
                              }
                              min={selectedExpose?.value_min}
                              max={selectedExpose?.value_max}
                              step={selectedExpose?.value_step || 1}
                              value={String(result.data?.value ?? '')}
                              onChange={(e) =>
                                updateResult(index, 'data', {
                                  value:
                                    selectedExpose?.type === 'numeric' &&
                                    e.target.value !== ''
                                      ? Number(e.target.value)
                                      : e.target.value,
                                })
                              }
                              disabled={!result.attribute}
                            />
                          )}
                        </>
                      ) : (
                        <>
                          {/* Notification Event Message */}
                          <Input
                            placeholder={t('rules.form.eventMessage')}
                            value={result.event}
                            onChange={(e) =>
                              updateResult(index, 'event', e.target.value)
                            }
                            className="md:col-span-2"
                          />
                          {/* Channel Multi-Select */}
                          <div className="flex flex-wrap gap-3 items-center">
                            {NOTIFICATION_CHANNELS.map((ch) => (
                              <label
                                key={ch.value}
                                className="flex items-center gap-1.5 text-sm cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    result.channel?.includes(ch.value) || false
                                  }
                                  onChange={(e) => {
                                    const currentChannels =
                                      result.channel || [];
                                    const newChannels = e.target.checked
                                      ? [...currentChannels, ch.value]
                                      : currentChannels.filter(
                                          (c) => c !== ch.value,
                                        );
                                    updateResult(index, 'channel', newChannels);
                                  }}
                                  className="h-4 w-4 rounded border-border"
                                />
                                {t('common.channel.' + ch.value)}
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeResult(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button variant="outline" onClick={() => navigate('/rules')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={isLoading || !isFormValid}>
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isEditMode ? t('rules.form.update') : t('rules.form.createTitle')}
        </Button>
      </div>
    </div>
  );
}
