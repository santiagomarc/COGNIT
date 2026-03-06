'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HintButton } from '@/components/ui/shared/HintButton';
import { similarity } from '@/lib/fuzzy';
import type { StudyGrade } from '@/lib/sm2';

type IdentificationModeCard = {
  id: string;
  front: string;
  back: string;
  id_question: string | null;
};

type IdentificationModeProps = {
  deckId: string;
  card: IdentificationModeCard;
  disabled: boolean;
  enrichmentPending: boolean;
  onResolve: (grade: StudyGrade, score: number, answer: string) => void;
};

type IdentificationResult = {
  answer: string;
  score: number;
  grade: StudyGrade;
};

function getGrade(score: number): StudyGrade {
  if (score >= 0.8) {
    return 'good';
  }
  if (score >= 0.6) {
    return 'hard';
  }
  return 'again';
}

export function IdentificationMode({
  deckId,
  card,
  disabled,
  enrichmentPending,
  onResolve,
}: IdentificationModeProps) {
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<IdentificationResult | null>(null);

  const prompt = useMemo(() => card.id_question ?? card.back, [card.back, card.id_question]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || disabled) {
      return;
    }

    const score = similarity(answer, card.front);
    setResult({
      answer,
      score,
      grade: getGrade(score),
    });
  }

  return (
    <div className="glass-card glow-border rounded-3xl p-7">
      <div className="mb-4 flex items-center justify-between gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <span>Identification Prompt</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${card.id_question ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
          {card.id_question ? 'AI Prompt Ready' : 'Using Raw Description'}
        </span>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-primary/15 bg-background/25 px-6 py-6 text-center text-lg leading-relaxed">
          {prompt}
        </div>

        {enrichmentPending && !card.id_question ? (
          <div className="rounded-xl border border-primary/10 bg-card/20 px-4 py-3 text-sm text-muted-foreground">
            AI is preparing a question-style prompt for this card. You can still answer using the raw description.
          </div>
        ) : null}

        {result ? (
          <div className="space-y-4 rounded-2xl border border-primary/10 bg-card/20 p-4">
            <div className="flex items-start gap-3">
              {result.grade === 'again' ? (
                <CircleAlert className="mt-0.5 h-5 w-5 text-red-400" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
              )}
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-semibold text-foreground">Your answer:</span> {result.answer}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Correct term:</span> {card.front}
                </p>
                <p className="text-muted-foreground">
                  Similarity score: {Math.round(result.score * 100)}%
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onResolve(result.grade, result.score, result.answer)} disabled={disabled}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={`id-answer-${card.id}`} className="text-sm font-medium">
                Type the term
              </label>
              <Input
                id={`id-answer-${card.id}`}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Enter the matching term"
                disabled={disabled}
                autoFocus
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <HintButton cardId={card.id} deckId={deckId} disabled={disabled} />
              <Button type="submit" disabled={disabled || !answer.trim()}>
                Check Answer
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}