import * as dgram from 'dgram';

/** Parse `AA:BB:CC:DD:EE:FF` (also `-`/no separator) into its 6 bytes. */
export function parseMac(mac: string): Buffer {
  const hex = mac.replace(/[:\-.]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
  return Buffer.from(hex, 'hex');
}

/** Build the WoL magic packet: 6×0xFF followed by the MAC repeated 16 times. */
export function buildMagicPacket(mac: string): Buffer {
  const macBytes = parseMac(mac);
  const packet = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(packet, 6 + i * 6);
  }
  return packet;
}

/** Broadcast a Wake-on-LAN magic packet for `mac` (UDP port 9). */
export function wake(mac: string): Promise<void> {
  const packet = buildMagicPacket(mac);
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', (err) => {
      socket.close();
      reject(err);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 9, '255.255.255.255', (err) => {
        socket.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}
