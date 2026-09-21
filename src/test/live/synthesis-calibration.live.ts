import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadLocalEnv } from './env';
import type { AnchorCard, AttemptResponse, LinkStatus, RequiredLink, SynthesisFormat } from '@/lib/synthesis/types';

const hasKey = loadLocalEnv();
const RUNS = Number(process.env.CALIBRATION_RUNS ?? 3);
const CONCURRENCY = 4;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => { throw new Error('not used by calibration'); } }));

type CalibrationCard = { id: string; key: string; term: string; definition: string; explanation: string | null };
type CalibrationDrill = { id: string; cluster: string; format: SynthesisFormat; promptText: string; requiredLinks: RequiredLink[]; exemplar: { claim: string; mechanisms: [string, string]; tradeoff: string } };
type CalibrationAnswer = {
  id: string;
  drill: string;
  mode: 'outline' | 'free';
  tags: string[];
  response: AttemptResponse;
  labels: {
    coverage: Record<string, LinkStatus>;
    contradictions: { cardKey: string; cardSaysContains: string }[];
    /** Defensible catches that are neither required (recall) nor wrong (precision). */
    allowedContradictions?: { cardKey: string }[];
    outsideClaims: { contains: string; verified: boolean }[];
    offTarget: boolean;
    injection: boolean;
  };
};
type CalibrationSet = { version: string; clusters: Record<string, { cards: CalibrationCard[] }>; drills: CalibrationDrill[]; answers: CalibrationAnswer[] };

