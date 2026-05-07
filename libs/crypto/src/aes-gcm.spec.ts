import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  loadEncryptionKey,
  safeEqual,
} from './aes-gcm';

const KEY_HEX = 'a'.repeat(64);
const KEY = Buffer.from(KEY_HEX, 'hex');

describe('aes-gcm', () => {
  it('round-trips a plaintext', () => {
    const pt = 'wss://api.xiaozhi.me/mcp/?token=abc.def.ghi';
    const ct = aesGcmEncrypt(pt, KEY);
    expect(ct.split('.')).toHaveLength(3);
    expect(aesGcmDecrypt(ct, KEY)).toBe(pt);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const pt = 'hello world';
    const a = aesGcmEncrypt(pt, KEY);
    const b = aesGcmEncrypt(pt, KEY);
    expect(a).not.toBe(b);
  });

  it('throws when the tag is tampered', () => {
    const ct = aesGcmEncrypt('payload', KEY);
    const [iv, , data] = ct.split('.');
    const bogusTag = Buffer.alloc(16, 0).toString('base64');
    expect(() => aesGcmDecrypt(`${iv}.${bogusTag}.${data}`, KEY)).toThrow();
  });

  it('throws when the ciphertext is tampered', () => {
    const ct = aesGcmEncrypt('payload', KEY);
    const [iv, tag, data] = ct.split('.');
    const bogusData = Buffer.from(data, 'base64');
    bogusData[0] ^= 0xff;
    expect(() =>
      aesGcmDecrypt(`${iv}.${tag}.${bogusData.toString('base64')}`, KEY),
    ).toThrow();
  });

  it('throws on a malformed envelope', () => {
    expect(() => aesGcmDecrypt('not.a.valid', KEY)).toThrow();
    expect(() => aesGcmDecrypt('only-two.parts', KEY)).toThrow();
  });

  it('throws on a wrong-length key', () => {
    const shortKey = Buffer.alloc(16, 0);
    expect(() => aesGcmEncrypt('x', shortKey)).toThrow(/AES key must be/);
    expect(() => aesGcmDecrypt('a.b.c', shortKey)).toThrow(/AES key must be/);
  });

  describe('loadEncryptionKey', () => {
    it('throws when env var is missing', () => {
      expect(() => loadEncryptionKey({})).toThrow(/required/);
    });

    it('throws on bad hex format', () => {
      expect(() =>
        loadEncryptionKey({ INTEGRATIONS_ENCRYPTION_KEY: 'not-hex' }),
      ).toThrow(/64 hex/);
      expect(() =>
        loadEncryptionKey({ INTEGRATIONS_ENCRYPTION_KEY: 'a'.repeat(63) }),
      ).toThrow(/64 hex/);
    });

    it('returns a 32-byte buffer for valid input', () => {
      const k = loadEncryptionKey({ INTEGRATIONS_ENCRYPTION_KEY: KEY_HEX });
      expect(k.length).toBe(32);
    });
  });

  describe('safeEqual', () => {
    it('returns true for equal buffers', () => {
      expect(safeEqual(Buffer.from('abc'), Buffer.from('abc'))).toBe(true);
    });
    it('returns false for different lengths without throwing', () => {
      expect(safeEqual(Buffer.from('ab'), Buffer.from('abc'))).toBe(false);
    });
    it('returns false for different content', () => {
      expect(safeEqual(Buffer.from('abc'), Buffer.from('abd'))).toBe(false);
    });
  });
});
