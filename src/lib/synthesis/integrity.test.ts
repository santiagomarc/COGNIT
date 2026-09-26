import { describe, expect, it } from 'vitest';
import type { ClusterCard } from '@/lib/synthesis/clusters';
import { exemplarGaps, linkOverlap, validateDrillDraft, type DrillGenerationDraft } from '@/lib/synthesis/prompts';

const CLUSTER: ClusterCard[] = [
  { id: 'a', term: 'Time quantum', definition: 'The CPU slice a round-robin scheduler gives each process.', explanation: null, tags: ['scheduling'] },
  { id: 'b', term: 'Context switch', definition: 'Saving one process state and loading another; pure overhead.', explanation: null, tags: ['scheduling'] },
  { id: 'c', term: 'Throughput', definition: 'Processes completed per unit time.', explanation: null, tags: ['scheduling'] },
];

const EXEMPLAR = {
  claim: 'A smaller time quantum means more context switches.',
  mechanisms: ['Each context switch is overhead.', 'Overhead is time not spent on throughput.'] as [string, string],
  tradeoff: 'Above typical burst length the effect fades.',
};

function draft(links: DrillGenerationDraft['required_links']): DrillGenerationDraft {
  return {
    format: 'causal',
    prompt_text: 'Why does shrinking the time quantum raise context switch overhead and cut throughput?',
    prompt_variants: [],
    required_links: links,
    exemplar: EXEMPLAR,
  };
}

const PREEMPT = { text: 'A smaller quantum pre-empts more often, so more context switches occur.', card_keys: ['c1', 'c2'], kind: 'mechanism' };
const OVERHEAD = { text: 'Every context switch is overhead that completes no process work, lowering throughput.', card_keys: ['c2', 'c3'], kind: 'mechanism' };
const BOUNDARY = { text: 'Only while the quantum is shorter than typical CPU bursts.', card_keys: ['c1'], kind: 'condition' };

describe('key integrity (plan §4.2)', () => {
  it('accepts a key whose links relate cards', () => {
    expect(validateDrillDraft(draft([PREEMPT, OVERHEAD, BOUNDARY]), CLUSTER).ok).toBe(true);
  });

  it('rejects one idea counted twice (PED-01)', () => {
    const reworded = { ...PREEMPT, text: 'More context switches occur because a smaller quantum pre-empts more often.' };
    expect(linkOverlap(PREEMPT.text, reworded.text)).toBeGreaterThanOrEqual(0.7);
    expect(validateDrillDraft(draft([PREEMPT, reworded, OVERHEAD, BOUNDARY]), CLUSTER)).toEqual({ ok: false, reason: 'duplicate_links' });
  });

  it('rejects recall disguised as synthesis: no link cites two cards (PED-02)', () => {
    const single = [
      { text: 'The quantum is the slice each process gets.', card_keys: ['c1'], kind: 'mechanism' },
      { text: 'A switch saves and loads process state.', card_keys: ['c2'], kind: 'mechanism' },
      { text: 'Only for CPU-bound work is throughput the measure.', card_keys: ['c3'], kind: 'condition' },
    ];
    expect(validateDrillDraft(draft(single), CLUSTER)).toEqual({ ok: false, reason: 'no_cross_card_link' });
  });

  it('keeps unrelated links apart', () => {
    expect(linkOverlap(PREEMPT.text, OVERHEAD.text)).toBeLessThan(0.2);
  });

  it('names concepts only on word boundaries (PED-04)', () => {
    const ip: ClusterCard[] = [
      { id: 'x', term: 'IP', definition: 'Internet Protocol.', explanation: null, tags: [] },
      { id: 'y', term: 'Router', definition: 'Forwards packets.', explanation: null, tags: [] },
    ];
    const noIp = { ...draft([{ text: 'A router forwards by IP address.', card_keys: ['c1', 'c2'], kind: 'mechanism' }, { text: 'Routing tables map prefixes.', card_keys: ['c2'], kind: 'mechanism' }]), prompt_text: 'How does a router use the relationship between hops?' };
    // "relationship" contains "ip" but does not name IP: only one concept is named.
    expect(validateDrillDraft(noIp, ip)).toEqual({ ok: false, reason: 'prompt_does_not_name_concepts' });
  });

  it('flags a core link the exemplar never touches (PED-03, telemetry)', () => {
    const links = validateDrillDraft(draft([PREEMPT, OVERHEAD, BOUNDARY]), CLUSTER);
    if (!links.ok) throw new Error('fixture invalid');
    expect(exemplarGaps(links.drill.requiredLinks, 'A smaller quantum means more context switches, each one overhead that lowers throughput; only below typical CPU bursts.', CLUSTER)).toEqual([]);
    expect(exemplarGaps(links.drill.requiredLinks, 'Scheduling is complicated.', CLUSTER)).toEqual(['m1', 'm2', 'm3']);
  });
});
