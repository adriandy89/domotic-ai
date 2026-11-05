import * as crypto from 'crypto';
import type {
  AlexaDirective,
  AlexaDiscoveryEndpoint,
  AlexaProperty,
} from './alexa.types';

/**
 * Event envelope builders. Every reply copies the directive's
 * correlationToken/endpointId/scope so Alexa can match it.
 */

export function makeProperty(
  namespace: string,
  name: string,
  value: unknown,
  uncertaintyInMilliseconds = 500,
): AlexaProperty {
  return {
    namespace,
    name,
    value,
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds,
  };
}

export function alexaResponse(
  directive: AlexaDirective,
  properties: AlexaProperty[],
  options: { name?: string; payload?: Record<string, unknown> } = {},
) {
  const { header, endpoint } = directive.directive;
  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: options.name ?? 'Response',
        payloadVersion: '3',
        messageId: crypto.randomUUID(),
        ...(header.correlationToken && {
          correlationToken: header.correlationToken,
        }),
      },
      ...(endpoint && {
        endpoint: {
          ...(endpoint.scope && { scope: endpoint.scope }),
          endpointId: endpoint.endpointId,
        },
      }),
      payload: options.payload ?? {},
    },
    ...(properties.length > 0 && { context: { properties } }),
  };
}

export function stateReport(
  directive: AlexaDirective,
  properties: AlexaProperty[],
) {
  return alexaResponse(directive, properties, { name: 'StateReport' });
}

export function errorResponse(
  directive: AlexaDirective | null,
  type: string,
  message: string,
  payloadExtra: Record<string, unknown> = {},
) {
  const header = directive?.directive.header;
  const endpoint = directive?.directive.endpoint;
  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ErrorResponse',
        payloadVersion: '3',
        messageId: crypto.randomUUID(),
        ...(header?.correlationToken && {
          correlationToken: header.correlationToken,
        }),
      },
      ...(endpoint && {
        endpoint: {
          ...(endpoint.scope && { scope: endpoint.scope }),
          endpointId: endpoint.endpointId,
        },
      }),
      payload: { type, message, ...payloadExtra },
    },
  };
}

export function discoverResponse(endpoints: AlexaDiscoveryEndpoint[]) {
  return {
    event: {
      header: {
        namespace: 'Alexa.Discovery',
        name: 'Discover.Response',
        payloadVersion: '3',
        messageId: crypto.randomUUID(),
      },
      payload: { endpoints },
    },
  };
}

/**
 * AcceptGrant failures must use the `Alexa.Authorization` namespace (not the
 * generic `Alexa` ErrorResponse) or Alexa rejects the reply.
 */
export function acceptGrantErrorResponse(message: string) {
  return {
    event: {
      header: {
        namespace: 'Alexa.Authorization',
        name: 'ErrorResponse',
        payloadVersion: '3',
        messageId: crypto.randomUUID(),
      },
      payload: { type: 'ACCEPT_GRANT_FAILED', message },
    },
  };
}

export function acceptGrantResponse() {
  return {
    event: {
      header: {
        namespace: 'Alexa.Authorization',
        name: 'AcceptGrant.Response',
        payloadVersion: '3',
        messageId: crypto.randomUUID(),
      },
      payload: {},
    },
  };
}
