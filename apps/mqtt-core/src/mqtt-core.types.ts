/** Shared types of the mqtt-core app (used across its services). */

/** Device record shape needed to ingest a state message. */
export interface IngestDevice {
  id: string;
  name: string;
  disabled: boolean | null;
  /** Current availability; a fresh message flips a stale `false` back to online. */
  online: boolean | null;
  conditions: { rule_id: string }[];
}

export interface PublishCommandResult {
  ok: boolean;
  code?:
    | 'INVALID_DEVICE_ID'
    | 'DEVICE_NOT_FOUND'
    | 'DEVICE_DISABLED'
    | 'INVALID_COMMAND'
    | 'RATE_LIMITED'
    | 'PUBLISH_FAILED';
  error?: string;
  validationErrors?: { property: string; code: string; message: string }[];
  retryAfterMs?: number;
}
