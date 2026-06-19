import { create } from 'zustand';
import { api } from '../lib/api';
import { shouldFetch, trackInflight } from '../lib/staleness';
import { useHomesStore, type Home } from './useHomesStore';

export type TariffMode = 'fixed' | 'tou' | 'dynamic';

export interface TouPeriod {
  id?: string;
  label: string;
  /** 0=Sunday .. 6=Saturday */
  days: number[];
  /** "HH:MM", end exclusive; end <= start wraps past midnight. */
  start: string;
  end: string;
  price: number;
}

export interface HomeTariff {
  home_id: string;
  mode: TariffMode;
  kwh_price: number;
  currency: string;
  timezone?: string;
  periods?: TouPeriod[];
  default_price?: number;
  provider?: string;
  zone?: string;
}

export interface UpdateHomeTariffPayload {
  mode: TariffMode;
  kwh_price?: number;
  currency?: string;
  timezone?: string;
  periods?: TouPeriod[];
  default_price?: number;
  provider?: string;
  zone?: string;
}

export interface PricingProvider {
  source: string;
  label: string;
  enabled: boolean;
  zones: { id: string; label: string }[];
}

export type ProviderTokenStatus = 'configured' | 'not_configured' | 'rejected';

export interface AdminPricingProvider extends PricingProvider {
  token_status: ProviderTokenStatus;
  token_origin: 'db' | 'env' | null;
  token_masked: string | null;
  token_updated_at: string | null;
}

export interface PricePoint {
  ts: string;
  price_kwh: number;
}

export interface PriceCurve {
  home_id: string;
  mode: TariffMode;
  currency: string;
  points: PricePoint[];
  current_price: number | null;
  tomorrow_published: boolean;
}

export interface ProviderPriceSeries {
  source: string;
  zone: string;
  currency: string;
  points: PricePoint[];
}

export interface CostSeriesPoint {
  bucket: string;
  energy_kwh: number;
  price_kwh: number | null;
  cost: number;
}

export interface CostSeriesTotals {
  energy_kwh: number;
  cost: number;
  priced_hours: number;
  fallback_hours: number;
}

export interface CostSeries {
  device_id: string;
  bucket: 'hour' | 'day';
  from: string;
  to: string;
  mode: TariffMode;
  currency: string;
  points: CostSeriesPoint[];
  totals: CostSeriesTotals;
}

// ---- Dashboard "current price per home" (data only; UI labels live in the card) ----

export type PriceTone = 'cheap' | 'mid' | 'expensive';

export interface PriceRow {
  homeId: string;
  name: string;
  type: 'DYNAMIC' | 'TOU' | 'FIXED';
  detail: string | null;
  price: number | null;
  currency: string;
  tone: PriceTone | null;
  estimate: boolean;
}

const SHORT_PROVIDER: Record<string, string> = {
  esios_pvpc: 'PVPC',
  entsoe: 'ENTSO-E',
};

/** A home shows a price when it has a usable tariff source. */
export function eligibleTariffType(
  home: Home | undefined,
): 'DYNAMIC' | 'TOU' | 'FIXED' | null {
  if (!home) return null;
  if (home.tariff_type === 'DYNAMIC') {
    const cfg = home.tariff_config as { provider?: string; zone?: string } | null;
    return cfg?.provider && cfg?.zone ? 'DYNAMIC' : null;
  }
  if (home.tariff_type === 'TOU') return 'TOU';
  if (home.tariff_type === 'FIXED' && Number(home.kwh_price ?? 0) > 0) return 'FIXED';
  return null;
}

