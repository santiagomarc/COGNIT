
/* Six-card landing feature showcase. Visual previews are illustrative. */

import { FileText, Search } from 'lucide-react';
import { RevealOnScroll } from '@/components/motion';
import { Kbd } from '@/components/ui/Kbd';

const features = [
  {
    stat: 'PDF',
    title: 'Import anything',
    description:
      'Upload a PDF and Cognit writes cards from its text. Paste plain-text notes to import them as cards.',
  },
  {
    stat: 'AI',
    title: 'Cards written for you',
    description:
      'Dense source material becomes question-and-answer pairs you can edit, tag and quiz on.',
  },
  {
    stat: 'SM-2',
    title: 'Scheduled, not guessed',
    description:
      'Every grade moves the card along a real interval. The deck tells you what is due and when.',
  },
  {
    stat: '4',
    title: 'Grades, on the home row',
    description:
      'Again, hard, good, easy — bound to 1 through 4, with the interval each one buys shown before you commit.',
  },
  {
    stat: '2',
    title: 'Themes, both first-class',
    description:
      'A true-neutral light and dark theme. Colour appears only where it reports scheduler state.',
  },
  {
    stat: '⌘K',
    title: 'Keyboard first',
    description:
      'Jump to any deck, start a session or flip a theme without reaching for the mouse.',
  },
];

function FeaturePreview({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="w-full max-w-[300px] px-2">
        <div className="relative mx-auto mb-5 max-w-[215px]">
          <div className="absolute inset-0 translate-x-2 -translate-y-1.5 rotate-[-3deg] rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)]" />
          <div className="relative flex items-center gap-2.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-3 shadow-sm">
            <FileText className="size-4 shrink-0 text-[#B7410E]" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">
                Lecture_08.pdf
              </p>
              <p className="mt-1 font-mono text-[10px] text-ink-dimmer">
                PDF study material
              </p>
            </div>
          </div>
        </div>
        <p className="font-mono text-[10px] text-ink-dim">
          Generating study cards…
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--border)]">
          <div className="h-full w-[68%] rounded-full bg-[#B7410E]" />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="relative h-[135px] w-full max-w-[305px]">
        <div className="absolute inset-x-9 top-2 h-[100px] rotate-[-4deg] rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)]" />
        <div className="absolute inset-x-6 top-4 h-[100px] rotate-[3deg] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]" />
        <div className="absolute inset-x-2 top-7 flex h-[100px] flex-col justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 shadow-sm">
          <p className="font-mono text-[9px] uppercase tracking-wider text-ink-dimmer">
            Automata Theory · Sample card
          </p>
          <p className="mt-2 font-serif text-lg leading-tight text-ink">
            What makes a language regular?
          </p>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="w-full max-w-[255px]">
        <div className="relative grid grid-cols-4 gap-1">
          <div className="absolute left-[12%] right-[12%] top-[30px] h-px bg-[var(--border-strong)]" />
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
          Illustrative review intervals
        </p>
      </div>
    );
  }

  if (index === 3) {
    const grades = [
      { key: '1', name: 'Again', time: '1m', color: 'var(--state-lapsed)' },
      { key: '2', name: 'Hard', time: '10m', color: 'var(--state-learning)' },
      { key: '3', name: 'Good', time: '4d', color: 'var(--state-mastered)' },
      { key: '4', name: 'Easy', time: '9d', color: 'var(--state-due)' },
    ];

    return (
      <div className="grid w-full grid-cols-2 gap-1.5 lg:grid-cols-4">
        {grades.map((grade) => (
          <div
            key={grade.key}
            className="key pointer-events-none min-w-0 !cursor-default"
            style={{ borderTopColor: grade.color }}
          >
            <span className="kk">{grade.key}</span>
            <span className="kn">{grade.name}</span>
            <span className="ki">{grade.time}</span>
          </div>
        ))}
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="grid w-full max-w-[255px] grid-cols-2 gap-2">
        <div className="rounded-lg border border-[#e4e4e7] bg-[#fbfbfc] p-2.5 text-[#18181b] shadow-sm">
          <p className="text-xs font-semibold">Light</p>
          <div className="mt-3 rounded border border-[#e4e4e7] bg-white p-2">
            <div className="h-1.5 w-3/4 rounded bg-[#d4d4d8]" />
            <div className="mt-1.5 h-1.5 w-1/2 rounded bg-[#e4e4e7]" />
          </div>
        </div>
        <div className="rounded-lg border border-[#3f3f46] bg-[#131316] p-2.5 text-[#fafafa] shadow-sm">
          <p className="text-xs font-semibold">Dark</p>
          <div className="mt-3 rounded border border-[#3f3f46] bg-[#09090b] p-2">
            <div className="h-1.5 w-3/4 rounded bg-[#6f6f79]" />
            <div className="mt-1.5 h-1.5 w-1/2 rounded bg-[#3f3f46]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[440px] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border pb-2.5 text-ink-dim">
        <Search className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs">
          Search decks or actions…
        </span>
        <Kbd>⌘K</Kbd>
      </div>
      <div className="mt-2 rounded-md bg-[var(--surface-raised)] px-3 py-2 text-xs font-semibold text-ink">
        Start today's review
      </div>
      <p className="px-3 pt-2 text-xs text-ink-dim">
        Open Automata Theory
      </p>
    </div>
  );
}

export function FeatureGrid() {
  const cardBase =
    'surface group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border p-5 transition-[border-color,box-shadow] duration-200 hover:border-[var(--border-strong)] hover:shadow-md sm:p-6';

  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 flex flex-col gap-4 lg:mb-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[600px]">
            <p className="type-label text-ink-dimmer">
              Features
            </p>
            <h2 className="mt-3 font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance text-ink">
              Everything you need to{' '}
              <em className="font-normal">ace every exam</em>
            </h2>
          </div>
          <p className="max-w-xs leading-relaxed text-ink-dim lg:pb-1">
            Built for serious students who want real results.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {features.map((feature, i) => {
            const isWide = i === 5;
            const span =
              i < 2
                ? 'lg:col-span-3 lg:min-h-[340px]'
                : isWide
                  ? 'sm:col-span-2 lg:col-span-6'
                  : i === 4
                    ? 'sm:col-span-2 lg:col-span-2 lg:min-h-[300px]'
                    : 'lg:col-span-2 lg:min-h-[300px]';

            return (
              <RevealOnScroll
                key={feature.title}
                delay={i * 0.05}
                className={`${cardBase} ${span}`}
              >
                <span className="absolute right-5 top-4 font-mono text-xs font-semibold text-ink-dimmer">
                  {feature.stat}
                </span>

                {isWide ? (
                  <div className="grid gap-5 pt-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-8 lg:pt-0">
                    <div>
                      <h3 className="font-serif text-xl leading-tight tracking-[-0.02em] text-ink">
                        {feature.title}
                      </h3>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-dim">
                        {feature.description}
                      </p>
                    </div>
                    <div
                      aria-hidden="true"
                      className="well flex min-h-[145px] items-center justify-center p-3"
                    >
                      <FeaturePreview index={i} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      aria-hidden="true"
                      className={`well mb-5 mt-7 flex items-center justify-center overflow-hidden p-3 ${
                        i < 2 ? 'min-h-[155px]' : 'min-h-[130px]'
                      }`}
                    >
                      <FeaturePreview index={i} />
                    </div>
                    <div className="mt-auto">
                      <h3 className="font-serif text-xl leading-tight tracking-[-0.02em] text-ink">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
                        {feature.description}
                      </p>
                    </div>
                  </>
                )}
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}
