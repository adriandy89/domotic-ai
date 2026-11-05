import * as crypto from 'crypto';
import {
  AlexaOAuthService,
  OAuthGrantError,
  REFRESH_ROTATION_GRACE_MS,
} from './alexa-oauth.service';

/** Minimal DbService stub covering the methods the service touches. */
function makeDb() {
  return {
    alexaAuthCode: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 0 })),
    },
    alexaAccessToken: {
      create: jest.fn().mockReturnValue(Promise.resolve({})),
      deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 0 })),
    },
    alexaRefreshToken: {
      create: jest.fn().mockReturnValue(Promise.resolve({})),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockReturnValue(Promise.resolve({ count: 0 })),
      deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 0 })),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ is_active: true, organization_id: 'org1' }),
    },
    alexaOAuthClient: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ organization_id: 'org1', disabled: false }),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('AlexaOAuthService', () => {
  let db: ReturnType<typeof makeDb>;
  let svc: AlexaOAuthService;

  beforeEach(() => {
    db = makeDb();
    svc = new AlexaOAuthService(db as any);
  });

  it('issues a code whose raw value is only stored hashed', async () => {
    const raw = await svc.issueAuthCode({
      userId: 'u1',
      clientId: 'c1',
      redirectUri: 'https://layla.amazon.com/api/skill/link/X',
    });
    expect(raw).toMatch(/^alexacode_/);
    const data = db.alexaAuthCode.create.mock.calls[0][0].data;
    expect(data.code_hash).toBe(sha256(raw));
    expect(JSON.stringify(data)).not.toContain(raw);
  });

  describe('exchangeAuthCode', () => {
    const baseRow = {
      code_hash: 'h',
      client_id: 'c1',
      user_id: 'u1',
      redirect_uri: 'https://layla.amazon.com/api/skill/link/X',
      scope: null,
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
    };

    it('exchanges a valid code for a token pair', async () => {
      db.alexaAuthCode.findUnique.mockResolvedValue(baseRow);
      db.alexaAuthCode.updateMany.mockResolvedValue({ count: 1 });
      const pair = await svc.exchangeAuthCode({
        clientId: 'c1',
        code: 'raw',
        redirectUri: baseRow.redirect_uri,
      });
      expect(pair.access_token).toMatch(/^alexaat_/);
      expect(pair.refresh_token).toMatch(/^alexart_/);
      expect(pair.expires_in).toBe(3600);
      // single-use guard is atomic on consumed_at: null
      expect(db.alexaAuthCode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code_hash: 'h', consumed_at: null },
        }),
      );
    });

    it('rejects an expired code', async () => {
      db.alexaAuthCode.findUnique.mockResolvedValue({
        ...baseRow,
        expires_at: new Date(Date.now() - 1000),
      });
      await expect(
        svc.exchangeAuthCode({
          clientId: 'c1',
          code: 'raw',
          redirectUri: baseRow.redirect_uri,
        }),
      ).rejects.toThrow(OAuthGrantError);
    });

    it('rejects a redirect_uri mismatch', async () => {
      db.alexaAuthCode.findUnique.mockResolvedValue(baseRow);
      await expect(
        svc.exchangeAuthCode({
          clientId: 'c1',
          code: 'raw',
          redirectUri: 'https://pitangui.amazon.com/other',
        }),
      ).rejects.toThrow('redirect_uri mismatch');
    });

    it('rejects a wrong client', async () => {
      db.alexaAuthCode.findUnique.mockResolvedValue(baseRow);
      await expect(
        svc.exchangeAuthCode({
          clientId: 'other-client',
          code: 'raw',
          redirectUri: baseRow.redirect_uri,
        }),
      ).rejects.toThrow(OAuthGrantError);
    });

    it('rejects a replayed code and revokes the tokens it produced', async () => {
      db.alexaAuthCode.findUnique.mockResolvedValue(baseRow);
      db.alexaAuthCode.updateMany.mockResolvedValue({ count: 0 }); // already consumed
      await expect(
        svc.exchangeAuthCode({
          clientId: 'c1',
          code: 'raw',
          redirectUri: baseRow.redirect_uri,
        }),
      ).rejects.toThrow('already used');
      // Explicit revocation DELETES (rotated rows stay usable in the grace window).
      expect(db.alexaRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'u1', client_id: 'c1' },
      });
    });
  });

  describe('refresh', () => {
    const liveRow = (revoked_at: Date | null = null) => ({
      token_hash: 'rh',
      client_id: 'c1',
      user_id: 'u1',
      scope: null,
      revoked_at,
    });

    it('rotates the refresh token', async () => {
      db.alexaRefreshToken.findUnique.mockResolvedValue(liveRow());
      const pair = await svc.refresh({ clientId: 'c1', refreshToken: 'raw' });
      expect(pair.refresh_token).toMatch(/^alexart_/);
      expect(db.alexaRefreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token_hash: 'rh', revoked_at: null },
          data: expect.objectContaining({ revoked_at: expect.any(Date) }),
        }),
      );
    });

    it('accepts a just-rotated token inside the grace window (Alexa retry)', async () => {
      db.alexaRefreshToken.findUnique.mockResolvedValue(
        liveRow(new Date(Date.now() - (REFRESH_ROTATION_GRACE_MS - 5_000))),
      );
      const pair = await svc.refresh({ clientId: 'c1', refreshToken: 'raw' });
      expect(pair.access_token).toMatch(/^alexaat_/);
    });

    it('rejects a token rotated longer ago than the grace window', async () => {
      db.alexaRefreshToken.findUnique.mockResolvedValue(
        liveRow(new Date(Date.now() - (REFRESH_ROTATION_GRACE_MS + 5_000))),
      );
      await expect(
        svc.refresh({ clientId: 'c1', refreshToken: 'raw' }),
      ).rejects.toThrow(OAuthGrantError);
      expect(db.alexaAccessToken.create).not.toHaveBeenCalled();
    });

    it('rejects when the user was deactivated', async () => {
      db.alexaRefreshToken.findUnique.mockResolvedValue(liveRow());
      db.user.findUnique.mockResolvedValueOnce({
        is_active: false,
        organization_id: 'org1',
      });
      await expect(
        svc.refresh({ clientId: 'c1', refreshToken: 'raw' }),
      ).rejects.toThrow(OAuthGrantError);
    });

    it("rejects when the client no longer belongs to the user's organization", async () => {
      db.alexaRefreshToken.findUnique.mockResolvedValue(liveRow());
      db.alexaOAuthClient.findUnique.mockResolvedValueOnce({
        organization_id: 'org2',
        disabled: false,
      });
      await expect(
        svc.refresh({ clientId: 'c1', refreshToken: 'raw' }),
      ).rejects.toThrow(OAuthGrantError);
    });

    it('rejects a token issued to another client', async () => {
      db.alexaRefreshToken.findUnique.mockResolvedValue(liveRow());
      await expect(
        svc.refresh({ clientId: 'other', refreshToken: 'raw' }),
      ).rejects.toThrow(OAuthGrantError);
    });
  });

  it('unlinking deletes every refresh token of the user (no grace reuse)', async () => {
    await svc.revokeAllForUser('u1');
    expect(db.alexaRefreshToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'u1' },
    });
    expect(db.alexaRefreshToken.updateMany).not.toHaveBeenCalled();
  });
});