/** Stable signature of the eligible homes + their tariff config (cache key). */
export function pricesSignature(homes: Home[]): string {
  return homes
    .map((home) => ({ home, type: eligibleTariffType(home) }))
    .filter((e) => e.type !== null)
    .map(
      (e) =>
        `${e.home.id}:${e.type}:${e.home.kwh_price}:${e.home.currency}:${JSON.stringify(
          e.home.tariff_config,
        )}`,
    )
    .join('|');
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 50;

function key(parts: Array<string | number>): string {
  return parts.join('|');
}

function evict<T>(map: Map<string, CacheEntry<T>>) {
  if (map.size > CACHE_MAX) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

interface PricingState {
  providers: PricingProvider[] | null;
  priceCurves: Map<string, CacheEntry<PriceCurve>>;
  costSeries: Map<string, CacheEntry<CostSeries>>;
  providerPrices: Map<string, CacheEntry<ProviderPriceSeries>>;
  loading: boolean;
  error: string | null;

  // Dashboard "current price per home" cache (survives navigation; 1-min TTL).
  currentPrices: PriceRow[];
  currentPricesSig: string;
  currentPricesLoading: boolean;

  fetchProviders: () => Promise<PricingProvider[]>;
  fetchAdminProviders: () => Promise<AdminPricingProvider[]>;
  saveProviderCredentials: (
    source: string,
    token: string,
  ) => Promise<AdminPricingProvider | null>;
  fetchTariff: (homeId: string) => Promise<HomeTariff | null>;
  updateTariff: (
    homeId: string,
    payload: UpdateHomeTariffPayload,
  ) => Promise<HomeTariff | null>;
  fetchPriceCurve: (
    homeId: string,
    range?: { from: Date; to: Date },
  ) => Promise<PriceCurve | null>;
  fetchProviderPrices: (params: {
    source: string;
    zone: string;
    from: Date;
    to: Date;
  }) => Promise<ProviderPriceSeries | null>;
  fetchCostSeries: (params: {
    device_id: string;
    from: Date;
    to: Date;
    bucket?: 'hour' | 'day';
  }) => Promise<CostSeries | null>;
  refreshCurrentPrices: (homes: Home[], force?: boolean) => Promise<void>;
  invalidate: () => void;
}

export const usePricingStore = create<PricingState>((set, get) => ({
  providers: null,
  priceCurves: new Map(),
  costSeries: new Map(),
  providerPrices: new Map(),
  loading: false,
  error: null,
  currentPrices: [],
  currentPricesSig: '',
  currentPricesLoading: false,

  fetchProviders: async () => {
    const cached = get().providers;
    if (cached) return cached;
    try {
      const { data } = await api.get<PricingProvider[]>('/pricing/providers');
      set({ providers: data });
      return data;
    } catch {
      return [];
    }
  },

  fetchAdminProviders: async () => {
    try {
      const { data } = await api.get<AdminPricingProvider[]>(
        '/pricing/admin/providers',
      );
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch providers';
      set({ error: message });
      return [];
    }
  },

  saveProviderCredentials: async (source, token) => {
    try {
      const { data } = await api.put<AdminPricingProvider>(
        `/pricing/admin/providers/${source}/credentials`,
        { token },
      );
      // The public provider list (tariff selects) must refetch `enabled`.
      set({ providers: null });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save provider token';
      set({ error: message });
      return null;
    }
  },

  fetchTariff: async (homeId) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<HomeTariff>(`/pricing/homes/${homeId}/tariff`);
      set({ loading: false });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to fetch tariff';
      set({ error: message, loading: false });
      return null;
    }
  },

  updateTariff: async (homeId, payload) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.put<HomeTariff>(
        `/pricing/homes/${homeId}/tariff`,
        payload,
      );
      // Keep the homes store coherent (EnergyReportPage reads these fields).
      useHomesStore.getState().updateHome(homeId, {
        kwh_price: data.kwh_price,
        currency: data.currency,
        tariff_type: data.mode.toUpperCase(),
      });
      set({ loading: false, priceCurves: new Map(), costSeries: new Map() });
      return data;
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to update tariff';
      set({ error: message, loading: false });
      return null;
    }
  },

  fetchPriceCurve: async (homeId, range) => {
    const cacheKey = key([
      'curve',
      homeId,
      range ? range.from.toISOString() : '',
      range ? range.to.toISOString() : '',
    ]);
    const cached = get().priceCurves.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    try {
      const { data } = await api.get<PriceCurve>(
        `/pricing/homes/${homeId}/prices`,
        range
          ? {
              params: {
                from: range.from.toISOString(),
                to: range.to.toISOString(),
              },
            }
          : undefined,
      );
      const next = new Map(get().priceCurves);
      next.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      evict(next);
      set({ priceCurves: next });
      return data;
    } catch {
      return null;
    }
  },

  refreshCurrentPrices: async (homes, force = false) => {
    const eligible = homes
      .map((home) => ({ home, type: eligibleTariffType(home) }))
      .filter(
        (e): e is { home: Home; type: 'DYNAMIC' | 'TOU' | 'FIXED' } =>
          e.type !== null,
      );
    const sig = pricesSignature(homes);

    if (eligible.length === 0) {
      set({ currentPrices: [], currentPricesSig: sig, currentPricesLoading: false });
      return;
    }

    // Refetch when forced or the tariff config changed; else respect the TTL
    // and dedupe concurrent calls.
    const sigChanged = get().currentPricesSig !== sig;
    if (!shouldFetch('electricity', 60_000, force || sigChanged)) return;

    if (sigChanged || get().currentPrices.length === 0) {
      set({ currentPricesLoading: true });
    }

    const p = (async () => {
      const providers = await get().fetchProviders();
      const rows = await Promise.all(
        eligible.map(async ({ home, type }): Promise<PriceRow> => {
          const base = { homeId: home.id, name: home.name };
          if (type === 'FIXED') {
            return {
              ...base,
              type,
              detail: null,
              price: Number(home.kwh_price ?? 0),
              currency: home.currency ?? 'USD',
              tone: null,
              estimate: false,
            };
          }
          // DYNAMIC / TOU → live price (cached curve) + tercile tone for dynamic.
          const curve = await get().fetchPriceCurve(home.id);
          const currency = curve?.currency ?? home.currency ?? 'EUR';
          let tone: PriceTone | null = null;
          let price = curve?.current_price ?? null;
          let estimate = false;
          if (type === 'DYNAMIC' && curve) {
            const prices = curve.points
              .map((pt) => pt.price_kwh)
              .sort((a, b) => a - b);
            if (price != null && prices.length > 0) {
              const t1 = prices[Math.floor(prices.length / 3)] ?? 0;
              const t2 = prices[Math.floor((prices.length * 2) / 3)] ?? 0;
              tone = price <= t1 ? 'cheap' : price <= t2 ? 'mid' : 'expensive';
            }
            if (price == null) {
              price = Number(home.kwh_price ?? 0) || null;
              estimate = price != null;
            }
          }
          const cfg =
            type === 'DYNAMIC'
              ? (home.tariff_config as { provider?: string; zone?: string } | null)
              : null;
          const detail =
            type === 'DYNAMIC' && cfg?.provider
              ? `${SHORT_PROVIDER[cfg.provider] ?? cfg.provider} · ${
                  providers
                    .find((pp) => pp.source === cfg.provider)
                    ?.zones.find((z) => z.id === cfg.zone)?.label ?? cfg.zone
                }`
              : null;
          return { ...base, type, detail, price, currency, tone, estimate };
        }),
      );
      set({ currentPrices: rows, currentPricesSig: sig, currentPricesLoading: false });
    })();
    await trackInflight('electricity', p);
  },

  fetchProviderPrices: async ({ source, zone, from, to }) => {
    const cacheKey = key([
      'provprices',
      source,
      zone,
      from.toISOString(),
      to.toISOString(),
    ]);
    const cached = get().providerPrices.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    try {
      const { data } = await api.get<ProviderPriceSeries>('/pricing/prices', {
        params: {
          source,
          zone,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      });
      const next = new Map(get().providerPrices);
      next.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      evict(next);
      set({ providerPrices: next });
      return data;
    } catch {
      return null;
    }
  },

  fetchCostSeries: async ({ device_id, from, to, bucket = 'day' }) => {
    const cacheKey = key([
      'cost',
      device_id,
      from.toISOString(),
      to.toISOString(),
      bucket,
    ]);
    const cached = get().costSeries.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    try {
      const { data } = await api.get<CostSeries>('/reports/cost-series', {
        params: {
          device_id,
          from: from.toISOString(),
          to: to.toISOString(),
          bucket,
        },
      });
      const next = new Map(get().costSeries);
      next.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      evict(next);
      set({ costSeries: next });
      return data;
    } catch {
      return null;
    }
  },

  invalidate: () =>
    set({
      providers: null,
      priceCurves: new Map(),
      costSeries: new Map(),
      providerPrices: new Map(),
    }),
}));

