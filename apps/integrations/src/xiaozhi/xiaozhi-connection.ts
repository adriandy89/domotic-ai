import { Logger } from '@nestjs/common';
import type { Role } from 'generated/prisma/enums';
import WebSocket, { type RawData } from 'ws';
import {
  errResp,
  okResp,
  parseFrame,
  RPC_ERROR,
  serializeFrame,
} from './xiaozhi-jsonrpc';
import {
  OwnerCtx,
  XiaozhiToolDispatcher,
} from './xiaozhi-tool-dispatcher';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface XiaozhiConnectionOptions {
  id: string;
  owner: OwnerCtx;
  getEndpoint: () => string;
  dispatcher: XiaozhiToolDispatcher;
  onStateChange: (state: ConnectionState, error: string | null) => void;
  logger: Logger;
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 600_000;
const BACKOFF_FACTOR = 2;
const HEARTBEAT_MS = 30_000;
const PONG_DEADLINE_MS = 35_000;
const MAX_AUTH_FAILS = 3;
// 4003 is "Unsupported protocol version" — that is a *content* error, not
// an auth failure. We exclude it from the circuit-breaker so xiaozhi
// flapping over a wrong protocolVersion reply doesn't lock us out after
// 3 close events.
const AUTH_FAIL_CLOSE_CODES = new Set([401, 1008, 4001]);
// Time the connection must stay open before we consider it "stable" and
// reset the consecutive auth-fail counter. Avoids the bug where a
// successful TCP/TLS open immediately followed by a 401 close zeroes the
// counter every cycle.
const STABLE_AFTER_MS = 5_000;

export class XiaozhiConnection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private attempt = 0;
  private consecutiveAuthFails = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pongDeadline: NodeJS.Timeout | null = null;
  private stableTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private connectingPromise: Promise<void> | null = null;

  constructor(private readonly opts: XiaozhiConnectionOptions) {}

  connect(): void {
    if (this.closed) return;
    if (this.connectingPromise || this.ws) return;
    void this.openOnce();
  }

  async forceReconnect(): Promise<void> {
    this.consecutiveAuthFails = 0;
    this.attempt = 0;
    this.cancelReconnect();
    await this.tearDownSocket();
    this.closed = false;
    this.connect();
  }

  async close(reason: string): Promise<void> {
    this.opts.logger.log(`close reason=${reason}`);
    this.closed = true;
    this.cancelReconnect();
    await this.tearDownSocket();
    this.setState('idle');
  }

  private async openOnce(): Promise<void> {
    if (this.closed) return;
    this.setState('connecting');
    try {
      const url = this.opts.getEndpoint();
      this.opts.logger.debug(
        `connecting attempt=${this.attempt} prefix=${url.slice(0, 24)}…`,
      );
      const ws = new WebSocket(url);
      this.ws = ws;

      this.connectingPromise = new Promise<void>((resolve) => {
        ws.once('open', () => {
          this.attempt = 0;
          this.setState('connected');
          this.opts.logger.log('connected');
          this.startHeartbeat();
          // Only reset auth-fail counter once the connection has stayed up
          // long enough that we trust the credentials.
          if (this.stableTimer) clearTimeout(this.stableTimer);
          this.stableTimer = setTimeout(() => {
            this.stableTimer = null;
            this.consecutiveAuthFails = 0;
          }, STABLE_AFTER_MS);
          resolve();
        });

        ws.on('message', (data: RawData) => {
          if (process.env.INTEGRATIONS_DEBUG_TOOL_IO === 'true') {
            const text =
              typeof data === 'string' ? data : (data as Buffer).toString('utf8');
            this.opts.logger.debug(`<< ${text.slice(0, 500)}`);
          }
          void this.handleFrame(data).catch((e: unknown) =>
            this.opts.logger.error(
              `handleFrame: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
        });

        ws.on('pong', () => this.resetPongDeadline());

        ws.once('close', (code: number, reasonBuf: Buffer) => {
          const reason = reasonBuf?.toString?.() ?? '';
          this.opts.logger.warn(
            `closed code=${code} reason=${reason || '(none)'}`,
          );
          this.stopHeartbeat();
          if (this.stableTimer) {
            clearTimeout(this.stableTimer);
            this.stableTimer = null;
          }
          this.ws = null;
          this.connectingPromise = null;

          if (AUTH_FAIL_CLOSE_CODES.has(code)) {
            this.consecutiveAuthFails++;
          }
          this.scheduleReconnect(reason || `close ${code}`);
          resolve();
        });

        ws.once('error', (err: Error) => {
          this.opts.logger.warn(`ws error: ${err.message}`);
          // close handler runs after error → reconnect path covered there.
        });
      });

      await this.connectingPromise;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'connect failed';
      this.opts.logger.warn(`connect failed: ${msg}`);
      this.connectingPromise = null;
      this.scheduleReconnect(msg);
    }
  }

  private async handleFrame(raw: RawData) {
    const msg = parseFrame(raw as Buffer);
    if (!msg) {
      this.send(
        errResp(null, RPC_ERROR.PARSE, 'Parse error'),
      );
      return;
    }
    const id = msg.id ?? null;
    const isNotification = msg.id === undefined;

    let response;
    switch (msg.method) {
      case 'initialize':
        response = this.opts.dispatcher.handleInitialize(msg);
        break;
      case 'notifications/initialized':
        return;
      case 'tools/list':
        response = this.opts.dispatcher.handleToolsList(msg);
        break;
      case 'tools/call':
        response = await this.opts.dispatcher.handleToolsCall(
          msg,
          this.opts.owner,
        );
        break;
      case 'ping':
        response = okResp(id, {});
        break;
      default:
        if (isNotification) return;
        response = errResp(
          id,
          RPC_ERROR.METHOD_NOT_FOUND,
          `Unknown method: ${msg.method}`,
        );
    }

    if (response && !isNotification) {
      this.send(response);
    }
  }

  private send(response: unknown): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const frame = serializeFrame(response as never);
      if (process.env.INTEGRATIONS_DEBUG_TOOL_IO === 'true') {
        this.opts.logger.debug(`>> ${frame.trim().slice(0, 500)}`);
      }
      ws.send(frame);
    } catch (err) {
      this.opts.logger.warn(
        `send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private scheduleReconnect(error: string) {
    if (this.closed) return;

    if (this.consecutiveAuthFails >= MAX_AUTH_FAILS) {
      this.setState(
        'error',
        `Authentication failed ${this.consecutiveAuthFails}x; auto-reconnect stopped. Click Test to retry.`,
      );
      return;
    }

    this.attempt++;
    const exp = Math.min(
      BASE_BACKOFF_MS * Math.pow(BACKOFF_FACTOR, this.attempt - 1),
      MAX_BACKOFF_MS,
    );
    const jitter = 0.9 + Math.random() * 0.2;
    const delay = Math.floor(exp * jitter);
    this.opts.logger.log(
      `reconnect in ${delay}ms attempt=${this.attempt} (last error: ${error})`,
    );
    this.setState('connecting', error);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openOnce();
    }, delay);
  }

  private cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.ping();
        this.resetPongDeadline();
      } catch {
        /* connection dying, close handler will fire */
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongDeadline) {
      clearTimeout(this.pongDeadline);
      this.pongDeadline = null;
    }
  }

  private resetPongDeadline() {
    if (this.pongDeadline) clearTimeout(this.pongDeadline);
    this.pongDeadline = setTimeout(() => {
      this.opts.logger.warn('pong deadline missed; terminating');
      try {
        this.ws?.terminate();
      } catch {
        /* noop */
      }
    }, PONG_DEADLINE_MS);
  }

  private async tearDownSocket() {
    this.stopHeartbeat();
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    this.connectingPromise = null;
    if (!ws) return;
    try {
      ws.removeAllListeners();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch {
      /* noop */
    }
  }

  private setState(state: ConnectionState, error: string | null = null) {
    if (this.state === state && !error) return;
    this.state = state;
    this.opts.onStateChange(state, error);
  }
}

// Re-export so types are visible from one place.
export type { Role };
