import * as crypto from 'crypto';
import { AlexaTokenService } from './alexa-token.service';

function makeDb() {
  return {
    alexaAccessToken: { findUnique: jest.fn() },
    alexaOAuthClient: { findUnique: jest.fn() },
  };
}

const RAW = 'alexaat_test-token';
const liveRow = () => ({
  expires_at: new Date(Date.now() + 60_000),
  client_id: 'c1',
  user: { id: 'u1', role: 'USER', organization_id: 'org1', is_active: true },
});

describe('AlexaTokenService', () => {
  let db: ReturnType<typeof makeDb>;
  let svc: AlexaTokenService;

  beforeEach(() => {
    db = makeDb();
    svc = new AlexaTokenService(db as any);
  });

  it('resolves a live token by its sha256 hash', async () => {
    db.alexaAccessToken.findUnique.mockResolvedValue(liveRow());
    db.alexaOAuthClient.findUnique.mockResolvedValue({
      disabled: false,
      organization_id: 'org1',
    });
    await expect(svc.authenticate(RAW)).resolves.toEqual({
      userId: 'u1',
      organizationId: 'org1',
      role: 'USER',
    });
    const hash = crypto.createHash('sha256').update(RAW).digest('hex');
    expect(db.alexaAccessToken.findUnique.mock.calls[0][0].where).toEqual({
      token_hash: hash,
    });
  });

  it('rejects tokens without the alexaat_ prefix without hitting the DB', async () => {
    await expect(svc.authenticate('mcp_whatever')).resolves.toBeNull();
    expect(db.alexaAccessToken.findUnique).not.toHaveBeenCalled();
  });

  it('rejects expired tokens and inactive users', async () => {
    db.alexaAccessToken.findUnique.mockResolvedValueOnce({
      ...liveRow(),
      expires_at: new Date(Date.now() - 1),
    });
    await expect(svc.authenticate(RAW)).resolves.toBeNull();

    db.alexaAccessToken.findUnique.mockResolvedValueOnce({
      ...liveRow(),
      user: { ...liveRow().user, is_active: false },
    });
    await expect(svc.authenticate(RAW)).resolves.toBeNull();
  });

  it('rejects tokens of a disabled or deleted client immediately', async () => {
    db.alexaAccessToken.findUnique.mockResolvedValue(liveRow());

    db.alexaOAuthClient.findUnique.mockResolvedValueOnce({
      disabled: true,
      organization_id: 'org1',
    });
    await expect(svc.authenticate(RAW)).resolves.toBeNull();

    db.alexaOAuthClient.findUnique.mockResolvedValueOnce(null);
    await expect(svc.authenticate(RAW)).resolves.toBeNull();
  });

  it('rejects a token whose client belongs to another organization', async () => {
    db.alexaAccessToken.findUnique.mockResolvedValue(liveRow());
    db.alexaOAuthClient.findUnique.mockResolvedValue({
      disabled: false,
      organization_id: 'org2',
    });
    await expect(svc.authenticate(RAW)).resolves.toBeNull();
  });
});
