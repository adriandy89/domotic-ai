/**
 * Alexa Smart Home skill endpoint — thin proxy to the Domotic-AI cloud.
 *
 * Smart Home skills only accept an AWS Lambda ARN as endpoint, so this
 * function forwards every directive verbatim to
 * `${PUBLIC_APP_URL}/api/v1/alexa/directives` and returns the response
 * verbatim. All mapping/auth logic lives in the cloud; this file should
 * almost never need redeploying.
 *
 * Runtime: Node.js 20/22 (global fetch, no dependencies).
 * Env vars: PUBLIC_APP_URL (e.g. https://your-domain.example).
 */

const TIMEOUT_MS = 7000; // stay inside Alexa's ~8s budget

export const handler = async (event) => {
  const directive = event?.directive;
  const token =
    directive?.endpoint?.scope?.token ?? // control / ReportState
    directive?.payload?.scope?.token ?? // Discovery
    directive?.payload?.grantee?.token; // AcceptGrant

  const base = process.env.PUBLIC_APP_URL;
  if (!base || !directive) {
    return errorResponse(
      directive,
      'INTERNAL_ERROR',
      !base ? 'PUBLIC_APP_URL is not configured' : 'Malformed directive',
    );
  }

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/alexa/directives`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json();
    // Only pass through real Alexa events. A non-event body (e.g. a Nest
    // exception `{statusCode, message}`) is not a valid skill response.
    if (!body?.event?.header) {
      console.error(`unexpected cloud response status=${res.status}`);
      return errorResponse(
        directive,
        'INTERNAL_ERROR',
        `Unexpected response from the Domotic-AI cloud (HTTP ${res.status})`,
      );
    }
    return body;
  } catch (err) {
    console.error('proxy error:', err);
    return errorResponse(
      directive,
      'BRIDGE_UNREACHABLE',
      `Could not reach the Domotic-AI cloud: ${err.message}`,
    );
  }
};

function errorResponse(directive, type, message) {
  // AcceptGrant errors must use the Alexa.Authorization namespace.
  const isGrant = directive?.header?.namespace === 'Alexa.Authorization';
  return {
    event: {
      header: {
        namespace: isGrant ? 'Alexa.Authorization' : 'Alexa',
        name: 'ErrorResponse',
        payloadVersion: '3',
        messageId: globalThis.crypto.randomUUID(),
        ...(directive?.header?.correlationToken && {
          correlationToken: directive.header.correlationToken,
        }),
      },
      ...(directive?.endpoint?.endpointId && {
        endpoint: { endpointId: directive.endpoint.endpointId },
      }),
      payload: { type: isGrant ? 'ACCEPT_GRANT_FAILED' : type, message },
    },
  };
}
