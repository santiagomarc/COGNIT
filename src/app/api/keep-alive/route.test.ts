import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://mock.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [{ id: '123' }], error: null }),
      })),
    })),
  })),
}));

describe('Keep-Alive API Route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects in production when CRON_SECRET is not configured', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.CRON_SECRET;

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost:3000/api/keep-alive');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('CRON_SECRET is not configured');
  });

  it('rejects when CRON_SECRET is set but authorization header is missing', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token';

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost:3000/api/keep-alive');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects when CRON_SECRET is set but authorization header is invalid', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token';

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost:3000/api/keep-alive', {
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('allows access and succeeds when valid Bearer token is provided', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token';

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost:3000/api/keep-alive', {
      headers: {
        authorization: 'Bearer super-secret-cron-token',
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.timestamp).toBeDefined();
  });
});
