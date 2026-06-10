-- =============================================================================
--  Generic per-field statistics (HA-recorder style) for ANY numeric field of
--  ANY protocol — avg/min/max per (device, field, bucket).
--
--  TimescaleDB continuous aggregates cannot expand JSONB with set-returning
--  functions (jsonb_each_text), so these are plain hypertables refreshed by a
--  scheduled user-defined action — the same pattern the Home Assistant
--  recorder uses to compile its `statistics` tables periodically.
--  The existing sensor_hourly / sensor_daily CAGGs are untouched.
-- =============================================================================

-- ----- Hourly table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sensor_field_hourly" (
  "device_id"    TEXT NOT NULL,
  "bucket"       TIMESTAMPTZ NOT NULL,
  "field"        TEXT NOT NULL,
  "value_avg"    DOUBLE PRECISION,
  "value_min"    DOUBLE PRECISION,
  "value_max"    DOUBLE PRECISION,
  "sample_count" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "pk_sensor_field_hourly" PRIMARY KEY ("device_id", "bucket", "field")
);

SELECT create_hypertable('sensor_field_hourly', 'bucket',
  chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS "idx_sensor_field_hourly_device_field_bucket"
  ON "sensor_field_hourly" ("device_id", "field", "bucket" DESC);

-- ----- Daily table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sensor_field_daily" (
  "device_id"    TEXT NOT NULL,
  "bucket"       TIMESTAMPTZ NOT NULL,
  "field"        TEXT NOT NULL,
  "value_avg"    DOUBLE PRECISION,
  "value_min"    DOUBLE PRECISION,
  "value_max"    DOUBLE PRECISION,
  "sample_count" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "pk_sensor_field_daily" PRIMARY KEY ("device_id", "bucket", "field")
);

SELECT create_hypertable('sensor_field_daily', 'bucket',
  chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS "idx_sensor_field_daily_device_field_bucket"
  ON "sensor_field_daily" ("device_id", "field", "bucket" DESC);

-- ----- Refresh procedure (user-defined action) --------------------------------
-- Recomputes the recent window from raw sensor_data and upserts the buckets.
-- Idempotent: re-running a window converges to the same rows. Numeric-looking
-- scalar JSON values only (booleans, strings, nested objects are skipped).
CREATE OR REPLACE PROCEDURE refresh_sensor_field_stats(job_id INT, config JSONB)
LANGUAGE plpgsql AS $proc$
DECLARE
  target TEXT     := config->>'target';
  width  INTERVAL := (config->>'bucket_width')::interval;
  win    INTERVAL := (config->>'window')::interval;
BEGIN
  IF target IS NULL OR width IS NULL OR win IS NULL THEN
    RAISE EXCEPTION 'refresh_sensor_field_stats: config requires target, bucket_width and window';
  END IF;

  EXECUTE format($sql$
    INSERT INTO %I (device_id, bucket, field, value_avg, value_min, value_max, sample_count)
    SELECT
      sd.device_id,
      time_bucket(%L::interval, sd."timestamp") AS bucket,
      kv.key AS field,
      avg(kv.value::float),
      min(kv.value::float),
      max(kv.value::float),
      count(*)
    FROM sensor_data sd, LATERAL jsonb_each_text(sd.data) AS kv(key, value)
    WHERE sd."timestamp" >= now() - %L::interval
      AND kv.value ~ '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$'
    GROUP BY sd.device_id, bucket, kv.key
    ON CONFLICT (device_id, bucket, field) DO UPDATE SET
      value_avg    = EXCLUDED.value_avg,
      value_min    = EXCLUDED.value_min,
      value_max    = EXCLUDED.value_max,
      sample_count = EXCLUDED.sample_count
  $sql$, target, width, win);
END
$proc$;

-- ----- Jobs (mirror the sensor_hourly / sensor_daily CAGG policies) -----------
-- Hourly: every 5 minutes over the last 7 days.
SELECT add_job('refresh_sensor_field_stats', INTERVAL '5 minutes',
  config => '{"target":"sensor_field_hourly","bucket_width":"1 hour","window":"7 days"}');

-- Daily: every hour, window kept strictly inside the 30-day raw retention so a
-- partially-dropped oldest day can never overwrite a complete bucket.
SELECT add_job('refresh_sensor_field_stats', INTERVAL '1 hour',
  config => '{"target":"sensor_field_daily","bucket_width":"1 day","window":"29 days"}');

-- ----- Retention (multi-year strategy, same as the CAGGs) ----------------------
SELECT add_retention_policy('sensor_field_hourly', INTERVAL '365 days', if_not_exists => true);
-- sensor_field_daily kept forever (no policy)
