import { createHmac, timingSafeEqual } from 'node:crypto';
import { EdgeBundle, SignedEdgeBundle } from './bundle';

/**
 * Deterministic HMAC over the rules bundle, used to authenticate the retained
 * bundle the central publishes to the edge. Both sides share this exact code
 * (the edge vendors it) so a bundle signed by central always verifies on the edge.
 */

/** Stable JSON: object keys sorted recursively so signing is order-independent. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, k) => {
        acc[k] = sortDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

export function signBundle(bundle: EdgeBundle, token: string): SignedEdgeBundle {
  const hmac = createHmac('sha256', token)
    .update(canonicalJson(bundle))
    .digest('hex');
  return { bundle, hmac };
}

export function verifyBundle(
  signed: SignedEdgeBundle,
  token: string,
): boolean {
  if (!signed?.bundle || typeof signed.hmac !== 'string') return false;
  const expected = createHmac('sha256', token)
    .update(canonicalJson(signed.bundle))
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signed.hmac, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
