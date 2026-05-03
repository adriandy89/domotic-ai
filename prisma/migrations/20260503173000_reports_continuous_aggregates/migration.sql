-- =============================================================================
--  Continuous aggregates + retention policies for the reports module.
--  Strategy: raw 30 days → hourly 1 year → daily forever (multi-year retention).
-- =============================================================================

-- ----- Hourly aggregate -----------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_hourly
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 hour', timestamp) AS bucket,
  -- Climate
  avg((data->>'temperature')::float)  FILTER (WHERE data ? 'temperature')   AS temperature_avg,
  min((data->>'temperature')::float)  FILTER (WHERE data ? 'temperature')   AS temperature_min,
  max((data->>'temperature')::float)  FILTER (WHERE data ? 'temperature')   AS temperature_max,
  avg((data->>'humidity')::float)     FILTER (WHERE data ? 'humidity')      AS humidity_avg,
  avg((data->>'pressure')::float)     FILTER (WHERE data ? 'pressure')      AS pressure_avg,
  avg((data->>'illuminance')::float)  FILTER (WHERE data ? 'illuminance')   AS illuminance_avg,
  -- Energy
  avg((data->>'power')::float)        FILTER (WHERE data ? 'power')         AS power_avg,
  max((data->>'power')::float)        FILTER (WHERE data ? 'power')         AS power_max,
  max((data->>'energy')::float)       FILTER (WHERE data ? 'energy')        AS energy_max,
  min((data->>'energy')::float)       FILTER (WHERE data ? 'energy')        AS energy_min,
  avg((data->>'voltage')::float)      FILTER (WHERE data ? 'voltage')       AS voltage_avg,
  avg((data->>'current')::float)      FILTER (WHERE data ? 'current')       AS current_avg,
  -- Activity / security counters
  count(*) FILTER (WHERE (data->>'contact')::boolean    = false)            AS contact_open_count,
  count(*) FILTER (WHERE (data->>'occupancy')::boolean  = true)             AS occupancy_count,
  count(*) FILTER (WHERE (data->>'presence')::boolean   = true)             AS presence_count,
  count(*) FILTER (WHERE (data->>'motion')::boolean     = true)             AS motion_count,
  count(*) FILTER (WHERE (data->>'vibration')::boolean  = true)             AS vibration_count,
  count(*) FILTER (WHERE (data->>'smoke')::boolean      = true)             AS smoke_count,
  count(*) FILTER (WHERE (data->>'water_leak')::boolean = true)             AS water_leak_count,
  count(*) FILTER (WHERE (data->>'tamper')::boolean     = true)             AS tamper_count,
  count(*) FILTER (WHERE data ? 'action' AND (data->>'action') <> '')       AS action_count,
  -- Air quality
  avg((data->>'co2')::float)          FILTER (WHERE data ? 'co2')           AS co2_avg,
  avg((data->>'voc')::float)          FILTER (WHERE data ? 'voc')           AS voc_avg,
  avg((data->>'pm25')::float)         FILTER (WHERE data ? 'pm25')          AS pm25_avg,
  avg((data->>'pm10')::float)         FILTER (WHERE data ? 'pm10')          AS pm10_avg,
  -- Health
  min((data->>'battery')::int)        FILTER (WHERE data ? 'battery')       AS battery_min,
  avg((data->>'linkquality')::int)    FILTER (WHERE data ? 'linkquality')   AS lqi_avg,
  count(*) AS sample_count
FROM sensor_data
GROUP BY device_id, bucket
WITH NO DATA;

CREATE INDEX IF NOT EXISTS idx_sensor_hourly_device_bucket ON sensor_hourly (device_id, bucket DESC);

SELECT add_continuous_aggregate_policy('sensor_hourly',
  start_offset      => INTERVAL '7 days',
  end_offset        => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists     => true
);

-- ----- Daily aggregate (built on top of the hourly view) ---------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_daily
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 day', bucket) AS bucket,
  avg(temperature_avg)  AS temperature_avg,
  min(temperature_min)  AS temperature_min,
  max(temperature_max)  AS temperature_max,
  avg(humidity_avg)     AS humidity_avg,
  avg(pressure_avg)     AS pressure_avg,
  avg(illuminance_avg)  AS illuminance_avg,
  avg(power_avg)        AS power_avg,
  max(power_max)        AS power_max,
  max(energy_max)       AS energy_max,
  min(energy_min)       AS energy_min,
  avg(voltage_avg)      AS voltage_avg,
  avg(current_avg)      AS current_avg,
  sum(contact_open_count) AS contact_open_count,
  sum(occupancy_count)    AS occupancy_count,
  sum(presence_count)     AS presence_count,
  sum(motion_count)       AS motion_count,
  sum(vibration_count)    AS vibration_count,
  sum(smoke_count)        AS smoke_count,
  sum(water_leak_count)   AS water_leak_count,
  sum(tamper_count)       AS tamper_count,
  sum(action_count)       AS action_count,
  avg(co2_avg)          AS co2_avg,
  avg(voc_avg)          AS voc_avg,
  avg(pm25_avg)         AS pm25_avg,
  avg(pm10_avg)         AS pm10_avg,
  min(battery_min)      AS battery_min,
  avg(lqi_avg)          AS lqi_avg,
  sum(sample_count)     AS sample_count
FROM sensor_hourly
GROUP BY device_id, bucket
WITH NO DATA;

CREATE INDEX IF NOT EXISTS idx_sensor_daily_device_bucket ON sensor_daily (device_id, bucket DESC);

SELECT add_continuous_aggregate_policy('sensor_daily',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => true
);

-- ----- Retention policies (multi-year strategy) ------------------------------
-- raw kept for 30 days only
SELECT add_retention_policy('sensor_data',  INTERVAL '30 days',  if_not_exists => true);
-- hourly kept for 1 year
SELECT add_retention_policy('sensor_hourly', INTERVAL '365 days', if_not_exists => true);
-- daily kept forever (no policy)

-- =============================================================================
--  Per-home configuration for energy-cost reports and comfort thresholds.
-- =============================================================================
ALTER TABLE "homes"
  ADD COLUMN IF NOT EXISTS "currency"          VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "kwh_price"         DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "comfort_min_temp"  DECIMAL(4,1),
  ADD COLUMN IF NOT EXISTS "comfort_max_temp"  DECIMAL(4,1),
  ADD COLUMN IF NOT EXISTS "comfort_min_humidity" DECIMAL(4,1),
  ADD COLUMN IF NOT EXISTS "comfort_max_humidity" DECIMAL(4,1);
