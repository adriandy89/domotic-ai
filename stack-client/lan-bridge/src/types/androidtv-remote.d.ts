declare module 'androidtv-remote' {
  import { EventEmitter } from 'events';

  interface AndroidRemoteCert {
    key?: string;
    cert?: string;
  }

  interface AndroidRemoteOptions {
    cert?: AndroidRemoteCert;
    pairing_port?: number;
    remote_port?: number;
    service_name?: string;
  }

  /**
   * Events: 'secret' (TV shows the pairing code), 'powered' (boolean),
   * 'volume' ({level, maximum, muted}), 'current_app' (string), 'ready',
   * 'unpaired', 'error'.
   */
  export class AndroidRemote extends EventEmitter {
    constructor(host: string, options: AndroidRemoteOptions);
    start(): Promise<boolean>;
    sendCode(code: string): boolean;
    sendPower(): void;
    sendAppLink(appLink: string): void;
    sendKey(key: number, direction: number): void;
    getCertificate(): { key: string; cert: string };
    stop(): void;
  }

  export const RemoteKeyCode: Record<string, number>;
  export const RemoteDirection: Record<string, number>;
}
