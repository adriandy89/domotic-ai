import { createHmac } from 'node:crypto';

/**
 * Per-home edge auth token, derived from a single central master secret
 * (`EDGE_SIGNING_SECRET`) + the home `unique_id`. Central derives it to sign the
 * bundle and to authenticate the edge API; the value is shown per-home in the
 * dashboard and copied into that home's edge `.env` as `EDGE_AUTH_TOKEN`.
 *
 * Deriving (instead of storing a column) keeps it per-home and scoped without a
 * migration: leaking one home's token never exposes another's, and rotating the
 * master secret rotates every home at once.
 */
export function deriveEdgeToken(
  masterSecret: string,
  homeUniqueId: string,
): string {
  return createHmac('sha256', masterSecret)
    .update(`edge:${homeUniqueId}`)
    .digest('hex');
}
