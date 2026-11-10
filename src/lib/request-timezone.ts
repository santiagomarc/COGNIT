import 'server-only';
import { cookies } from 'next/headers';

import { parseTimeZone, TZ_COOKIE } from '@/lib/timezone';

/** The user's IANA zone from the `cognit-tz` cookie, or 'UTC' before the first visit has set it. */
export async function getRequestTimeZone(): Promise<string> {
  return parseTimeZone((await cookies()).get(TZ_COOKIE)?.value);
}
