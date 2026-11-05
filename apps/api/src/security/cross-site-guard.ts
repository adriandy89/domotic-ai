const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Decides whether a request may proceed under the CSRF origin check.
 *
 * - Safe methods always pass (they must not change state).
 * - No `Origin` header → not a browser cross-site write (server-to-server:
 *   Alexa token endpoint, Lambda proxy, edge, MCP clients, webhooks).
 * - Otherwise the Origin must be in the allowlist or be the API's own origin
 *   (e.g. the Alexa consent form posts back to the API host).
 */
export function isCrossSiteWriteAllowed(input: {
  method: string;
  origin: string | undefined;
  host: string | undefined;
  allowedOrigins: readonly string[];
}): boolean {
  const { method, origin, host, allowedOrigins } = input;
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false; // "null" or malformed Origin
  }
}