type RunResult = {
  answerId: string;
  run: number;
  ms: number;
  coverage: Record<string, LinkStatus>;
  contradictionKeys: string[];
  contradictionDetail: string[];
  outsideClaims: { statement: string; verified: boolean }[];
  verdict: string;
};

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 1000) / 10}%`);

/**
 * The §11.3 calibration set against the live model, through the production
 * prompt builders, schema and reconciliation (execution plan 1.7). Prints a
 * report and asserts the spec's targets. ~30 × RUNS calls.
 */
describe.skipIf(!hasKey)('live calibration — spec §11.3 on the configured model', () => {
  it('meets the calibration targets', async () => {
    const { getGeminiJsonModel, jsonGenerationConfig, resolveModelName, sanitizeAiInputText } = await import('@/app/actions/_shared');
    const { SYNTHESIS_PROMPT_VERSION, buildCheckUserTurn, buildDrillCheckInstruction } = await import('@/lib/synthesis/prompts');
    const { DRILL_CHECK_SCHEMA, drillCheckOutputSchema } = await import('@/lib/synthesis/schemas');
    const { renderResponseForModel, isOutlineResponse } = await import('@/lib/synthesis/text');
    const { computeVerdict, reconcileDiagnostic } = await import('@/lib/synthesis/verdict');

    const set = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/test/live/synthesis-calibration.json'), 'utf8')) as CalibrationSet;
    const drillById = new Map(set.drills.map((drill) => [drill.id, drill]));
    const model = getGeminiJsonModel({ temperature: 0.1 });

    const jobs = set.answers.flatMap((answer) => Array.from({ length: RUNS }, (_, run) => ({ answer, run: run + 1 })));
    const results = await mapWithConcurrency(jobs, CONCURRENCY, async ({ answer, run }): Promise<RunResult> => {
      const drill = drillById.get(answer.drill);
      if (!drill) throw new Error(`unknown drill ${answer.drill}`);
      const anchors: AnchorCard[] = set.clusters[drill.cluster].cards.map((card) => ({
        id: card.id, key: card.key, term: card.term, definition: card.definition, explanation: card.explanation, state: 'review',
      }));
      const nonce = `cal${run}${answer.id.replace(/[^a-z0-9]/gi, '').slice(0, 5)}`;
      const renderedAnswer = sanitizeAiInputText(renderResponseForModel(answer.mode, answer.response), 1_500);
      const started = Date.now();
      const result = await model.generateContent(
        {
          systemInstruction: buildDrillCheckInstruction(nonce),
          generationConfig: jsonGenerationConfig({ responseSchema: DRILL_CHECK_SCHEMA, temperature: 0.1 }),
          contents: [{ role: 'user', parts: [{ text: buildCheckUserTurn({
            format: drill.format, promptText: drill.promptText, anchors, requiredLinks: drill.requiredLinks,
            exemplar: drill.exemplar, mode: answer.mode, renderedAnswer, nonce,
          }) }] }],
        },
        { timeout: 60_000 },
      );
      const ms = Date.now() - started;
      const output = drillCheckOutputSchema.parse(JSON.parse(result.response.text()));
      const slots = answer.mode === 'outline' && isOutlineResponse(answer.response)
        ? { claim: answer.response.claim.trim().length > 0, tradeoff: answer.response.tradeoff.trim().length > 0 }
        : undefined;
      const reconciled = reconcileDiagnostic(output, { requiredLinks: drill.requiredLinks, anchors, answerText: renderedAnswer, slots });
      const verdict = computeVerdict(reconciled, drill.requiredLinks);
      const keyByCardId = new Map(anchors.map((anchor) => [anchor.id, anchor.key]));
      return {
        answerId: answer.id,
        run,
        ms,
        coverage: Object.fromEntries(reconciled.coverage.map((entry) => [entry.linkId, entry.status])),
        contradictionKeys: reconciled.contradictions.map((entry) => keyByCardId.get(entry.cardId) ?? '?'),
        contradictionDetail: reconciled.contradictions.map((entry) => `${keyByCardId.get(entry.cardId) ?? '?'} «${entry.statement.slice(0, 70)}» vs «${entry.cardSays.slice(0, 50)}»`),
        outsideClaims: reconciled.outsideClaims.map((entry) => ({ statement: entry.statement, verified: entry.verified })),
        verdict,
      };
    });

    // ── Metrics ──
    const answerById = new Map(set.answers.map((answer) => [answer.id, answer]));
    let linkAgree = 0; let linkTotal = 0;
    let stable = 0; let stableTotal = 0;
    let contraProduced = 0; let contraMatched = 0; let contraLabelled = 0; let contraFound = 0;
    let outsideTrueContradictions = 0;
    let verifiedAgree = 0; let verifiedTotal = 0; let verifiedMissing = 0;
    let injectionOff = 0; let injectionTotal = 0;
    let offTargetOff = 0; let offTargetTotal = 0;
    const disagreements: string[] = [];

    const byAnswer = new Map<string, RunResult[]>();
    for (const result of results) byAnswer.set(result.answerId, [...(byAnswer.get(result.answerId) ?? []), result]);

    for (const [answerId, runs] of byAnswer) {
      const answer = answerById.get(answerId)!;
      const labels = answer.labels;
      if (!labels.offTarget) {
        for (const [linkId, expected] of Object.entries(labels.coverage)) {
          const statuses = runs.map((run) => run.coverage[linkId] ?? 'missing');
          for (const status of statuses) {
            linkTotal += 1;
            if (status === expected) linkAgree += 1;
            else disagreements.push(`${answerId} ${linkId}: expected ${expected}, got ${status}`);
          }
          stableTotal += 1;
          if (statuses.every((status) => status === statuses[0])) stable += 1;
        }
      }
      for (const run of runs) {
        const isLabelled = (key: string) => labels.contradictions.some((label) => label.cardKey === key);
        const isAllowed = (key: string) => (labels.allowedContradictions ?? []).some((label) => label.cardKey === key);
        const counted = run.contradictionKeys.filter((key) => !isAllowed(key));
        contraProduced += counted.length;
        contraMatched += counted.filter(isLabelled).length;
        run.contradictionDetail.forEach((detail, index) => {
          const key = run.contradictionKeys[index];
          if (!isLabelled(key) && !isAllowed(key)) disagreements.push(`${answerId} run ${run.run}: unlabelled contradiction ${detail}`);
        });
        contraLabelled += labels.contradictions.length;
        contraFound += labels.contradictions.filter((label) => run.contradictionKeys.includes(label.cardKey)).length;
        if (answer.tags.includes('outside_true') && run.contradictionKeys.length > 0) outsideTrueContradictions += run.contradictionKeys.length;
        for (const label of labels.outsideClaims) {
          verifiedTotal += 1;
          const produced = run.outsideClaims.find((claim) => claim.statement.toLowerCase().includes(label.contains.toLowerCase()));
          if (!produced) { verifiedMissing += 1; disagreements.push(`${answerId}: outside claim "${label.contains}" not raised`); continue; }
          if (produced.verified === label.verified) verifiedAgree += 1;
          else disagreements.push(`${answerId}: "${label.contains}" verified=${produced.verified}, expected ${label.verified}`);
        }
        if (labels.injection) { injectionTotal += 1; if (run.verdict === 'off_target') injectionOff += 1; }
        if (labels.offTarget) { offTargetTotal += 1; if (run.verdict === 'off_target') offTargetOff += 1; }
      }
    }

    const latencies = results.map((result) => result.ms);
    const precision = contraProduced === 0 ? 1 : contraMatched / contraProduced;
    const report = [
      `calibration · model ${resolveModelName('check')} · prompt ${SYNTHESIS_PROMPT_VERSION} · set ${set.version} · ${set.answers.length} answers × ${RUNS} runs`,
      `per-link agreement        ${pct(linkAgree, linkTotal)}  (target ≥ 85%)`,
      `run-to-run agreement      ${pct(stable, stableTotal)}  (target ≥ 90%)`,
      `contradiction precision   ${pct(contraMatched, contraProduced)}  (${contraMatched}/${contraProduced}; target ≥ 90%) · recall ${pct(contraFound, contraLabelled)}`,
      `contradictions on outside-knowledge answers  ${outsideTrueContradictions}  (target 0)`,
      `verified flag agreement   ${pct(verifiedAgree, verifiedTotal)}  (${verifiedAgree}/${verifiedTotal}, ${verifiedMissing} not raised; target ≥ 88%)`,
      `injection → off_target    ${injectionOff}/${injectionTotal}`,
      `off-target → off_target   ${offTargetOff}/${offTargetTotal}`,
      `latency p50 / p95         ${percentile(latencies, 0.5)} ms / ${percentile(latencies, 0.95)} ms  (target ≤ 3500 / 6000)`,
    ];
    console.log(`\n${report.join('\n')}\n`);
    if (disagreements.length > 0) console.log(`disagreements (${disagreements.length}):\n  ${disagreements.slice(0, 40).join('\n  ')}\n`);

    expect(linkAgree / linkTotal).toBeGreaterThanOrEqual(0.85);
    expect(stable / stableTotal).toBeGreaterThanOrEqual(0.9);
    expect(precision).toBeGreaterThanOrEqual(0.9);
    expect(outsideTrueContradictions).toBe(0);
    expect(verifiedAgree / verifiedTotal).toBeGreaterThanOrEqual(0.88);
    expect(injectionOff).toBe(injectionTotal);
    expect(percentile(latencies, 0.5)).toBeLessThanOrEqual(3500);
  });
});
