import { describe, expect, it, vi } from 'vitest';
import { loadLocalEnv } from './env';

const hasKey = loadLocalEnv();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => { throw new Error('not used by the smoke test'); } }));

/**
 * The one-call gate (execution plan 0.2, Audit II §6.8): the production
 * `jsonGenerationConfig` against the configured model with the real check
 * schema. Fails on a non-200, on a truncated response, or on output the
 * server's schema would reject. This is what would have caught the
 * `thinkingBudget: 0` → 400 on gemini-3.5-flash-lite.
 */
describe.skipIf(!hasKey)('live smoke — production JSON config on the configured model', () => {
  it('returns a complete, schema-valid check response', async () => {
    const { getGeminiJsonModel, jsonGenerationConfig, resolveModelName } = await import('@/app/actions/_shared');
    const { buildCheckUserTurn, buildDrillCheckInstruction } = await import('@/lib/synthesis/prompts');
    const { DRILL_CHECK_SCHEMA, drillCheckOutputSchema } = await import('@/lib/synthesis/schemas');

    const nonce = 'smoke001';
    const anchors = [
      { id: 'a', key: 'c1', term: 'Time quantum', definition: 'The fixed CPU slice a round-robin scheduler gives a process before pre-empting it.', explanation: null, state: 'review' },
      { id: 'b', key: 'c2', term: 'Context switch', definition: 'Saving one process state and loading another; pure overhead.', explanation: null, state: 'review' },
    ];
    const userTurn = buildCheckUserTurn({
      format: 'causal',
      promptText: 'By what mechanism does a smaller time quantum raise context-switch overhead?',
      anchors,
      requiredLinks: [
        { id: 'm1', text: 'A smaller quantum forces more context switches, each pure overhead.', cardIds: ['a', 'b'], kind: 'mechanism', core: true },
        { id: 'm2', text: 'Overhead time is CPU time no process uses.', cardIds: ['b'], kind: 'mechanism', core: true },
      ],
      exemplar: { claim: 'Smaller slices mean more switches.', mechanisms: ['Each pre-emption is a switch.', 'Each switch is overhead.'], tradeoff: 'Above a typical burst the effect fades.' },
      mode: 'free',
      renderedAnswer: 'A smaller quantum pre-empts more often, and every pre-emption is a context switch that does no useful work.',
      nonce,
    });

    const model = getGeminiJsonModel({ temperature: 0.1 });
    const started = Date.now();
    const result = await model.generateContent(
      {
        systemInstruction: buildDrillCheckInstruction(nonce),
        generationConfig: jsonGenerationConfig({ responseSchema: DRILL_CHECK_SCHEMA, temperature: 0.1 }),
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
      },
      { timeout: 30_000 },
    );
    const elapsed = Date.now() - started;

    const finish = result.response.candidates?.[0]?.finishReason;
    expect(finish).toBe('STOP');
    const parsed = drillCheckOutputSchema.safeParse(JSON.parse(result.response.text()));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.coverage.length).toBeGreaterThan(0);
    }
    console.log(`smoke ok · model ${resolveModelName('check')} · ${elapsed} ms · in ${result.response.usageMetadata?.promptTokenCount} out ${result.response.usageMetadata?.candidatesTokenCount}`);
  });
});
