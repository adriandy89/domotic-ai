export interface PriceZone {
  id: string;
  label: string;
}

export interface RawPricePoint {
  /** Interval start, UTC. */
  ts: Date;
  /** Interval length as published by the market (15 or 60). */
  durationMin: number;
  /** Normalized by the provider to currency per kWh. */
  priceKwh: number;
  currency: string;
}

export interface ElectricityPriceProvider {
  /** Persisted in `electricity_prices.source`, e.g. 'esios_pvpc'. */
  readonly source: string;
  readonly label: string;
  /** IANA timezone the market's civil days are defined in. */
  readonly marketTimezone: string;
  readonly zones: readonly PriceZone[];
  /** False when the platform token is missing or rejected (401/403). */
  readonly enabled: boolean;
  /**
   * Prices for one zone and one civil day (YYYY-MM-DD) in the market
   * timezone. Empty array = not yet published. Throws on transport/auth
   * errors.
   */
  fetchDayAheadPrices(zone: string, day: string): Promise<RawPricePoint[]>;
}

export const PRICE_PROVIDERS = Symbol('PRICE_PROVIDERS');
