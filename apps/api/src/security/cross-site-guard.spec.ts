import { isCrossSiteWriteAllowed } from './cross-site-guard';

const allowedOrigins = ['https://app.domotic-ai.com', 'http://localhost:5173'];
const host = 'api.domotic-ai.com';

function check(method: string, origin?: string) {
  return isCrossSiteWriteAllowed({ method, origin, host, allowedOrigins });
}

describe('isCrossSiteWriteAllowed', () => {
  it('blocks a cross-site form POST from an unknown origin (CSRF)', () => {
    expect(check('POST', 'https://evil.example')).toBe(false);
    expect(check('DELETE', 'https://evil.example')).toBe(false);
  });

  it('allows writes from the configured web origins', () => {
    expect(check('POST', 'https://app.domotic-ai.com')).toBe(true);
    expect(check('PATCH', 'http://localhost:5173')).toBe(true);
  });

  it("allows writes from the API's own origin (Alexa consent form)", () => {
    expect(check('POST', 'https://api.domotic-ai.com')).toBe(true);
  });

  it('allows requests without Origin (server-to-server clients)', () => {
    expect(check('POST', undefined)).toBe(true);
  });

  it('allows safe methods from anywhere', () => {
    expect(check('GET', 'https://evil.example')).toBe(true);
    expect(check('OPTIONS', 'https://evil.example')).toBe(true);
  });

  it('blocks the opaque "null" origin and lookalike hosts', () => {
    expect(check('POST', 'null')).toBe(false);
    expect(check('POST', 'https://api.domotic-ai.com.evil.example')).toBe(
      false,
    );
    expect(check('POST', 'https://app.domotic-ai.com.evil.example')).toBe(
      false,
    );
  });
});
