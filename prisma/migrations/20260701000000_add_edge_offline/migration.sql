-- Offline-first edge support. All defaults keep existing homes/rules/schedules
-- behaving exactly as before (edge_enabled = false, run_offline = false).

-- Opt-in flag per home.
ALTER TABLE "homes" ADD COLUMN IF NOT EXISTS "edge_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Which rules/schedules are included in the offline bundle.
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "run_offline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "run_offline" BOOLEAN NOT NULL DEFAULT false;

-- Staging table for executions uploaded by the edge. `dedup_key` makes re-uploads
-- and backfilled-telemetry replays idempotent (unique per home).
CREATE TABLE IF NOT EXISTS "edge_executions" (
    "id"             TEXT NOT NULL,
    "home_id"        TEXT NOT NULL,
    "rule_id"        TEXT NOT NULL,
    "device_id"      TEXT,
    "triggered_at"   TIMESTAMPTZ(6) NOT NULL,
    "conditions_met" BOOLEAN NOT NULL,
    "executed"       BOOLEAN NOT NULL,
    "results_count"  INTEGER NOT NULL DEFAULT 0,
    "source"         VARCHAR(20) NOT NULL,
    "error"          VARCHAR(1024),
    "dedup_key"      VARCHAR(128) NOT NULL,
    "uploaded_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "pk_edge_execution_id" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "edge_executions"
        ADD CONSTRAINT "fk_edge_execution_home"
        FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_edge_execution_dedup" ON "edge_executions"("home_id", "dedup_key");
CREATE INDEX IF NOT EXISTS "idx_edge_execution_home_at" ON "edge_executions"("home_id", "triggered_at");
