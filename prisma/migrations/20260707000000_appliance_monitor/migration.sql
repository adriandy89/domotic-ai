-- =============================================================================
--  Appliance monitors: "power-monitoring appliance state" config.
--
--  One row per monitored appliance (e.g. a washing machine on a metered smart
--  plug). A threshold + hysteresis state machine — hosted at the edge for
--  edge-enabled homes, else centrally — derives an appliance_state
--  (idle/running/finished) from the source plug's power telemetry and publishes
--  it as an ordinary HA-aggregate-state message on
--  home/id/{home_unique_id}/wifi/{appliance_unique_id}/state, so it flows
--  through the UNCHANGED ingestion/rules/notification/frontend pipeline.
--
--  Config only — no secrets, no encrypted columns. Runtime phase is persisted
--  at the edge (SQLite kv), not here. Plain btree table (NOT a hypertable).
-- =============================================================================

CREATE TABLE IF NOT EXISTS "appliance_monitors" (
  "id"                      TEXT           NOT NULL,
  "name"                    VARCHAR(128)   NOT NULL,
  "source_device_id"        TEXT           NOT NULL,
  "source_device_unique_id" VARCHAR(128)   NOT NULL,
  "power_field"             VARCHAR(64)    NOT NULL DEFAULT 'power',
  "appliance_unique_id"     VARCHAR(128)   NOT NULL,
  "appliance_type"          VARCHAR(64)    NOT NULL DEFAULT 'washing_machine',
  "run_threshold_w"         DECIMAL(8, 2)  NOT NULL DEFAULT 10,
  "idle_threshold_w"        DECIMAL(8, 2)  NOT NULL DEFAULT 2,
  "min_run_seconds"         INTEGER        NOT NULL DEFAULT 30,
  "min_finish_seconds"      INTEGER        NOT NULL DEFAULT 120,
  "active"                  BOOLEAN        NOT NULL DEFAULT true,
  "home_id"                 TEXT           NOT NULL,
  "home_unique_id"          VARCHAR(128)   NOT NULL,
  "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
  "updated_at"              TIMESTAMPTZ(6),
  CONSTRAINT "pk_appliance_monitor_id" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_appliance_monitor_unique_id"
  ON "appliance_monitors" ("appliance_unique_id");
CREATE INDEX IF NOT EXISTS "idx_appliance_monitor_home"
  ON "appliance_monitors" ("home_id");
CREATE INDEX IF NOT EXISTS "idx_appliance_monitor_source_device"
  ON "appliance_monitors" ("source_device_id");
CREATE INDEX IF NOT EXISTS "idx_appliance_monitor_active"
  ON "appliance_monitors" ("active");

ALTER TABLE "appliance_monitors"
  ADD CONSTRAINT "fk_appliance_monitor_source_device"
  FOREIGN KEY ("source_device_id") REFERENCES "devices" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "appliance_monitors"
  ADD CONSTRAINT "fk_appliance_monitor_home"
  FOREIGN KEY ("home_id") REFERENCES "homes" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
