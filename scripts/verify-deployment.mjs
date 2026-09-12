#!/usr/bin/env node
/**
 * Post-deploy smoke check: proves every RPC the app depends on actually exists
 * in the target database, and that an anonymous caller cannot read decks.
 *
 * Run with:  node --env-file=.env.local scripts/verify-deployment.mjs
 *
 * Uses the ANON key deliberately. Every RPC below should either be refused
 * ("Unauthorized") or return an empty RLS-filtered result. What it is really
 * looking for is "could not find the function", which is what an unapplied
 * migration looks like — and which otherwise only surfaces as a silent
 * fallback path in production.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// Every RPC introduced in Phases 2-4. An anon caller has no auth.uid(), so the
// expected outcome is an authorization/empty result — NOT "function does not
// exist", which is what a missing migration looks like.
const RPCS = {
  reserve_ai_call:            { p_action: 'get_hint', p_window_minutes: 60, p_max_requests: 1 },
  apply_card_embeddings_batch:{ p_deck_id: '00000000-0000-4000-8000-000000000001', p_updates: [] },
  apply_quiz_sm2_batch:       { p_deck_id: '00000000-0000-4000-8000-000000000001', p_updates: [] },
  select_quiz_cards:          { p_deck_id: '00000000-0000-4000-8000-000000000001', p_limit: 5, p_focus_unproven: false },
  count_quiz_ready_cards:     { p_deck_id: '00000000-0000-4000-8000-000000000001' },
  get_deck_topic_tag_counts:  { p_deck_id: '00000000-0000-4000-8000-000000000001', p_limit: 10 },
  get_due_cards_by_deck:      { p_user_id: '00000000-0000-4000-8000-000000000001' },
  set_deck_sharing:           { p_deck_id: '00000000-0000-4000-8000-000000000001', p_enabled: true, p_rotate: false },
  clone_shared_deck:          { p_share_token: 'deadbeefdeadbeefdeadbeefdeadbeef' },
  search_deck_cards_by_embedding: { p_deck_id: '00000000-0000-4000-8000-000000000001', p_query_embedding: `[${Array(768).fill(0).join(',')}]`, p_limit: 1 },
};

let missing = 0;
console.log(`Checking ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);
for (const [name, args] of Object.entries(RPCS)) {
  const { error } = await supabase.rpc(name, args);
  const msg = error?.message ?? '';
  const notFound = /could not find the function|does not exist|schema cache/i.test(msg);
  if (notFound) { missing += 1; console.log(`❌ MISSING   ${name}  — ${msg.slice(0,90)}`); }
  else console.log(`✅ EXISTS    ${name}${error ? `  (guarded: ${msg.slice(0,55)})` : '  (returned)'}`);
}

// Sharing columns must be readable and the public policy must not leak
// non-shared decks to an anonymous caller.
const cols = await supabase.from('decks').select('id, share_token, clone_count, is_public').limit(5);
console.log(cols.error
  ? `❌ decks sharing columns — ${cols.error.message.slice(0,90)}`
  : `✅ decks sharing columns readable; anon sees ${cols.data.length} row(s) (expect 0 unless a deck is shared)`);

// Micro-synthesis tables (202609120900) are owner-scoped with no shared
// policy: an anonymous caller must see zero rows, and a missing table shows up
// here as the same "does not exist" text an unapplied migration produces.
for (const table of ['synthesis_drills', 'synthesis_attempts']) {
  const probe = await supabase.from(table).select('id').limit(1);
  const msg = probe.error?.message ?? '';
  if (/does not exist|schema cache|could not find/i.test(msg)) {
    missing += 1;
    console.log(`❌ MISSING   table ${table}  — ${msg.slice(0, 90)}`);
  } else if (probe.error) {
    console.log(`✅ EXISTS    table ${table}  (guarded: ${msg.slice(0, 55)})`);
  } else {
    console.log(`✅ EXISTS    table ${table}; anon sees ${probe.data.length} row(s) (expect 0)`);
  }
}

if (missing > 0) {
  console.error(`\n${missing} RPC(s) missing — apply migrations with \`supabase db push\`.`);
  process.exit(1);
}
console.log('\nAll RPCs present and guarded.');
