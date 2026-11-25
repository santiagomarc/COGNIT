
/* Three-step landing explainer. Visual previews are illustrative, not interactive. */

import { ArrowUpFromLine, FileText } from 'lucide-react';
import { RevealOnScroll } from '@/components/motion';

const steps = [
  {
    number: '01',
    title: 'Upload or type your material',
    description:
      'Upload a PDF, paste notes as Term – Definition, or write cards yourself.',
  },
  {
    number: '02',
    title: 'AI generates the cards',
    description:
      'Cognit reads your content, identifies the key concepts, and writes question-and-answer pairs you can edit before you study them.',
  },
  {
    number: '03',
    title: 'Master it with spaced repetition',
    description:
      'The SM-2 algorithm schedules each card for the moment you are about to forget it. Every session pushes the next review further out.',
  },
];

function StepPreview({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="flex w-full items-center justify-center p-2">
        <div className="w-full max-w-[230px] rounded-lg border border-dashed border-[var(--border-control)] bg-[var(--surface)] p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-[var(--surface-raised)] text-[#B7410E]">
              <ArrowUpFromLine className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink sm:text-sm">
                Lecture_08.pdf
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-dimmer">
                Ready to upload
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
            <FileText className="size-3.5 text-ink-dim" />
            <span className="font-mono text-[10px] text-ink-dim">
              PDF or pasted notes
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="relative mx-auto h-[125px] w-full max-w-[235px]">
        <div className="absolute inset-x-7 top-2 h-[90px] rotate-[-5deg] rounded-md border border-border bg-[var(--surface)]" />
        <div className="absolute inset-x-4 top-4 h-[90px] rotate-[3deg] rounded-md border border-border bg-[var(--surface-raised)]" />
        <div className="absolute inset-x-1 top-7 flex h-[90px] flex-col justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 shadow-sm">
          <p className="font-mono text-[9px] uppercase tracking-wider text-ink-dimmer">
            Sample flashcard
          </p>
          <p className="mt-2 font-serif text-lg leading-tight text-ink">
            What makes a language regular?
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[255px] px-1">
      <div className="relative grid grid-cols-4 gap-1.5">
        <div className="absolute left-[12%] right-[12%] top-[31px] h-px bg-[var(--border-strong)]" />
        {['Now', '3d', '8d', '21d'].map((day, i) => (
          <div key={day} className="relative flex flex-col items-center gap-2.5">
            <span className="font-mono text-[10px] text-ink-dim">
              {day}
            </span>
            <span
              className={`relative z-[1] size-3.5 rounded-full border-2 ${
                i === 1
                  ? 'border-[#B7410E] bg-[#B7410E] ring-4 ring-[#B7410E]/15'
                  : 'border-[var(--border-control)] bg-[var(--surface)]'
              }`}
            />
          </div>
        ))}
      </div>
      <p className="mt-5 text-center font-mono text-[10px] text-ink-dimmer">
        Example review intervals
      </p>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-40 py-20 sm:py-24 lg:scroll-mt-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 max-w-2xl sm:mb-12">
          <p className="type-label text-ink-dimmer">
            How it works
          </p>
          <h2 className="mt-3 font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance text-ink">
            Three steps to <em className="font-normal">mastery</em>
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-ink-dim">
            From raw material to lasting knowledge in minutes, not hours.
          </p>
        </div>

        <ol className="grid gap-4 lg:grid-cols-3">
          {steps.map((step, i) => (
            <RevealOnScroll
              key={step.number}
              as="li"
              delay={i * 0.08}
              className="surface group relative flex min-w-0 flex-col rounded-xl border border-border p-5 transition-[border-color,box-shadow] duration-200 hover:border-[var(--border-strong)] hover:shadow-md sm:p-6 lg:min-h-[335px]"
            >
              <span
                aria-hidden="true"
                className="absolute right-5 top-4 font-serif text-[42px] leading-none text-[#B7410E] opacity-70"
              >
                {step.number}
              </span>

              <div
                aria-hidden="true"
                className="well mb-5 mt-8 flex min-h-[145px] items-center justify-center overflow-hidden rounded-lg p-2"
              >
                <StepPreview index={i} />
              </div>

              <div className="mt-auto">
                <h3 className="font-serif text-xl leading-tight tracking-[-0.02em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">
                  {step.description}
                </p>
              </div>
            </RevealOnScroll>
          ))}
        </ol>
      </div>
    </section>
  );
}
