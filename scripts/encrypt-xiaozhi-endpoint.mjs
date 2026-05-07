#!/usr/bin/env node
/**
 * One-shot helper: encrypt a plaintext WebSocket endpoint with the same
 * AES-256-GCM scheme used by libs/crypto so you can paste the result
 * into a manual `INSERT INTO xiaozhi_integrations` for local testing
 * (bypassing the strict regex on POST).
 *
 * Usage:
 *   INTEGRATIONS_ENCRYPTION_KEY=<64hex> \
 *     node scripts/encrypt-xiaozhi-endpoint.mjs "ws://localhost:9999/?token=fake"
 *
 * Output: the dot-separated ciphertext, ready for endpoint_encrypted.
 */
import { createCipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

const plaintext = process.argv[2];
if (!plaintext) {
  console.error('usage: encrypt-xiaozhi-endpoint.mjs "<plaintext URL>"');
  process.exit(1);
}

const keyHex = process.env.INTEGRATIONS_ENCRYPTION_KEY;
if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
  console.error(
    'INTEGRATIONS_ENCRYPTION_KEY env var is required and must be 64 hex chars.',
  );
  process.exit(1);
}

const key = Buffer.from(keyHex, 'hex');
if (key.length !== KEY_BYTES) {
  console.error('Key must decode to 32 bytes.');
  process.exit(1);
}

const iv = randomBytes(IV_BYTES);
const cipher = createCipheriv(ALGO, key, iv);
const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const envelope = `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
const prefix = plaintext.slice(0, 24);

console.log('endpoint_encrypted:', envelope);
console.log('endpoint_prefix    :', prefix);
