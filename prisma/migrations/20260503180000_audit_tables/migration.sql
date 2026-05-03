-- =============================================================================
--  Audit / observability tables for the reports module (F5.a).
--  - rule_executions    : every rule firing (whether conditions matched + result count)
--  - command_executions : every command published to a device (api/ai/rule/schedule)
--  - ai_usage           : LLM usage per generate() call (tokens, latency, errors)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "rule_executions" (
  "id"             TEXT PRIMARY KEY,
  "rule_id"        TEXT NOT NULL,
  "device_id"      TEXT,
  "triggered_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "conditions_met" BOOLEAN NOT NULL,
  "executed"       BOOLEAN NOT NULL,
  "results_count"  INTEGER NOT NULL DEFAULT 0,
  "error"          VARCHAR(1024),
  CONSTRAINT "fk_rule_execution_rule"
    FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_rule_execution_device"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_rule_execution_rule_at"
  ON "rule_executions" ("rule_id", "triggered_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rule_execution_at"
  ON "rule_executions" ("triggered_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rule_execution_device"
  ON "rule_executions" ("device_id");

CREATE TABLE IF NOT EXISTS "command_executions" (
  "id"        TEXT PRIMARY KEY,
  "user_id"   TEXT,
  "device_id" TEXT NOT NULL,
  "source"    VARCHAR(20) NOT NULL,
  "command"   JSONB NOT NULL,
  "ok"        BOOLEAN NOT NULL,
  "code"      VARCHAR(40),
  "error"     VARCHAR(1024),
  "sent_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "fk_command_execution_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "fk_command_execution_device"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_command_execution_device_at"
  ON "command_executions" ("device_id", "sent_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_command_execution_source_at"
  ON "command_executions" ("source", "sent_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_command_execution_user_at"
  ON "command_executions" ("user_id", "sent_at" DESC);

CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id"                TEXT PRIMARY KEY,
  "organization_id"   TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "conversation_id"   VARCHAR(128) NOT NULL,
  "provider"          VARCHAR(20) NOT NULL,
  "model"             VARCHAR(80) NOT NULL,
  "prompt_tokens"     INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens"      INTEGER NOT NULL DEFAULT 0,
  "tool_calls"        INTEGER NOT NULL DEFAULT 0,
  "latency_ms"        INTEGER NOT NULL DEFAULT 0,
  "error"             VARCHAR(512),
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "fk_ai_usage_org"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_ai_usage_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_ai_usage_org_at"
  ON "ai_usage" ("organization_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_ai_usage_user_at"
  ON "ai_usage" ("user_id", "created_at" DESC);
