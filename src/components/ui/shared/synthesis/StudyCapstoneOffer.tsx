'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export type CapstoneOffer = {
  id: string;
  promptText: string;
  /** Cards the drill is built on. */
  anchorCount: number;
  /** How many of them were graded in the session that just ended. */
  reviewedAnchorCount: number;
};

type StudyCapstoneOfferProps = {
  deckId: string;
  /** Null renders nothing — the offer never delays or replaces the summary. */
  drill: CapstoneOffer | null;
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

function anchorsLine(drill: CapstoneOffer): string {
  const cards = `${drill.anchorCount} cards`;
  if (drill.reviewedAnchorCount === drill.anchorCount) return `Uses the ${cards} you just reviewed.`;
  if (drill.reviewedAnchorCount > 0) return `Uses ${drill.reviewedAnchorCount} of its ${cards} from this session.`;
  return `Due now · ${cards} from this deck.`;
}

/**
 * The capstone offer on the study completion screen (spec §8.3, §10.5): one
 * drill, chosen by `pickCapstoneDrill` because its anchors were just
 * retrieved, offered once. A flat `.surface` beneath the summary — the
 * summary keeps the screen. *Skip* records nothing; it only closes the offer.
 */
export function StudyCapstoneOffer({ deckId, drill }: StudyCapstoneOfferProps) {
  const [dismissed, setDismissed] = useState(false);
  if (!drill || dismissed) return null;

  return (
    <section className="surface p-5" aria-labelledby="capstone-offer-label">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="capstone-offer-label" className={LABEL}>Cap this session</h3>
        <p className={`${LABEL} tnum`}>≈ 2 min</p>
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-dim">{drill.promptText}</p>
      <p className="mt-1 text-[13px] text-ink">{anchorsLine(drill)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href={`/dashboard/${deckId}/synthesis?drill=${drill.id}&from=study`}>Start drill</Link>
        </Button>
        <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
          Skip
        </Button>
      </div>
    </section>
  );
}
