import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/database.types';
import { FIXTURE_TITLE_PREFIX } from './state';

/*
 * The fixture deck (UIUX plan §4.3): 12 cards covering every prompt length the
 * study card sizes for, plus math and a code block. Six are review cards due
 * an hour ago, so `scope=due` finds them; six are new. Specs open study with
 * `scope=include_reviewed`, so a grade from one spec never empties another's
 * session.
 *
 * `back` is the prompt and `front` the answer, as everywhere in this schema.
 *
 * Every card arrives with its embedding, topic tags and distractors already
 * filled. Otherwise the deck page's CardDataBackfill would ask the server to
 * fill them, and that is a model call (AI-13); the harness makes none (§4.2).
 */
type CardSeed = { back: string; front: string; distractors: [string, string, string]; review: boolean };

const CARDS: CardSeed[] = [
  // Short prompts, ≤ 60 characters.
  { back: "What organelle makes most of a cell's ATP?", front: 'Mitochondrion', distractors: ['Ribosome', 'Golgi apparatus', 'Lysosome'], review: true },
  { back: 'Which molecule carries amino acids to the ribosome?', front: 'Transfer RNA', distractors: ['Messenger RNA', 'Ribosomal RNA', 'DNA polymerase'], review: false },
  { back: 'Name the process that copies DNA into RNA.', front: 'Transcription', distractors: ['Translation', 'Replication', 'Splicing'], review: true },
  { back: 'What bond holds the two DNA strands together?', front: 'Hydrogen bond', distractors: ['Peptide bond', 'Ionic bond', 'Disulfide bond'], review: false },
  // Starter-deck length, ≈ 130 characters.
  {
    back: 'The process by which a cell engulfs large particles by wrapping its membrane around them and pinching off an internal vesicle.',
    front: 'Phagocytosis',
    distractors: ['Exocytosis', 'Pinocytosis', 'Diffusion'],
    review: true,
  },
  {
    back: 'A protein that speeds up a chemical reaction by lowering its activation energy, without being consumed by the reaction itself.',
    front: 'Enzyme',
    distractors: ['Hormone', 'Substrate', 'Antibody'],
    review: false,
  },
  {
    back: 'The stage of cell division in which duplicated chromosomes line up along the middle of the cell before being pulled apart.',
    front: 'Metaphase',
    distractors: ['Prophase', 'Anaphase', 'Telophase'],
    review: true,
  },
  {
    back: 'Movement of water across a semi-permeable membrane from a region of low solute concentration to one of high concentration.',
    front: 'Osmosis',
    distractors: ['Active transport', 'Facilitated diffusion', 'Endocytosis'],
    review: false,
  },
  // PDF length, ≈ 300 and ≈ 600 characters.
  {
    back: 'The final stage of aerobic respiration takes place on the inner mitochondrial membrane. Electrons from NADH and FADH2 pass along a series of protein complexes, and the energy they release pumps protons into the intermembrane space. The protons flow back through ATP synthase, which uses that flow to make ATP. What is this stage called?',
    front: 'Oxidative phosphorylation',
    distractors: ['Glycolysis', 'Fermentation', 'The Calvin cycle'],
    review: true,
  },
  {
    back:
      'A student reads a chapter about how cells turn food into usable energy. The chapter explains that glucose is first split in the cytoplasm into two molecules of pyruvate, which yields a small amount of ATP and NADH without needing oxygen. ' +
      'Each pyruvate then enters the mitochondrion, loses a carbon as carbon dioxide and joins coenzyme A. The resulting two-carbon unit is fed into a cycle of eight reactions in the mitochondrial matrix, which releases two more carbon dioxide molecules per turn and loads NADH and FADH2 with high-energy electrons for the next stage. ' +
      'The chapter calls this eight-step loop by two names. Name the cycle.',
    front: 'Krebs cycle (citric acid cycle)',
    distractors: ['Calvin cycle', 'Urea cycle', 'Cori cycle'],
    review: false,
  },
  // Math and code, which RichText renders.
  {
    back: 'In exponential growth, $N(t) = N_0 e^{rt}$. What does $r$ stand for?',
    front: 'The per-capita growth rate',
    distractors: ['The carrying capacity', 'The initial population', 'The doubling time'],
    review: true,
  },
  {
    back: 'What does this function return for `n = 4`?\n\n```js\nfunction f(n) {\n  return n <= 1 ? 1 : n * f(n - 1);\n}\n```',
    front: '24',
    distractors: ['10', '16', '4'],
    review: false,
  },
];

const EMBEDDING_DIMENSIONS = 768;

/** A distinct unit vector per card: cosine similarity is defined, unlike for a zero vector. */
function embedding(index: number) {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[index] = 1;
  return `[${vector.join(',')}]`;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Deletes every `[e2e] …` deck the account owns, trashed ones included, then
 * creates the fixture deck. Runs as the signed-in user, so RLS applies exactly
 * as it does in the app.
 */
export async function seedFixtureDeck(supabase: SupabaseClient<Database>, userId: string) {
  const { error: deleteError } = await supabase.from('decks').delete().like('title', `${FIXTURE_TITLE_PREFIX}%`);
  if (deleteError) throw new Error(`removing old fixture decks: ${deleteError.message}`);

  // The trash policy hides trashed decks from a plain delete; a spec may have
  // trashed one, so purge those through the trash RPCs.
  const { data: trashed, error: trashError } = await supabase.rpc('list_trashed_decks');
  if (trashError) throw new Error(`listing trashed decks: ${trashError.message}`);
  for (const deck of trashed ?? []) {
    if (!deck.title.startsWith(FIXTURE_TITLE_PREFIX)) continue;
    const { error } = await supabase.rpc('purge_deck', { p_deck_id: deck.id });
    if (error) throw new Error(`purging a trashed fixture deck: ${error.message}`);
  }

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .insert({
      user_id: userId,
      title: `${FIXTURE_TITLE_PREFIX}Study fixture`,
      description: 'Seeded by e2e/global-setup.ts and re-created on every run.',
    })
    .select('id')
    .single();
  if (deckError) throw new Error(`creating the fixture deck: ${deckError.message}`);

  const now = Date.now();
  const { error: cardsError } = await supabase.from('cards').insert(
    CARDS.map((card, index) => ({
      deck_id: deck.id,
      back: card.back,
      front: card.front,
      source: 'bulk_import',
      imported_by: 'Cognit e2e fixture',
      topic_tags: ['cell biology'],
      mcq_distractors: card.distractors,
      embedding: embedding(index),
      ...(card.review
        ? {
            state: 'review' as const,
            interval: 6,
            ease_factor: 2.5,
            repetition_count: 3,
            last_review_at: new Date(now - 7 * DAY).toISOString(),
            next_review_at: new Date(now - HOUR).toISOString(),
          }
        : { state: 'new' as const }),
    })),
  );
  if (cardsError) throw new Error(`inserting fixture cards: ${cardsError.message}`);

  return deck.id;
}
