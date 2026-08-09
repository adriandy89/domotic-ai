/**
 * Alexa Smart Home API v3 directive/event envelopes (the subset we handle)
 * and the endpointId codec.
 */

export interface AlexaDirectiveHeader {
  namespace: string;
  name: string;
  payloadVersion: string;
  messageId: string;
  correlationToken?: string;
}

export interface AlexaScope {
  type: 'BearerToken';
  token: string;
}

export interface AlexaDirectiveEndpoint {
  scope?: AlexaScope;
  endpointId: string;
  cookie?: Record<string, string>;
}

export interface AlexaDirective {
  directive: {
    header: AlexaDirectiveHeader;
    endpoint?: AlexaDirectiveEndpoint;
    payload: Record<string, any>;
  };
}

export interface AlexaProperty {
  namespace: string;
  name: string;
  value: unknown;
  timeOfSample: string;
  uncertaintyInMilliseconds: number;
  instance?: string;
}

export interface AlexaCapability {
  type: 'AlexaInterface';
  interface: string;
  version: '3';
  properties?: {
    supported: { name: string }[];
    proactivelyReported: boolean;
    retrievable: boolean;
  };
  configuration?: Record<string, unknown>;
  supportsDeactivation?: boolean;
}

export interface AlexaDiscoveryEndpoint {
  endpointId: string;
  manufacturerName: string;
  friendlyName: string;
  description: string;
  displayCategories: string[];
  capabilities: AlexaCapability[];
  cookie?: Record<string, string>;
}

// ── endpointId codec ─────────────────────────────────────────────────────────
// Stateless resolution: `dev:<Device.id>` for devices, `ir:<learned.id>` for
// learned IR commands (each IR code is its own SceneController endpoint).

export type EndpointRef =
  | { kind: 'device'; id: string }
  | { kind: 'ir'; id: string };

export function encodeEndpointId(ref: EndpointRef): string {
  return `${ref.kind === 'device' ? 'dev' : 'ir'}:${ref.id}`;
}

export function decodeEndpointId(endpointId: string): EndpointRef | null {
  if (typeof endpointId !== 'string') return null;
  if (endpointId.startsWith('dev:')) {
    const id = endpointId.slice(4);
    return id ? { kind: 'device', id } : null;
  }
  if (endpointId.startsWith('ir:')) {
    const id = endpointId.slice(3);
    return id ? { kind: 'ir', id } : null;
  }
  return null;
}
