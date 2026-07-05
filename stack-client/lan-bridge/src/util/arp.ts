import * as fs from 'fs';

/**
 * Resolve a LAN IP to its MAC via the kernel ARP table (`/proc/net/arp`) —
 * available because the bridge runs with host networking. The entry exists
 * whenever we recently talked to the IP (e.g. right after pairing a TV).
 */
export async function lookupMac(ip: string): Promise<string | undefined> {
  try {
    const table = await fs.promises.readFile('/proc/net/arp', 'utf8');
    for (const line of table.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      // Columns: IP, HW type, Flags, HW address, Mask, Device.
      if (cols[0] === ip && cols[3] && cols[3] !== '00:00:00:00:00:00') {
        return cols[3].toUpperCase();
      }
    }
  } catch {
    // Non-Linux dev machine or unreadable — WoL just stays unavailable.
  }
  return undefined;
}
