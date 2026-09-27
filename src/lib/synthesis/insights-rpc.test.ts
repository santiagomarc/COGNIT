import { describe, expect, it } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';
import { loadSynthesisInsightsRpc } from './insights-rpc';

const DECK = '00000000-0000-4000-8000-000000000001';

const rpcPayload = {
  attempt_count: 3,
  weak_links: [{ card_id: 'c1', term: 'Time quantum', missing: 1, contradicted: 1, last_at: '2026-09-26T10:00:00+00:00' }],
  format_rates: [
    { format: 'causal', attempts: 2, sound: 1 },
    { format: 'retired_format', attempts: 1, sound: 1 },
  ],
  outside_claims_30d: 2,
  misconceptions_30d: { reversal: 2, not_a_kind: 5 },
  calibration_30d: 0.5,
  daily: [{ date: '2026-09-26', attempts: 3, links_covered: 4, links_total: 6 }],
  history: [
    { attempt_id: 'a1', drill_id: 'd1', prompt_text: 'Why?', format: 'causal', verdict: 'sound', links_covered: 2, links_total: 2, duration_ms: 900, created_at: '2026-09-26T10:00:00+00:00' },
    { attempt_id: 'a2', drill_id: 'd1', prompt_text: 'Why?', format: 'causal', verdict: 'not_a_verdict', links_covered: 0, links_total: 2, duration_ms: 900, created_at: '2026-09-25T10:00:00+00:00' },
  ],
};

describe('loadSynthesisInsightsRpc', () => {
  it('maps the RPC payload onto SynthesisInsights, dropping values the app no longer knows', async () => {
    const supabase = createSupabaseMock({ rpcs: { get_synthesis_insights: { data: rpcPayload, error: null } } });
    const now = new Date('2026-09-27T00:00:00Z');

    const insights = await loadSynthesisInsightsRpc(supabase as never, { deckId: DECK, now });

    expect(supabase.rpc).toHaveBeenCalledWith('get_synthesis_insights', { p_deck_id: DECK, p_now: now.toISOString() });
    expect(insights).toEqual({
      attemptCount: 3,
      weakLinks: [{ cardId: 'c1', term: 'Time quantum', missing: 1, contradicted: 1, lastAt: '2026-09-26T10:00:00+00:00' }],
      formatRates: [{ format: 'causal', attempts: 2, sound: 1 }],
      outsideClaims30d: 2,
      misconceptions30d: { reversal: 2 },
      calibration30d: 0.5,
      daily: [{ date: '2026-09-26', attempts: 3, linksCovered: 4, linksTotal: 6 }],
      history: [{ attemptId: 'a1', drillId: 'd1', promptText: 'Why?', format: 'causal', verdict: 'sound', linksCovered: 2, linksTotal: 2, durationMs: 900, createdAt: '2026-09-26T10:00:00+00:00' }],
    });
  });

  it('returns null when the RPC is missing, so the caller falls back to the Node aggregation', async () => {
    const supabase = createSupabaseMock({
      rpcs: { get_synthesis_insights: { data: null, error: { message: 'Could not find the function public.get_synthesis_insights', code: 'PGRST202' } } },
    });
    expect(await loadSynthesisInsightsRpc(supabase as never, { deckId: DECK })).toBeNull();
  });

  it('returns null on an unexpected shape rather than rendering a half-read', async () => {
    const supabase = createSupabaseMock({ rpcs: { get_synthesis_insights: { data: { attempt_count: 'three' }, error: null } } });
    expect(await loadSynthesisInsightsRpc(supabase as never, { deckId: DECK })).toBeNull();
  });
});
