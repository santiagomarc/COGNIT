#!/usr/bin/env node
/**
 * Measures the cosine-similarity separation between questions a deck DOES
 * cover and questions it does NOT, so MIN_CONTEXT_SIMILARITY in src/lib/rag.ts
 * can be set from data rather than from a guess.
 *
 * Usage:
 *   node scripts/calibrate-threshold.mjs \
 *     --deck <deck-uuid> \
 *     --relevant "what is photosynthesis" --relevant "define entropy" \
 *     --irrelevant "who won the 1998 world cup" --irrelevant "best pasta recipe"
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * GEMINI_API_KEY and SUPABASE_ACCESS_TOKEN (a logged-in user's access token) in
 * the environment or .env.local.
 */
import { readFileSync } from 'node:fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch { /* optional */ }
}

function parseArgs(argv) {
  const out = { deck: null, relevant: [], irrelevant: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--deck') out.deck = argv[++i];
    else if (argv[i] === '--relevant') out.relevant.push(argv[++i]);
    else if (argv[i] === '--irrelevant') out.irrelevant.push(argv[++i]);
  }
  return out;
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  };
}

const fmt = (n) => (n === null ? 'n/a' : n.toFixed(4));

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (!args.deck || args.relevant.length === 0 || args.irrelevant.length === 0) {
    console.error('Need --deck plus at least one --relevant and one --irrelevant question.');
    process.exit(1);
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('SUPABASE_ACCESS_TOKEN is required (the RPC is SECURITY INVOKER and needs a real user).');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );

  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genai.getGenerativeModel({
    model: process.env.GEMINI_EMBEDDING_MODEL ?? 'text-embedding-004',
  });

  async function topSimilarity(question) {
    // taskType MUST match the app: RETRIEVAL_QUERY for questions,
    // RETRIEVAL_DOCUMENT for cards. Mismatched task types collapse the
    // separation between the two distributions and make the floor unusable.
    const embedding = await model.embedContent({
      content: { role: 'user', parts: [{ text: question }] },
      taskType: 'RETRIEVAL_QUERY',
    });

    const vector = embedding.embedding.values;
    const literal = `[${vector.map((v) => Number(v.toFixed(8))).join(',')}]`;

    const { data, error } = await supabase.rpc('search_deck_cards_by_embedding', {
      p_deck_id: args.deck,
      p_query_embedding: literal,
      p_limit: 5,
    });

    if (error) throw new Error(`RPC failed: ${error.message}`);
    if (!data || data.length === 0) return null;
    return Math.max(...data.map((row) => row.similarity ?? 0));
  }

  const relevantScores = [];
  const irrelevantScores = [];

  for (const question of args.relevant) {
    const score = await topSimilarity(question);
    if (score !== null) relevantScores.push(score);
    console.log(`  [covered]     ${fmt(score)}  ${question}`);
  }

  for (const question of args.irrelevant) {
    const score = await topSimilarity(question);
    if (score !== null) irrelevantScores.push(score);
    console.log(`  [not covered] ${fmt(score)}  ${question}`);
  }

  const rel = stats(relevantScores);
  const irr = stats(irrelevantScores);

  console.log('\n── Distributions ──');
  console.log(`  covered:     min ${fmt(rel?.min)}  median ${fmt(rel?.median)}  max ${fmt(rel?.max)}`);
  console.log(`  not covered: min ${fmt(irr?.min)}  median ${fmt(irr?.median)}  max ${fmt(irr?.max)}`);

  if (rel && irr) {
    if (rel.min > irr.max) {
      const floor = (rel.min + irr.max) / 2;
      console.log(`\n✅ Clean separation. Suggested MIN_CONTEXT_SIMILARITY: ${floor.toFixed(2)}`);
    } else {
      console.log(`\n⚠️  Distributions OVERLAP (covered.min ${fmt(rel.min)} <= notCovered.max ${fmt(irr.max)}).`);
      console.log('   No threshold separates them cleanly. Check that taskType is set on BOTH');
      console.log('   sides (RETRIEVAL_QUERY for questions, RETRIEVAL_DOCUMENT for cards) before');
      console.log('   tuning the number — a mismatch there is the usual cause.');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
