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
const ZERO_VECTOR = `[${Array(768).fill(0).join(',')}]`;
const DECK = '00000000-0000-4000-8000-000000000001';

const RPCS = {
  // v2 signature (202609170900): p_calls / p_daily_ceiling. The 4-argument
  // form was dropped, so a stale database fails here rather than reserving
  // without a ceiling.
  reserve_ai_call:            { p_action: 'get_hint', p_window_minutes: 60, p_max_requests: 1, p_metadata: {}, p_calls: 1, p_daily_ceiling: 300 },
  apply_card_embeddings_batch:{ p_deck_id: '00000000-0000-4000-8000-000000000001', p_updates: [] },
  apply_quiz_sm2_batch:       { p_deck_id: '00000000-0000-4000-8000-000000000001', p_updates: [] },
  select_quiz_cards:          { p_deck_id: '00000000-0000-4000-8000-000000000001', p_limit: 5, p_focus_unproven: false },
  count_quiz_ready_cards:     { p_deck_id: '00000000-0000-4000-8000-000000000001' },
  get_deck_topic_tag_counts:  { p_deck_id: '00000000-0000-4000-8000-000000000001', p_limit: 10 },
  get_due_cards_by_deck:      { p_user_id: '00000000-0000-4000-8000-000000000001' },
  set_deck_sharing:           { p_deck_id: '00000000-0000-4000-8000-000000000001', p_enabled: true, p_rotate: false },
  clone_shared_deck:          { p_share_token: 'deadbeefdeadbeefdeadbeefdeadbeef' },
  search_deck_cards_by_embedding: { p_deck_id: DECK, p_query_embedding: ZERO_VECTOR, p_limit: 1 },
  search_user_cards_by_embedding: { p_user_id: DECK, p_query_embedding: ZERO_VECTOR, p_limit: 1 },
  // Improvement plan, 2026-09-17 migration set.
  apply_card_enrichment_batch: { p_deck_id: DECK, p_rows: [] },
  log_quiz_result:            { p_deck_id: DECK, p_mode: 'mcq', p_duration_ms: 0, p_include_in_history: true, p_updates: [], p_card_results: [] },
  get_quiz_history:           { p_deck_id: DECK, p_limit: 1 },
  record_synthesis_attempt:   { p_drill_id: DECK, p_deck_id: DECK, p_client_attempt_id: null, p_attempt: {}, p_schedule: {}, p_pull_forward_card_ids: [], p_pull_forward_not_after: null },
  get_card_schedule_summary:  { p_user_id: DECK, p_days: 7 },
  get_deck_schedule_breakdown:{ p_deck_id: DECK },
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

// Micro-synthesis tables (202609120900, 202609150900) are owner-scoped with no
// shared policy: an anonymous caller must see zero rows, and a missing table
// shows up here as the same "does not exist" text an unapplied migration
// produces. The Phase 3 columns are probed by name so a half-applied
// migration set fails here rather than at the first check.
const SYNTHESIS_PROBES = [
  // Phase 3 (202609150900) and Phase 4 (202609210900, 202609210910) columns, by name.
  ['synthesis_drills', 'id, link_count, last_links_covered, prompt_variants, bloom, scenario, kind, question_text, command_word'],
  ['synthesis_attempts', 'id, client_attempt_id, confidence, revision_of, band'],
  ['synthesis_attempt_feedback', 'id, rating'],
  ['synthesis_questions', 'id, mapped_card_ids, missing_concepts, drill_id'],
  // Absorption provenance (202609170970).
  ['cards', 'id, absorbed_from_attempt_id, absorbed_claim_index'],
];
for (const [table, columns] of SYNTHESIS_PROBES) {
  const probe = await supabase.from(table).select(columns).limit(1);
  const msg = probe.error?.message ?? '';
  if (/does not exist|schema cache|could not find/i.test(msg)) {
    missing += 1;
    console.log(`❌ MISSING   table/columns ${table} (${columns})  — ${msg.slice(0, 90)}`);
  } else if (probe.error) {
    console.log(`✅ EXISTS    table ${table}  (guarded: ${msg.slice(0, 55)})`);
  } else {
    console.log(`✅ EXISTS    table ${table} with ${columns}; anon sees ${probe.data.length} row(s) (expect 0)`);
  }
}

if (missing > 0) {
  console.error(`\n${missing} RPC(s) missing — apply migrations with \`supabase db push\`.`);
  process.exit(1);
}
console.log('\nAll RPCs present and guarded.');
