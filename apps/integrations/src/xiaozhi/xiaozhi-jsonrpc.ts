export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Single seam for protocol framing. Today xiaozhi.me sends one
 * JSON-RPC 2.0 message per WebSocket frame (no envelope). If they
 * change to e.g. an ESP32-style envelope `{session_id,type,payload}`,
 * only this file changes.
 */
export function parseFrame(buf: Buffer | string): JsonRpcRequest | null {
  try {
    const text = typeof buf === 'string' ? buf : buf.toString('utf8');
    const msg = JSON.parse(text);
    if (!msg || typeof msg !== 'object') return null;
    if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return null;
    return msg as JsonRpcRequest;
  } catch {
    return null;
  }
}

export function serializeFrame(msg: JsonRpcResponse): string {
  return JSON.stringify(msg) + '\n';
}

export function errResp(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

export function okResp(
  id: number | string | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export const RPC_ERROR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;
