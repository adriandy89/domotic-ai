declare module 'lgtv2' {
  import { EventEmitter } from 'events';

  interface LgTvConfig {
    url: string;
    timeout?: number;
    /** Reconnect interval in ms, or false to disable. */
    reconnect?: number | false;
    /** Path prefix where the pairing client-key is persisted (host appended). */
    keyFile?: string;
    clientKey?: string;
    saveKey?: (key: string, cb: (err?: Error) => void) => void;
  }

  interface LgTv extends EventEmitter {
    request(uri: string, cb: (err: Error | null, res?: any) => void): void;
    request(
      uri: string,
      payload?: unknown,
      cb?: (err: Error | null, res?: any) => void,
    ): void;
    subscribe(uri: string, cb: (err: Error | null, res?: any) => void): void;
    subscribe(
      uri: string,
      payload?: unknown,
      cb?: (err: Error | null, res?: any) => void,
    ): void;
    disconnect(): void;
  }

  function lgtv(config: LgTvConfig): LgTv;
  export = lgtv;
}
