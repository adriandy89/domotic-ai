// Keep jest away from the generated Prisma client (ESM-only imports).
jest.mock('@app/db', () => ({ DbService: class DbService {} }));

import { aesGcmEncrypt } from '@app/crypto';
import type { DbService } from '@app/db';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  ProviderCredentialsService,
  maskToken,
} from './provider-credentials.service';

const TEST_KEY = randomBytes(32).toString('hex');

interface CredentialRow {
  source: string;
  token_encrypted: string;
  created_at: Date;
  updated_at: Date | null;
}

function makeService(options: {
  rows?: CredentialRow[];
  env?: Record<string, string>;
}) {
  const rows = options.rows ?? [];
  const db = {
    pricingProviderCredential: {
      findMany: jest.fn(async () => rows),
      upsert: jest.fn(async ({ create }: { create: CredentialRow }) => ({
        ...create,
        created_at: new Date('2026-06-12T10:00:00Z'),
        updated_at: new Date('2026-06-12T10:00:00Z'),
      })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
  } as unknown as DbService;
  const config = {
    get: jest.fn(
      (key: string, fallback = '') => options.env?.[key] ?? fallback,
    ),
  } as unknown as ConfigService;
  const service = new ProviderCredentialsService(db, config);
  return { service, db };
}

describe('ProviderCredentialsService', () => {
  const prevKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = TEST_KEY;
  });
  afterAll(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = prevKey;
  });

  const encryptedRow = (source: string, token: string): CredentialRow => ({
    source,
    token_encrypted: aesGcmEncrypt(token, Buffer.from(TEST_KEY, 'hex')),
    created_at: new Date('2026-06-01T00:00:00Z'),
    updated_at: new Date('2026-06-02T00:00:00Z'),
  });

  it('falls back to the env var when no DB row exists', async () => {
    const { service } = makeService({
      env: { ESIOS_API_TOKEN: 'env-token' },
    });
    await service.onModuleInit();
    expect(service.getToken('esios_pvpc')).toBe('env-token');
    expect(service.tokenInfo('esios_pvpc')).toMatchObject({
      status: 'configured',
      origin: 'env',
      masked: '••••oken',
      updatedAt: null,
    });
  });

  it('returns null for sources without DB row or env var', async () => {
    const { service } = makeService({});
    await service.onModuleInit();
    expect(service.getToken('entsoe')).toBeNull();
    expect(service.tokenInfo('entsoe')).toMatchObject({
      status: 'not_configured',
      origin: null,
      masked: null,
    });
  });

  it('decrypts DB rows on init and prefers them over env vars', async () => {
    const { service } = makeService({
      rows: [encryptedRow('esios_pvpc', 'db-token-42ab')],
      env: { ESIOS_API_TOKEN: 'env-token' },
    });
    await service.onModuleInit();
    expect(service.getToken('esios_pvpc')).toBe('db-token-42ab');
    expect(service.tokenInfo('esios_pvpc')).toMatchObject({
      status: 'configured',
      origin: 'db',
      masked: '••••42ab',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });
  });

  it('setToken persists encrypted and updates the snapshot', async () => {
    const { service, db } = makeService({});
    await service.onModuleInit();
    await service.setToken('entsoe', '  new-token  ');

    expect(service.getToken('entsoe')).toBe('new-token');
    const upsert = (
      db.pricingProviderCredential.upsert as jest.Mock
    ).mock.calls[0][0];
    expect(upsert.create.source).toBe('entsoe');
    expect(upsert.create.token_encrypted).not.toContain('new-token');
  });

  it('setToken(null) clears the row and falls back to env', async () => {
    const { service, db } = makeService({
      rows: [encryptedRow('esios_pvpc', 'db-token')],
      env: { ESIOS_API_TOKEN: 'env-token' },
    });
    await service.onModuleInit();
    await service.setToken('esios_pvpc', null);

    expect(db.pricingProviderCredential.deleteMany).toHaveBeenCalledWith({
      where: { source: 'esios_pvpc' },
    });
    expect(service.getToken('esios_pvpc')).toBe('env-token');
  });

  it('setToken clears a previous auth rejection', async () => {
    const { service } = makeService({});
    await service.onModuleInit();
    service.reportAuthRejected('entsoe');
    expect(service.isAuthRejected('entsoe')).toBe(true);

    await service.setToken('entsoe', 'fresh-token');
    expect(service.isAuthRejected('entsoe')).toBe(false);
  });

  it('reports rejected status while a token exists and auth failed', async () => {
    const { service } = makeService({
      rows: [encryptedRow('esios_pvpc', 'bad-token')],
    });
    await service.onModuleInit();
    service.reportAuthRejected('esios_pvpc');
    expect(service.tokenInfo('esios_pvpc').status).toBe('rejected');
  });

  it('survives rows it cannot decrypt (rotated key)', async () => {
    const otherKey = randomBytes(32);
    const { service } = makeService({
      rows: [
        {
          source: 'esios_pvpc',
          token_encrypted: aesGcmEncrypt('old-secret', otherKey),
          created_at: new Date(),
          updated_at: null,
        },
      ],
    });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.getToken('esios_pvpc')).toBeNull();
  });
});

describe('maskToken', () => {
  it('shows only the last 4 characters', () => {
    expect(maskToken('abcdef42ab')).toBe('••••42ab');
  });
  it('fully masks very short tokens', () => {
    expect(maskToken('abc')).toBe('••••');
  });
});
