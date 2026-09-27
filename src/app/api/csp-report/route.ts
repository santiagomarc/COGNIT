import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * CSP violation reports during the report-only week (plan §6.2). Browsers
 * POST `application/csp-report` (report-uri) or `application/reports+json`
 * (report-to); both are logged truncated, never echoed back.
 */
export async function POST(request: NextRequest) {
  const body = (await request.text()).slice(0, 4_000);
  logger.warn('csp', 'violation report', { report: body });
  return new NextResponse(null, { status: 204 });
}
