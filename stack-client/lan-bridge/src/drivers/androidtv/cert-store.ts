import * as fs from 'fs';
import * as path from 'path';

export interface AndroidTvCert {
  key: string;
  cert: string;
}

function certPath(dataDir: string, deviceId: string): string {
  return path.join(dataDir, `androidtv-cert-${deviceId}.json`);
}

/** The TLS client certificate the TV trusted during pairing. */
export function loadCert(
  dataDir: string,
  deviceId: string,
): AndroidTvCert | undefined {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(certPath(dataDir, deviceId), 'utf8'),
    );
    if (parsed?.key && parsed?.cert) return parsed as AndroidTvCert;
  } catch {
    // Not paired yet.
  }
  return undefined;
}

export function saveCert(
  dataDir: string,
  deviceId: string,
  cert: AndroidTvCert,
): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    certPath(dataDir, deviceId),
    JSON.stringify(cert),
    { mode: 0o600 },
  );
}
