'use client';

import { StateTick } from '@/components/ui/shared/StateTick';
import { AddAsCardForm } from '@/components/ui/shared/synthesis/AddAsCardForm';
import type { AnchorCard, AnswerMode, AttemptResponse, Diagnostic, Exemplar, SynthesisDrill } from '@/lib/synthesis/types';
import { isOutlineResponse } from '@/lib/synthesis/text';
import { LINK_TICK, SLOT_LABELS, VERDICT_LABEL, VERDICT_TICK, formatDueIn } from '@/lib/synthesis/ui';

type DrillResultProps = {
  deckId: string;
  drill: SynthesisDrill;
  anchors: AnchorCard[];
  diagnostic: Diagnostic;
  exemplar: Exemplar;
  mode: AnswerMode;
  response: AttemptResponse;
  scheduleSaved: boolean;
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

function TermChip({ term }: { term: string }) {
  return <span className="term-chip cursor-default">{term}</span>;
}

/**
 * The diagnosed state's `.raised` object (spec §10.4): verdict, the
 * mechanism checklist, contradictions with the card's own words, the gap
 * note, and outside claims with their AI-verified tag and "+ Add as card".
 * Below it, two wells: the exemplar and the student's own answer.
 */
export function DrillResult({ deckId, drill, anchors, diagnostic, exemplar, mode, response, scheduleSaved }: DrillResultProps) {
  const termById = new Map(anchors.map((anchor) => [anchor.id, anchor.term]));
  const linkById = new Map(drill.requiredLinks.map((link) => [link.id, link]));
  const labels = SLOT_LABELS[drill.format];
  const offTarget = diagnostic.verdict === 'off_target';
  const pulled = diagnostic.pulledForwardCardIds.map((id) => termById.get(id)).filter((term): term is string => Boolean(term));

  return (
    <div className="flex flex-col gap-4">
      <section className="raised spec relative p-4 md:p-5" aria-labelledby="drill-verdict">
        {/* Verdict: a tick, the word, and the counts — colour is never alone. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateTick state={VERDICT_TICK[diagnostic.verdict]} />
          <h2 id="drill-verdict" className="text-[15px] font-semibold text-ink">
            {VERDICT_LABEL[diagnostic.verdict]}
          </h2>
          <span className={`${LABEL} tnum`}>
            {diagnostic.linksCovered} of {diagnostic.linksTotal} links · {diagnostic.contradictions.length}{' '}
            {diagnostic.contradictions.length === 1 ? 'contradiction' : 'contradictions'} · {diagnostic.outsideClaims.length} outside
          </span>
        </div>

        {offTarget ? (
          <p className="mt-3 text-sm text-ink-dim">
            {diagnostic.integrity.injectionDetected
              ? 'The answer contained instructions addressed to the checker, so it was not graded.'
              : 'The answer did not address the drill, so nothing was learned from it.'}{' '}
            The drill stays due — try it again.
          </p>
        ) : (
          <>
            <div className="rule rule--soft my-3" aria-hidden="true" />

            {/* Mechanism checklist: covered → mastered, partial → due, missing → an empty tick. */}
            <ul className="flex flex-col" aria-label="Required links">
              {diagnostic.coverage.map((entry) => {
                const link = linkById.get(entry.linkId);
                return (
                  <li key={entry.linkId} className="checklist-row">
                    <StateTick state={LINK_TICK[entry.status]} className="mt-[3px]" />
                    <span className={`${LABEL} w-20 shrink-0 pt-[3px]`}>{entry.status}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{link?.text ?? entry.linkId}</span>
                      {entry.evidence ? (
                        <span className="quote mt-0.5 block text-[13px]">“{entry.evidence}”</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>

            {diagnostic.contradictions.length > 0 ? (
              <ul className="mt-3 flex flex-col" aria-label="Contradictions">
                {diagnostic.contradictions.map((entry, index) => (
                  <li key={`${entry.cardId}-${index}`} className="checklist-row">
                    <StateTick state="lapsed" className="mt-[3px]" />
                    <span className={`${LABEL} w-20 shrink-0 pt-[3px]`} style={{ color: 'var(--state-lapsed)' }}>
                      contradicted
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">“{entry.statement}”</span>
                      <span className="mt-0.5 block text-[13px] text-ink-dim">
                        card says: “{entry.cardSays}”
                      </span>
                      <span className="mt-1.5 inline-flex">
                        <TermChip term={termById.get(entry.cardId) ?? 'card'} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="rule rule--soft my-3" aria-hidden="true" />

            <div className="flex gap-3">
              <span className={`${LABEL} w-20 shrink-0 pt-[3px]`}>Gap</span>
              <p className="max-w-[60ch] text-sm leading-relaxed text-ink">{diagnostic.gapNote}</p>
            </div>

            {(!diagnostic.structure.claimPresent || !diagnostic.structure.tradeoffPresent) ? (
              <p className={`${LABEL} mt-2 pl-[calc(5rem+0.75rem)]`}>
                {!diagnostic.structure.claimPresent ? `${labels.claim} slot empty` : null}
                {!diagnostic.structure.claimPresent && !diagnostic.structure.tradeoffPresent ? ' · ' : null}
                {!diagnostic.structure.tradeoffPresent ? `${labels.tradeoff} slot empty` : null}
              </p>
            ) : null}

            {/* Outside claims: a text tag, never a tick — this is a fact about the
                deck's coverage and the model's belief, not about the student's memory. */}
            {diagnostic.outsideClaims.length > 0 ? (
              <ul className="mt-3 flex flex-col" aria-label="Outside claims">
                {diagnostic.outsideClaims.map((claim, index) => (
                  <li key={index} className="checklist-row">
                    <span className="min-w-0 flex-1">
                      <span className={LABEL}>
                        {claim.verified ? 'AI verified · outside deck' : 'Unverified · outside deck'}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink">“{claim.statement}”</span>
                      <span className="mt-0.5 block text-[13px] text-ink-dim">{claim.aiAssessment}</span>
                      <span className="mt-1.5 block">
                        <AddAsCardForm deckId={deckId} claim={claim} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      {!offTarget ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="well p-4" aria-label="Exemplar">
            <h3 className={LABEL}>Exemplar</h3>
            <ul className="mt-2 flex flex-col gap-2 text-sm text-ink">
              <li><span className="text-ink-dimmer">{labels.claim} · </span>{exemplar.claim}</li>
              <li><span className="text-ink-dimmer">{labels.mechanism1} · </span>{exemplar.mechanisms[0]}</li>
              <li><span className="text-ink-dimmer">{labels.mechanism2} · </span>{exemplar.mechanisms[1]}</li>
              <li><span className="text-ink-dimmer">{labels.tradeoff} · </span>{exemplar.tradeoff}</li>
            </ul>
          </section>

          <section className="well p-4" aria-label="Your answer">
            <h3 className={LABEL}>Your answer</h3>
            {mode === 'outline' && isOutlineResponse(response) ? (
              <ul className="mt-2 flex flex-col gap-2 text-sm text-ink">
                <li><span className="text-ink-dimmer">{labels.claim} · </span>{response.claim || '—'}</li>
                <li><span className="text-ink-dimmer">{labels.mechanism1} · </span>{response.mechanisms[0] || '—'}</li>
                <li><span className="text-ink-dimmer">{labels.mechanism2} · </span>{response.mechanisms[1] || '—'}</li>
                <li><span className="text-ink-dimmer">{labels.tradeoff} · </span>{response.tradeoff || '—'}</li>
              </ul>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                {isOutlineResponse(response) ? '' : response.text}
              </p>
            )}
          </section>
        </div>
      ) : null}

      {/* Cards strip: the one card effect, in words. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={LABEL}>Cards</span>
        {pulled.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
            <StateTick state="due" />
            {pulled.map((term) => <TermChip key={term} term={term} />)}
            <span className="text-ink-dim">→ due tomorrow</span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-dim">
            {diagnostic.verdict === 'contradicted' ? 'schedule not changed' : 'unchanged'}
          </span>
        )}
        <span className={`${LABEL} ml-auto tnum`}>
          Next due {scheduleSaved ? formatDueIn(diagnostic.schedule.nextDueAt) : '— not saved'}
        </span>
      </div>
    </div>
  );
}
