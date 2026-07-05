import * as dgram from 'dgram';

/** LG webOS TVs answer this SSDP search target on the LAN. */
export const WEBOS_ST = 'urn:lge-com:service:webos-second-screen:1';

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;

export interface SsdpCandidate {
  ip: string;
  /** URL of the device description XML (friendlyName, UDN…). */
  location?: string;
  /** Unique service name, e.g. `uuid:xxxx::urn:lge-com:…`. */
  usn?: string;
}

/**
 * One SSDP M-SEARCH burst: multicasts the search and collects unicast answers
 * for `windowMs`. Dedupes by responder IP. Never rejects — network errors just
 * yield what was collected so far.
 */
export function ssdpSearch(
  st: string,
  windowMs: number,
): Promise<SsdpCandidate[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const found = new Map<string, SsdpCandidate>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve([...found.values()]);
    };

    const search = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
      'MAN: "ssdp:discover"',
      'MX: 3',
      `ST: ${st}`,
      '',
      '',
    ].join('\r\n');

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString();
      if (!text.toLowerCase().includes(st.toLowerCase())) return;
      found.set(rinfo.address, {
        ip: rinfo.address,
        location: /^location:\s*(.+)$/im.exec(text)?.[1]?.trim(),
        usn: /^usn:\s*(.+)$/im.exec(text)?.[1]?.trim(),
      });
    });
    socket.on('error', finish);

    socket.bind(() => {
      socket.send(search, SSDP_PORT, SSDP_ADDR, (err) => {
        if (err) finish();
      });
    });

    setTimeout(finish, windowMs).unref();
  });
}

/** Stable device id from the SSDP USN uuid, e.g. `webos_1f2e3d4c`. */
export function deviceIdFromUsn(usn?: string): string | undefined {
  const uuid = /uuid:([0-9a-fA-F-]+)/.exec(usn ?? '')?.[1];
  const hex = uuid?.replace(/-/g, '');
  return hex && hex.length >= 8 ? `webos_${hex.slice(0, 8).toLowerCase()}` : undefined;
}

/** Fetch the device description XML and extract its friendlyName. */
export async function fetchFriendlyName(
  location?: string,
): Promise<string | undefined> {
  if (!location) return undefined;
  try {
    const res = await fetch(location, { signal: AbortSignal.timeout(4000) });
    const xml = await res.text();
    const name = /<friendlyName>([^<]*)<\/friendlyName>/i.exec(xml)?.[1]?.trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}
