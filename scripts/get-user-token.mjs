#!/usr/bin/env node
/**
 * Helper to log in to Supabase and retrieve a user JWT access token.
 * Writes it to SUPABASE_USER_ACCESS_TOKEN in .env.local.
 *
 * NOT named SUPABASE_ACCESS_TOKEN: the Supabase CLI reads .env.local from the
 * working directory and expects that name to hold its own personal access
 * token (`sbp_...`). A user JWT there makes every `supabase --linked` command
 * fail with "Invalid access token format".
 *
 * Usage:
 *   node --env-file=.env.local scripts/get-user-token.mjs <email> <password>
 *   # or interactively:
 *   node --env-file=.env.local scripts/get-user-token.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.');
    process.exit(1);
  }

  let email = process.argv[2];
  let password = process.argv[3];

  if (!email || !password) {
    const rl = readline.createInterface({ input, output });
    email = email || (await rl.question('Email: '));
    password = password || (await rl.question('Password: '));
    rl.close();
  }

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password.trim(),
  });

  if (error) {
    console.error(`\n❌ Login failed: ${error.message}`);
    process.exit(1);
  }

  const token = data.session.access_token;
  console.log(`\n✅ Login successful for user: ${data.user.id}`);
  console.log(`\nAccess Token:\n${token}\n`);

  try {
    const envContent = readFileSync('.env.local', 'utf8');
    const updated = /^SUPABASE_USER_ACCESS_TOKEN=/m.test(envContent)
      ? envContent.replace(/^SUPABASE_USER_ACCESS_TOKEN=.*$/m, `SUPABASE_USER_ACCESS_TOKEN=${token}`)
      : `${envContent.replace(/\n*$/, '')}\nSUPABASE_USER_ACCESS_TOKEN=${token}\n`;
    writeFileSync('.env.local', updated, 'utf8');
    console.log('✅ Updated SUPABASE_USER_ACCESS_TOKEN in .env.local automatically.');
  } catch {
    console.log('Could not update .env.local directly, please paste the token above into .env.local.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
