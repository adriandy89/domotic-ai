-- Edge engine local state (SQLite / better-sqlite3).

-- The latest synced rules bundle (single row, id = 1) + its version/hmac.
CREATE TABLE IF NOT EXISTS rules_cache (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  version  INTEGER NOT NULL,
  bundle   TEXT NOT NULL,        -- JSON EdgeBundle
  synced_at INTEGER NOT NULL     -- epoch ms
);

-- Latest telemetry per device (device unique_id → JSON data + timestamp).
CREATE TABLE IF NOT EXISTS device_state (
  device_unique_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- JSON attributes
  updated_at INTEGER NOT NULL    -- epoch ms
);

-- State transitions for INACTIVE detection (bounded, pruned by age).
CREATE TABLE IF NOT EXISTS state_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  device_unique_id TEXT NOT NULL,
  property         TEXT NOT NULL,
  value            TEXT NOT NULL,
  timestamp        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_state_events_dev_prop
  ON state_events (device_unique_id, property, timestamp DESC);

-- Executions performed locally, awaiting upload to central.
CREATE TABLE IF NOT EXISTS executions_buffer (
  dedup_key      TEXT PRIMARY KEY,
  rule_id        TEXT NOT NULL,
  device_id      TEXT,
  triggered_at   INTEGER NOT NULL,
  conditions_met INTEGER NOT NULL,
  executed       INTEGER NOT NULL,
  results_count  INTEGER NOT NULL DEFAULT 0,
  source         TEXT NOT NULL,   -- 'rule' | 'schedule' | 'watchdog'
  error          TEXT,
  uploaded       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exec_buffer_uploaded
  ON executions_buffer (uploaded, triggered_at);

-- Small key/value scratchpad (last watchdog alert per rule, etc.).
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
