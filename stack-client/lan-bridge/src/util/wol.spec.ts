import { buildMagicPacket, parseMac } from './wol';

describe('parseMac', () => {
  it('parses colon / dash / bare formats', () => {
    const expected = Buffer.from('aabbccddeeff', 'hex');
    expect(parseMac('AA:BB:CC:DD:EE:FF')).toEqual(expected);
    expect(parseMac('aa-bb-cc-dd-ee-ff')).toEqual(expected);
    expect(parseMac('aabbccddeeff')).toEqual(expected);
  });

  it('rejects invalid MACs', () => {
    expect(() => parseMac('not-a-mac')).toThrow('Invalid MAC');
    expect(() => parseMac('AA:BB:CC:DD:EE')).toThrow('Invalid MAC');
  });
});

describe('buildMagicPacket', () => {
  it('is 6×0xFF then the MAC repeated 16 times', () => {
    const packet = buildMagicPacket('AA:BB:CC:DD:EE:FF');
    expect(packet.length).toBe(102);
    expect(packet.subarray(0, 6)).toEqual(Buffer.alloc(6, 0xff));
    for (let i = 0; i < 16; i++) {
      expect(packet.subarray(6 + i * 6, 12 + i * 6)).toEqual(
        Buffer.from('aabbccddeeff', 'hex'),
      );
    }
  });
});
