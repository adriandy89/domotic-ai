import { deriveEdgeToken } from './derive-token';
import { signBundle, verifyBundle } from '@app/rules-evaluator';
import type { EdgeBundle } from '@app/rules-evaluator';

describe('deriveEdgeToken', () => {
  it('is deterministic for the same secret + home', () => {
    expect(deriveEdgeToken('master', 'home-1')).toBe(
      deriveEdgeToken('master', 'home-1'),
    );
  });

  it('differs per home and per master secret', () => {
    expect(deriveEdgeToken('master', 'home-1')).not.toBe(
      deriveEdgeToken('master', 'home-2'),
    );
    expect(deriveEdgeToken('master-a', 'home-1')).not.toBe(
      deriveEdgeToken('master-b', 'home-1'),
    );
  });

  it('a bundle signed with a home token verifies with that same derived token', () => {
    const bundle = {
      homeUniqueId: 'home-1',
      organizationId: 'org-1',
      timezone: 'UTC',
      version: 1,
      devices: [],
      rules: [],
      schedules: [],
    } as EdgeBundle;
    const token = deriveEdgeToken('master', 'home-1');
    const signed = signBundle(bundle, token);
    expect(verifyBundle(signed, token)).toBe(true);
    // A different home's token must NOT verify it.
    expect(verifyBundle(signed, deriveEdgeToken('master', 'home-2'))).toBe(false);
  });
});
