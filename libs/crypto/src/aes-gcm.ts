import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;

export function loadEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const raw = env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'INTEGRATIONS_ENCRYPTION_KEY is required (64 hex chars / 32 bytes).',
    );
  }
  if (!HEX_KEY_RE.test(raw)) {
    throw new Error('INTEGRATIONS_ENCRYPTION_KEY must be 64 hex characters.');
  }
  return Buffer.from(raw, 'hex');
}

export function aesGcmEncrypt(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error(`AES key must be ${KEY_BYTES} bytes.`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

export function aesGcmDecrypt(token: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error(`AES key must be ${KEY_BYTES} bytes.`);
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext envelope (expected iv.tag.ct).');
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Malformed ciphertext (iv/tag length mismatch).');
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
