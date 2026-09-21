import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadLocalEnv } from './env';
import type { ClusterCard } from '@/lib/synthesis/clusters';
import type { AnchorCard, PlanResponse } from '@/lib/synthesis/types';

const hasKey = loadLocalEnv();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => { throw new Error('not used by the generation gate'); } }));

/**
 * The generation gate (execution plan D3, D15): the real generation prompts
 * against the live model must produce a drill and a plan question that
 * clear the validators, and the exemplar each one ships with must grade
 * `sound` / `strong` against its own key. Four to six calls.
 */
describe.skipIf(!hasKey)('live generation — drills and plan questions clear their own keys', () => {
  it('generates a drill whose exemplar is sound against its key', async () => {
    const { getGeminiJsonModel, jsonGenerationConfig, resolveModelName, sanitizeAiInputText } = await import('@/app/actions/_shared');
    const { buildCheckUserTurn, buildDrillCheckInstruction, buildDrillGenerationInstruction, renderClusterCards, stemFor, validateDrillDraft } = await import('@/lib/synthesis/prompts');
    const { DRILL_CHECK_SCHEMA, DRILL_GENERATION_SCHEMA, drillCheckOutputSchema, drillGenerationOutputSchema } = await import('@/lib/synthesis/schemas');
    const { renderResponseForModel } = await import('@/lib/synthesis/text');
    const { computeVerdict, reconcileDiagnostic } = await import('@/lib/synthesis/verdict');

    const set = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/test/live/synthesis-calibration.json'), 'utf8')) as {
      clusters: Record<string, { cards: { id: string; key: string; term: string; definition: string; explanation: string | null }[] }>;
    };
    const cluster: ClusterCard[] = set.clusters.sched.cards.map((card) => ({ id: card.id, term: card.term, definition: card.definition, explanation: card.explanation, tags: ['scheduling'] }));

    const generator = getGeminiJsonModel({ temperature: 0.6, purpose: 'generation' });
    const generated = await generator.generateContent(
      {
        systemInstruction: buildDrillGenerationInstruction('causal', { stem: stemFor('causal', 1) }),
        generationConfig: jsonGenerationConfig({ responseSchema: DRILL_GENERATION_SCHEMA, temperature: 0.6, model: resolveModelName('generation') }),
        contents: [{ role: 'user', parts: [{ text: `CARDS\n${renderClusterCards(cluster)}` }] }],
      },
      { timeout: 60_000 },
    );
    const draft = drillGenerationOutputSchema.parse(JSON.parse(generated.response.text()));
    const validation = validateDrillDraft(draft, cluster);
    console.log(`drill · ${validation.ok ? 'valid' : validation.reason} · links ${draft.required_links.length} · variants ${draft.prompt_variants.length} · bloom ${draft.bloom}\n  prompt: ${draft.prompt_text}\n  key: ${draft.required_links.map((link) => `[${link.kind}${link.core ? ',core' : ''}] ${link.text}`).join(' | ')}`);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.drill.requiredLinks.length).toBeGreaterThanOrEqual(3);
    expect(validation.drill.requiredLinks.some((link) => link.kind === 'condition')).toBe(true);
    expect(validation.drill.promptVariants.length).toBeGreaterThanOrEqual(1);

    // The exemplar, answered back in outline mode, should be sound against the key it came with.
    const anchors: AnchorCard[] = cluster.map((card, index) => ({ id: card.id, key: `c${index + 1}`, term: card.term, definition: card.definition, explanation: card.explanation, state: 'review' }));
    const nonce = 'gen00001';
    const renderedAnswer = sanitizeAiInputText(renderResponseForModel('outline', validation.drill.exemplar), 1_500);
    const checker = getGeminiJsonModel({ temperature: 0.1 });
    const checked = await checker.generateContent(
      {
        systemInstruction: buildDrillCheckInstruction(nonce),
        generationConfig: jsonGenerationConfig({ responseSchema: DRILL_CHECK_SCHEMA, temperature: 0.1 }),
        contents: [{ role: 'user', parts: [{ text: buildCheckUserTurn({
          format: validation.drill.format, promptText: validation.drill.promptText, scenario: validation.drill.scenario, anchors,
          requiredLinks: validation.drill.requiredLinks, exemplar: validation.drill.exemplar, mode: 'outline', renderedAnswer, nonce,
        }) }] }],
      },
      { timeout: 60_000 },
    );
    const output = drillCheckOutputSchema.parse(JSON.parse(checked.response.text()));
    const reconciled = reconcileDiagnostic(output, { requiredLinks: validation.drill.requiredLinks, anchors, answerText: renderedAnswer });
    const verdict = computeVerdict(reconciled, validation.drill.requiredLinks);
    console.log(`  exemplar verdict: ${verdict} · ${reconciled.coverage.map((entry) => `${entry.linkId}:${entry.status}`).join(' ')} · demoted ${reconciled.demotedCovered}`);
    expect(['sound', 'partial']).toContain(verdict);
    expect(reconciled.coverage.filter((entry) => entry.status === 'missing')).toHaveLength(0);
  });

  it('generates a plan question whose exemplar plan bands secure or strong against its key', async () => {
    const { getGeminiJsonModel, jsonGenerationConfig, resolveModelName, sanitizeAiInputText } = await import('@/app/actions/_shared');
    const { buildCheckUserTurn, buildDrillCheckInstruction, buildPlanGenerationInstruction, renderClusterCards, validatePlanDraft } = await import('@/lib/synthesis/prompts');
    const { DRILL_CHECK_SCHEMA, PLAN_GENERATION_SCHEMA, drillCheckOutputSchema, planGenerationOutputSchema } = await import('@/lib/synthesis/schemas');
    const { renderResponseForModel } = await import('@/lib/synthesis/text');
    const { digestPlanExemplar } = await import('@/lib/synthesis/loaders');
    const { computeBand, computeVerdict, reconcileDiagnostic } = await import('@/lib/synthesis/verdict');

    const set = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/test/live/synthesis-calibration.json'), 'utf8')) as {
      clusters: Record<string, { cards: { id: string; key: string; term: string; definition: string; explanation: string | null }[] }>;
    };
    // Six cards across the two calibration clusters: enough for a plan's 4–8.
    const cluster: ClusterCard[] = [...set.clusters.sched.cards, ...set.clusters.vm.cards].map((card) => ({ id: card.id, term: card.term, definition: card.definition, explanation: card.explanation, tags: ['os'] }));

    const generator = getGeminiJsonModel({ temperature: 0.6, purpose: 'generation' });
    const generated = await generator.generateContent(
      {
        systemInstruction: buildPlanGenerationInstruction(),
        generationConfig: jsonGenerationConfig({ responseSchema: PLAN_GENERATION_SCHEMA, temperature: 0.6, model: resolveModelName('generation') }),
        contents: [{ role: 'user', parts: [{ text: `CARDS\n${renderClusterCards(cluster)}` }] }],
      },
      { timeout: 60_000 },
    );
    const draft = planGenerationOutputSchema.parse(JSON.parse(generated.response.text()));
    const validation = validatePlanDraft(draft, cluster);
    console.log(`plan · ${validation.ok ? 'valid' : validation.reason} · links ${draft.required_links.length} · missing ${JSON.stringify(draft.missing_concepts)}\n  question: ${draft.question_text}\n  key: ${draft.required_links.map((link) => `[${link.kind}${link.core ? ',core' : ''}] ${link.text}`).join(' | ')}`);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const anchors: AnchorCard[] = cluster.map((card, index) => ({ id: card.id, key: `c${index + 1}`, term: card.term, definition: card.definition, explanation: card.explanation, state: 'review' }));
    const plan = validation.plan;
    const answer: PlanResponse = plan.planExemplar;
    const nonce = 'plan0001';
    const renderedAnswer = sanitizeAiInputText(renderResponseForModel('plan', answer), 3_500);
    const checker = getGeminiJsonModel({ temperature: 0.1 });
    const checked = await checker.generateContent(
      {
        systemInstruction: buildDrillCheckInstruction(nonce, { plan: true }),
        generationConfig: jsonGenerationConfig({ responseSchema: DRILL_CHECK_SCHEMA, temperature: 0.1 }),
        contents: [{ role: 'user', parts: [{ text: buildCheckUserTurn({
          format: 'evaluate', promptText: plan.questionText, anchors, requiredLinks: plan.requiredLinks,
          exemplar: digestPlanExemplar(plan.planExemplar), planExemplar: plan.planExemplar, mode: 'plan', renderedAnswer, nonce,
        }) }] }],
      },
      { timeout: 60_000 },
    );
    const output = drillCheckOutputSchema.parse(JSON.parse(checked.response.text()));
    const reconciled = reconcileDiagnostic(output, {
      requiredLinks: plan.requiredLinks, anchors, answerText: renderedAnswer,
      slots: { claim: answer.thesis.trim().length > 0, tradeoff: answer.conclusion.trim().length > 0 || answer.points.some((point) => point.limit.trim().length > 0) },
    });
    const verdict = computeVerdict(reconciled, plan.requiredLinks);
    const band = computeBand(reconciled, plan.requiredLinks, { conclusionPresent: answer.conclusion.trim().length > 0 });
    console.log(`  exemplar plan: verdict ${verdict} · band ${band} · ${reconciled.coverage.map((entry) => `${entry.linkId}:${entry.status}`).join(' ')} · structure ${JSON.stringify(reconciled.structure)} · gap: ${reconciled.gapNote.slice(0, 120)}`);
    expect(['secure', 'strong']).toContain(band);
  });
});
