import {
  Check,
  Clock3,
  Coins,
  Loader2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import { useHomesStore } from '../../../store/useHomesStore';
import {
  SPANISH_20TD_PRESET,
  usePricingStore,
  type PricingProvider,
  type TariffMode,
  type TouPeriod,
} from '../../../store/usePricingStore';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import TouPeriodsEditor from '../TouPeriodsEditor';
import PricePreview from './PricePreview';

const MODE_OPTIONS: {
  value: TariffMode;
  label: string;
  hint: string;
  icon: typeof Coins;
}[] = [
  {
    value: 'fixed',
    label: 'Fixed price',
    hint: 'One €/kWh price for every hour',
    icon: Coins,
  },
  {
    value: 'tou',
    label: 'Time of use',
    hint: 'Manual periods (e.g. Spanish 2.0TD P1/P2/P3)',
    icon: Clock3,
  },
  {
    value: 'dynamic',
    label: 'Dynamic (market)',
    hint: 'Hourly prices from a public API (PVPC, ENTSO-E…)',
    icon: TrendingUp,
  },
];

interface TariffSectionProps {
  /** Scrolls to the providers section below (admin hint). */
  onConfigureProviders?: () => void;
}

export default function TariffSection({
  onConfigureProviders,
}: TariffSectionProps) {
  const { user } = useAuthStore();
  const { homes, homeIds, selectedHomeId } = useHomesStore();
  const { fetchProviders, fetchTariff, updateTariff } = usePricingStore();
  // Re-fetch when the cache is invalidated (e.g. an admin just saved a token).
  const providersCache = usePricingStore((s) => s.providers);

  const isAdmin = user?.role === 'ADMIN';
  const canEdit = user?.role === 'MANAGER' || isAdmin;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to the globally selected home without a state-syncing effect.
  const homeId = selectedId ?? selectedHomeId ?? homeIds[0] ?? null;
  const [providers, setProviders] = useState<PricingProvider[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = homeId != null && loadedFor !== homeId;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  // Form state
  const [mode, setMode] = useState<TariffMode>('fixed');
  const [kwhPrice, setKwhPrice] = useState('0');
  const [currency, setCurrency] = useState('EUR');
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [periods, setPeriods] = useState<TouPeriod[]>([]);
  const [provider, setProvider] = useState('');
  const [zone, setZone] = useState('');

  useEffect(() => {
    void fetchProviders().then(setProviders);
  }, [fetchProviders, providersCache]);

  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    void fetchTariff(homeId).then((tariff) => {
      if (cancelled) return;
      if (tariff) {
        setMode(tariff.mode);
        setKwhPrice(String(tariff.kwh_price ?? 0));
        setCurrency(tariff.currency ?? 'EUR');
        setTimezone(tariff.timezone ?? 'Europe/Madrid');
        setDefaultPrice(
          tariff.default_price != null ? String(tariff.default_price) : '',
        );
        setPeriods(tariff.periods ?? []);
        setProvider(tariff.provider ?? '');
        setZone(tariff.zone ?? '');
      }
      setLoadedFor(homeId);
    });
    return () => {
      cancelled = true;
    };
  }, [homeId, fetchTariff]);

  const selectedProvider = providers.find((p) => p.source === provider);
  const hasUnconfiguredProviders = providers.some((p) => !p.enabled);

  async function handleSave() {
    if (!homeId) return;
    setError(null);

    if (mode === 'tou' && periods.length === 0) {
      setError('Add at least one period (or load the 2.0TD preset).');
      return;
    }
    if (mode === 'dynamic' && (!provider || !zone)) {
      setError('Pick a provider and zone.');
      return;
    }

    setSaving(true);
    const result = await updateTariff(homeId, {
      mode,
      kwh_price: Number(kwhPrice) || 0,
      currency: currency || undefined,
      ...(mode === 'tou' && {
        timezone,
        periods,
        ...(defaultPrice !== '' && { default_price: Number(defaultPrice) }),
      }),
      ...(mode === 'dynamic' && { provider, zone }),
    });
    setSaving(false);
    if (result) {
      setSaved(true);
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(usePricingStore.getState().error ?? 'Failed to save tariff');
    }
  }

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Zap className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">Electricity tariff</CardTitle>
          <CardDescription>
            How energy consumption is priced in reports and the monthly email.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Label className="text-xs text-muted-foreground block mb-1">
              Home
            </Label>
            <Select
              value={homeId ?? ''}
              onValueChange={(value) => setSelectedId(value || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a home…">
                  {homeId ? homes[homeId]?.name : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {homeIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {homes[id]?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {loading && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mb-2" />
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!canEdit}
              onClick={() => setMode(option.value)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                mode === option.value
                  ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border/50 bg-background/50 hover:bg-accent/40'
              } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <p className="text-sm font-medium flex items-center gap-1.5">
                <option.icon className="h-4 w-4 text-primary" />
                {option.label}
                {mode === option.value && (
                  <Check className="h-3.5 w-3.5 ml-auto text-primary" />
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {option.hint}
              </p>
            </button>
          ))}
        </div>

        {mode === 'fixed' && (
          <div className="flex flex-wrap gap-3">
            <div>
              <Label className="text-xs text-muted-foreground block mb-1">
                Price per kWh
              </Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={kwhPrice}
                onChange={(e) => setKwhPrice(e.target.value)}
                disabled={!canEdit}
                className="w-32"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground block mb-1">
                Currency
              </Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                disabled={!canEdit}
                maxLength={3}
                className="w-20"
              />
            </div>
          </div>
        )}

        {mode === 'tou' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">
                  Timezone
                </Label>
                <Input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={!canEdit}
                  className="w-44"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">
                  Default price (no period match)
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  disabled={!canEdit}
                  placeholder="optional"
                  className="w-32"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">
                  Currency
                </Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  disabled={!canEdit}
                  maxLength={3}
                  className="w-20"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!canEdit}
                onClick={() => {
                  setTimezone(SPANISH_20TD_PRESET.timezone);
                  setDefaultPrice(String(SPANISH_20TD_PRESET.default_price));
                  setPeriods(SPANISH_20TD_PRESET.periods.map((p) => ({ ...p })));
                  setCurrency('EUR');
                }}
              >
                Load Spanish 2.0TD preset
              </Button>
            </div>
            <TouPeriodsEditor
              periods={periods}
              onChange={setPeriods}
              disabled={!canEdit}
            />
          </div>
        )}

        {mode === 'dynamic' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-64">
                <Label className="text-xs text-muted-foreground block mb-1">
                  Provider
                </Label>
                <Select
                  value={provider}
                  onValueChange={(value) => {
                    setProvider(value);
                    setZone('');
                  }}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a provider…">
                      {selectedProvider?.label ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem
                        key={p.source}
                        value={p.source}
                        disabled={!p.enabled}
                      >
                        <span className="flex items-center gap-2">
                          {p.label}
                          {!p.enabled && (
                            <Badge variant="warning">Not configured</Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-56">
                <Label className="text-xs text-muted-foreground block mb-1">
                  Zone
                </Label>
                <Select
                  value={zone}
                  onValueChange={setZone}
                  disabled={!canEdit || !selectedProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a zone…">
                      {selectedProvider?.zones.find((z) => z.id === zone)
                        ?.label ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedProvider?.zones ?? []).map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">
                  Fallback price per kWh
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={kwhPrice}
                  onChange={(e) => setKwhPrice(e.target.value)}
                  disabled={!canEdit}
                  className="w-32"
                />
              </div>
            </div>

            {hasUnconfiguredProviders &&
              (isAdmin ? (
                <p className="text-xs text-muted-foreground">
                  Some providers need an API token before they can be selected.{' '}
                  <button
                    type="button"
                    onClick={onConfigureProviders}
                    className="text-primary hover:underline"
                  >
                    Configure providers below
                  </button>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Greyed-out providers need an API token — ask an administrator
                  to configure them in Settings → Energy.
                </p>
              ))}

            <p className="text-xs text-muted-foreground">
              Hourly market prices (energy term, taxes excluded). Hours without
              published data fall back to the fixed price above and are flagged
              as estimates.
            </p>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm bg-red-500/10 p-2 rounded">
            {error}
          </p>
        )}

        {canEdit ? (
          <Button onClick={handleSave} disabled={saving || loading || !homeId}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4 mr-1 text-green-500" />
            ) : null}
            {saved ? 'Saved' : 'Save tariff'}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only managers can change the tariff configuration.
          </p>
        )}

        {homeId && mode !== 'fixed' && !loading && (
          <PricePreview homeId={homeId} refreshKey={previewKey} />
        )}
      </CardContent>
    </Card>
  );
}
