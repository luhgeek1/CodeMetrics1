import { validateEnvironment } from '../../src/config/environment.js';

const input = {
  DATABASE_URL: 'postgresql+asyncpg://postgres:secret@localhost/app_test',
  JWT_SECRET: 'a-test-signing-key-with-at-least-32-characters',
  CSRF_HMAC_KEY: 'a-test-csrf-key-with-16-characters',
};

describe('startup configuration', () => {
  it('normalizes legacy database URLs and applies safe defaults', () => {
    const config = validateEnvironment(input);
    expect(config.DATABASE_URL).toBe(
      'postgresql://postgres:secret@localhost/app_test',
    );
    expect(config.COOKIE_SECURE).toBe(true);
    expect(config.GRAPHQL_SANDBOX).toBe(true);
    expect(config.SYNC_ON_START).toBe(true);
  });

  it('accepts explicit booleans and rejects misspelled switches', () => {
    expect(
      validateEnvironment({ ...input, SYNC_ON_START: 'false' }).SYNC_ON_START,
    ).toBe(false);
    expect(
      validateEnvironment({ ...input, COOKIE_SECURE: false }).COOKIE_SECURE,
    ).toBe(false);
    expect(() =>
      validateEnvironment({ ...input, GRAPHQL_SANDBOX: 'tru' }),
    ).toThrow();
  });

  it.each(['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'])(
    'rejects an incomplete RSA key pair (%s) even when an HMAC key exists',
    (key) => {
      expect(() =>
        validateEnvironment({ ...input, [key]: 'incomplete-key' }),
      ).toThrow('must be configured together');
    },
  );
});
