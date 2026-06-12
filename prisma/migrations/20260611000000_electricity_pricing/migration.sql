-- =============================================================================
--  Electricity pricing: per-home tariff config + shared market price series.
--
--  homes.tariff_type / tariff_config select how consumption is priced:
--    FIXED   -> homes.kwh_price (unchanged behavior for existing rows)
--    TOU     -> manual time-of-use periods stored in tariff_config (JSONB)
--    DYNAMIC -> hourly prices from electricity_prices (provider + zone)
--
--  electricity_prices holds one row per (source, zone, hour start UTC) in
--  currency/kWh, energy term only. Shared across homes — every PVPC home in
--  the same zone reads the same series. Written exclusively by the pricing
--  fetch service via INSERT ... ON CONFLICT upserts, so re-fetches are
--  idempotent. Volume is tiny (8.760 rows/zone/year): plain table, no
--  hypertable.
-- =============================================================================

CREATE TYPE "TariffType" AS ENUM ('FIXED', 'TOU', 'DYNAMIC');

ALTER TABLE "homes"
  ADD COLUMN "tariff_type" "TariffType" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "tariff_config" JSONB;

CREATE TABLE IF NOT EXISTS "electricity_prices" (
  "source"     VARCHAR(24)    NOT NULL,
  "zone"       VARCHAR(16)    NOT NULL,
  "ts"         TIMESTAMPTZ(6) NOT NULL,
  "price_kwh"  DECIMAL(12, 8) NOT NULL,
  "currency"   VARCHAR(3)     NOT NULL DEFAULT 'EUR',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
  "updated_at" TIMESTAMPTZ(6),
  CONSTRAINT "pk_electricity_price" PRIMARY KEY ("source", "zone", "ts")
);

CREATE INDEX IF NOT EXISTS "idx_electricity_price_zone_ts"
  ON "electricity_prices" ("zone", "ts" DESC);
