import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Plus, Trash2, Loader2, Save } from 'lucide-react';
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
} from '../lib/device-capabilities';
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
import { toast } from 'sonner';

// Operations by expose type
const OPERATION_OPTIONS: Record<string, Operation[]> = {
  binary: ['EQ'],
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
};

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
  const [active, setActive] = useState(true);
  const [all, setAll] = useState(true);
  const [homeId, setHomeId] = useState('');
  const [conditions, setConditions] = useState<Omit<Condition, 'id'>[]>([]);
  const [results, setResults] = useState<Omit<Result, 'id'>[]>([]);

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
      setActive(currentRule.active);
      setAll(currentRule.all);
      setHomeId(currentRule.home_id);
      setConditions(currentRule.conditions.map(({ id: _id, ...rest }) => rest));
      setResults(currentRule.results.map(({ id: _id, ...rest }) => rest));
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
        // Reset dependent fields when device changes
        if (field === 'device_id') {
          updated.attribute = '';
          updated.operation = 'EQ';
          updated.data = { value: '' };
        }
        // Reset operation and value when attribute changes
        if (field === 'attribute') {
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

  // Handle home change - clear conditions and results when home changes
  const handleHomeChange = (newHomeId: string) => {
    if (newHomeId !== homeId) {
      setHomeId(newHomeId);
      // Clear conditions and results since devices are home-specific
      setConditions([]);
      setResults([]);
    }
  };

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    const hasValidConditions = conditions.some(
      (c) =>
        c.device_id &&
        c.attribute &&
        c.data?.value !== '' &&
        c.data?.value !== undefined,
    );
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
    if (results.length === 0) {
      toast.error(t('rules.form.toast.resultRequired'));
      return;
    }

    const data: CreateRuleRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      type: ruleType,
      interval,
      active,
      all,
      home_id: homeId,
      conditions: conditions.filter((c) => c.device_id && c.attribute),
      results: results
        .filter((r) =>
          r.type === 'NOTIFICATION' ? r.event : r.device_id && r.attribute,
        )
        .map((r) => ({
          ...r,
          // For NOTIFICATION type, don't send device_id, attribute, or data if empty
          device_id:
            r.type === 'NOTIFICATION' || !r.device_id ? undefined : r.device_id,
          attribute:
            r.type === 'NOTIFICATION' || !r.attribute ? undefined : r.attribute,
          data:
            r.type === 'NOTIFICATION' || !r.data?.value ? undefined : r.data,
        })),
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
            <div className="space-y-2">
              <Label htmlFor="interval">{t('rules.form.waitSeconds')}</Label>
              <Input
                id="interval"
                type="number"
                min={0}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
              />
            </div>
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
              const availableOps = getOperationsForExpose(selectedExpose);

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
                        {homeDevices.map((device) => (
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
                      disabled={!condition.attribute}
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
                    {selectedExpose?.type === 'binary' ? (
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
