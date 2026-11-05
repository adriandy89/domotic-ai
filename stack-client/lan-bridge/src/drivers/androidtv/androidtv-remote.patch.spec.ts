import { EventEmitter } from 'events';
import * as tls from 'tls';
import { AndroidRemote } from 'androidtv-remote';

/**
 * Guards the pnpm patch on androidtv-remote@1.0.10 (patches/). Unpatched, the
 * library reconnects every second forever when the TV rejects our client
 * certificate (TLS alert "certificate unknown" after a reset/forgotten pairing)
 * and `stop()` reconnects too. If these tests fail after an upgrade, the patch
 * was lost — re-apply it (see README "Android TV").
 */

// Each tls.connect() hands out a fake socket driven by hand from the test.
const mockSockets: MockSocket[] = [];
class MockSocket extends EventEmitter {
  destroyed = false;
  setTimeout = jest.fn();
  write = jest.fn();
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Like a real socket: destroy() without an error closes with hadError=false.
    this.emit('close', false);
  }
}

jest.mock('tls', () => {
  const actual = jest.requireActual('tls');
  const connect = jest.fn(() => {
    const socket = new MockSocket();
    mockSockets.push(socket);
    return socket;
  });
  return { __esModule: true, ...actual, connect, default: { ...actual, connect } };
});

// Pairing generates a 2048-bit RSA cert in pure JS: too slow for a unit test.
jest.mock('androidtv-remote/dist/certificate/CertificateGenerator.js', () => ({
  CertificateGenerator: { generateFull: () => ({ key: 'NEWKEY', cert: 'NEWCERT' }) },
}));

jest.useFakeTimers();

// Frames as the TV sends them (length-delimited protobuf).
const { remoteMessageManager } = jest.requireActual(
  'androidtv-remote/dist/remote/RemoteMessageManager.js',
);
const configureFrame = (): Buffer =>
  remoteMessageManager.createRemoteConfigure(622, 'model', 'vendor', 1, '1');
const remoteErrorFrame = (): Buffer =>
  remoteMessageManager.create({ remoteError: { value: true } });

const CERT = { key: 'KEY', cert: 'CERT' };

function tlsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** start() waits 1s before dialing; returns the socket once TLS is up. */
async function connected(remote: AndroidRemote): Promise<MockSocket> {
  const started = remote.start();
  await jest.advanceTimersByTimeAsync(1000);
  const socket = mockSockets.at(-1)!;
  socket.emit('secureConnect');
  await started;
  return socket;
}

describe('androidtv-remote (patched)', () => {
  beforeEach(() => {
    mockSockets.length = 0;
    (tls.connect as unknown as jest.Mock).mockClear();
    // The library logs every step with console.*.
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  it.each([
    ['ERR_SSL_SSL/TLS_ALERT_CERTIFICATE_UNKNOWN', false],
    ['ERR_SSL_SSL/TLS_ALERT_CERTIFICATE_UNKNOWN', true],
    ['ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE', false],
    ['ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED', false],
  ])(
    'emits "unpaired" once and stops retrying when the TV rejects our certificate (%s, hadError=%s)',
    async (code, hadError) => {
      const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
      const unpaired = jest.fn();
      remote.on('unpaired', unpaired);

      const socket = await connected(remote);
      // Production log: the alert arrives after secureConnect (TLS 1.3) and the
      // socket then closes with hadError=false.
      socket.emit('error', tlsError(code));
      socket.emit('close', hadError);
      await jest.advanceTimersByTimeAsync(30_000);

      expect(unpaired).toHaveBeenCalledTimes(1);
      expect(mockSockets).toHaveLength(1);
    },
  );

  it('stop() closes the connection for good (no reconnect)', async () => {
    const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
    const socket = await connected(remote);

    remote.stop();
    await jest.advanceTimersByTimeAsync(30_000);

    expect(socket.destroyed).toBe(true);
    expect(mockSockets).toHaveLength(1);
  });

  it('stop() during the initial delay never dials the TV', async () => {
    const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
    const started = remote.start();

    expect(() => remote.stop()).not.toThrow();
    await jest.advanceTimersByTimeAsync(30_000);
    await started;

    expect(mockSockets).toHaveLength(0);
  });

  it('a reset AFTER the TV accepted us is transient: reconnects, not unpaired', async () => {
    const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
    const unpaired = jest.fn();
    const ready = jest.fn();
    remote.on('unpaired', unpaired);
    remote.on('ready', ready);
    const socket = await connected(remote);
    socket.emit('data', configureFrame());
    expect(ready).toHaveBeenCalledTimes(1);

    socket.emit('error', tlsError('ECONNRESET'));
    socket.emit('close', true);
    await jest.advanceTimersByTimeAsync(1000);

    expect(unpaired).not.toHaveBeenCalled();
    expect(mockSockets).toHaveLength(2);
    remote.stop();
  });

  it('a reset BEFORE the TV accepted us still means "unpaired" (no retry)', async () => {
    const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
    const unpaired = jest.fn();
    remote.on('unpaired', unpaired);
    const socket = await connected(remote);

    socket.emit('error', tlsError('ECONNRESET'));
    socket.emit('close', true);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(unpaired).toHaveBeenCalledTimes(1);
    expect(mockSockets).toHaveLength(1);
  });

  it('a RemoteError frame from the TV is forwarded as "error" instead of crashing', async () => {
    const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
    const onError = jest.fn();
    remote.on('error', onError);
    const socket = await connected(remote);

    expect(() => socket.emit('data', remoteErrorFrame())).not.toThrow();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() }),
    );
    remote.stop();
  });

  it('stop() before start() is final too', async () => {
    const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
    remote.stop();
    await expect(remote.start()).resolves.toBe(false);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(mockSockets).toHaveLength(0);
  });

  it('stop() while pairing closes the pairing socket and never dials the remote port', async () => {
    const remote = new AndroidRemote('192.168.1.65', { service_name: 'test' });
    const started = remote.start(); // no cert → pairing (port 6467) first
    await jest.advanceTimersByTimeAsync(0);
    expect(mockSockets).toHaveLength(1);

    expect(() => remote.stop()).not.toThrow();
    await jest.advanceTimersByTimeAsync(30_000);

    expect(mockSockets[0].destroyed).toBe(true);
    expect(mockSockets).toHaveLength(1);
    await expect(started).resolves.toBe(false);
  });

  it('still retries transient failures (TV not reachable yet)', async () => {
    const remote = new AndroidRemote('192.168.1.65', { cert: CERT });
    const unpaired = jest.fn();
    remote.on('unpaired', unpaired);
    const started = remote.start();
    await jest.advanceTimersByTimeAsync(1000);

    mockSockets[0].emit('error', tlsError('ECONNREFUSED'));
    mockSockets[0].emit('close', true);
    await started;
    await jest.advanceTimersByTimeAsync(1000);

    expect(mockSockets).toHaveLength(2);
    expect(unpaired).not.toHaveBeenCalled();
    remote.stop();
  });
});
