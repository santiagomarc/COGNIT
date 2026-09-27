// scripts/k6-session.mjs — prints a Cookie header for the TEST account (never a real user's)
import { createServerClient } from '@supabase/ssr';

const jar = new Map();
const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await supabase.auth.signInWithPassword({ email: process.env.LOAD_TEST_EMAIL, password: process.env.LOAD_TEST_PASSWORD });
if (error) throw error;
console.log([...jar].map(([name, value]) => `${name}=${value}`).join('; '));