/** Spanish 2.0TD preset (peninsular defaults; prices are editable placeholders). */
export const SPANISH_20TD_PRESET: {
  timezone: string;
  default_price: number;
  periods: TouPeriod[];
} = {
  timezone: 'Europe/Madrid',
  default_price: 0.15,
  periods: [
    { id: 'p1m', label: 'P1 Punta (mañana)', days: [1, 2, 3, 4, 5], start: '10:00', end: '14:00', price: 0.2 },
    { id: 'p1t', label: 'P1 Punta (tarde)', days: [1, 2, 3, 4, 5], start: '18:00', end: '22:00', price: 0.2 },
    { id: 'p2m', label: 'P2 Llano (mañana)', days: [1, 2, 3, 4, 5], start: '08:00', end: '10:00', price: 0.15 },
    { id: 'p2t', label: 'P2 Llano (tarde)', days: [1, 2, 3, 4, 5], start: '14:00', end: '18:00', price: 0.15 },
    { id: 'p2n', label: 'P2 Llano (noche)', days: [1, 2, 3, 4, 5], start: '22:00', end: '00:00', price: 0.15 },
    { id: 'p3', label: 'P3 Valle (noche)', days: [1, 2, 3, 4, 5], start: '00:00', end: '08:00', price: 0.1 },
    { id: 'p3w', label: 'P3 Valle (fin de semana)', days: [0, 6], start: '00:00', end: '00:00', price: 0.1 },
  ],
};
