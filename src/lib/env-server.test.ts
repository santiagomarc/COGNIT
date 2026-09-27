import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getServerEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not require CRON_SECRET in production, so AI calls keep working without it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('CRON_SECRET', '');
    const { getServerEnv } = await import('./env-server');
    expect(getServerEnv().GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
  });

  it('still requires the Gemini key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const { getServerEnv } = await import('./env-server');
    expect(() => getServerEnv()).toThrow(/GEMINI_API_KEY/);
  });
});
