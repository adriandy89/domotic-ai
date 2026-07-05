import { Bonjour } from 'bonjour-service';

/** Android/Google TVs announce the Remote v2 service over mDNS. */
export const ANDROIDTV_MDNS_TYPE = 'androidtvremote2';

export interface MdnsCandidate {
  ip: string;
  /** mDNS instance name — usually the TV's friendly name. */
  name: string;
  port: number;
}

/**
 * One mDNS browse burst: collects services of `type` for `windowMs`. Dedupes
 * by IPv4 address. Never rejects — errors just yield what was collected.
 */
export function mdnsSearch(
  type: string,
  windowMs: number,
): Promise<MdnsCandidate[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found = new Map<string, MdnsCandidate>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        browser.stop();
        bonjour.destroy();
      } catch {
        // already destroyed
      }
      resolve([...found.values()]);
    };

    const browser = bonjour.find({ type, protocol: 'tcp' }, (service) => {
      const ip = service.addresses?.find((a) =>
        /^\d+\.\d+\.\d+\.\d+$/.test(a),
      );
      if (!ip) return;
      found.set(ip, { ip, name: service.name, port: service.port });
    });

    setTimeout(finish, windowMs).unref();
  });
}
