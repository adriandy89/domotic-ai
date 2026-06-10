-- =============================================================================
--  Logbook of device state transitions (HA logbook model).
--
--  One row per ACTUAL change of a non-numeric scalar state (relay OFF→ON,
--  trigger schedule→remote, zigbee contact true→false). Written by mqtt-core
--  during ingestion by diffing against sensor_data_last — heartbeats with
--  unchanged values write nothing, so the table grows O(changes), not
--  O(messages). Raw sensor_data only lives 30 days; these events persist a
--  full year so state history survives the raw retention.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "device_state_events" (
  "id"         TEXT NOT NULL,
  "device_id"  TEXT NOT NULL,
  "property"   TEXT NOT NULL,
  "prev_value" TEXT,
  "value"      TEXT NOT NULL,
  "timestamp"  TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
  CONSTRAINT "device_state_events_device_id_fkey" FOREIGN KEY ("device_id")
    REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

SELECT create_hypertable('device_state_events', 'timestamp',
  chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_device_state_events_timestamp_id"
  ON "device_state_events" ("timestamp", "id");
CREATE INDEX IF NOT EXISTS "idx_device_state_events_device_timestamp"
  ON "device_state_events" ("device_id", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_device_state_events_device_property_timestamp"
  ON "device_state_events" ("device_id", "property", "timestamp");

-- Events kept for 1 year (user decision); raw sensor_data keeps 30 days.
SELECT add_retention_policy('device_state_events', INTERVAL '365 days', if_not_exists => true);

-- ----- One-shot backfill from the live sensor_data window ---------------------
-- Derives historical transitions from whatever raw data is still retained
-- (≤30 days) using the same rules as the runtime detector: boolean / string
-- scalars only, no numeric-looking or ISO-date values, no meta keys, and a row
-- only where the value actually changed vs the previous message (LAG).
INSERT INTO "device_state_events" ("id", "device_id", "property", "prev_value", "value", "timestamp")
SELECT gen_random_uuid()::text, device_id, key, prev_value, value, "timestamp"
FROM (
  SELECT
    sd.device_id,
    kv.key,
    kv.value,
    sd."timestamp",
    LAG(kv.value) OVER (
      PARTITION BY sd.device_id, kv.key
      ORDER BY sd."timestamp", sd.id
    ) AS prev_value
  FROM sensor_data sd, LATERAL jsonb_each_text(sd.data) AS kv(key, value)
  -- sensor_data has no live FK (hypertable drift) and may hold rows for
  -- deleted devices; only backfill devices that still exist.
  WHERE EXISTS (SELECT 1 FROM devices d WHERE d.id = sd.device_id)
    AND jsonb_typeof(sd.data->kv.key) IN ('string', 'boolean')
    AND kv.key NOT IN ('device', 'ts', 'timestamp', 'last_seen', 'update')
    AND kv.value !~ '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$'
    AND kv.value !~ '^\d{4}-\d{2}-\d{2}T'
) t
WHERE prev_value IS NOT NULL
  AND prev_value IS DISTINCT FROM value;
