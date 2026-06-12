/**
 * Tariff modes exposed by the API (lowercase). The pricing service maps them
 * to/from the Prisma `TariffType` enum (FIXED/TOU/DYNAMIC).
 *
 *  - `fixed`   — single price from `homes.kwh_price`.
 *  - `tou`     — manual time-of-use periods (e.g. Spanish 2.0TD P1/P2/P3)
 *                stored in `homes.tariff_config`.
 *  - `dynamic` — hourly market prices fetched from a provider into the
 *                shared `electricity_prices` table.
 */
export const TariffMode = {
  fixed: 'fixed',
  tou: 'tou',
  dynamic: 'dynamic',
} as const;
export type TariffMode = (typeof TariffMode)[keyof typeof TariffMode];

export const TARIFF_MODES: TariffMode[] = Object.values(TariffMode);

/** Dynamic price providers persisted in `electricity_prices.source`. */
export const PricingSource = {
  esios_pvpc: 'esios_pvpc',
  entsoe: 'entsoe',
} as const;
export type PricingSource = (typeof PricingSource)[keyof typeof PricingSource];

export const PRICING_SOURCES: PricingSource[] = Object.values(PricingSource);
