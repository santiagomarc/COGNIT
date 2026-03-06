'use client';

type StudyMode = 'flashcard' | 'identification' | 'mcq';

type StudyModeSelectorProps = {
  value: StudyMode;
  onValueChange: (mode: StudyMode) => void;
};

const MODES: Array<{ value: StudyMode; label: string; description: string }> = [
  { value: 'flashcard', label: 'Flashcards', description: 'Reveal then grade' },
  { value: 'identification', label: 'Identification', description: 'Type the term' },
  { value: 'mcq', label: 'MCQ', description: 'Choose the best answer' },
];

export function StudyModeSelector({ value, onValueChange }: StudyModeSelectorProps) {
  return (
    <div className="glass-card rounded-2xl p-2">
      <div className="grid gap-2 md:grid-cols-3">
        {MODES.map((mode) => {
          const active = value === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => onValueChange(mode.value)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-primary/30 bg-primary/10 text-foreground' : 'border-primary/10 bg-card/20 text-muted-foreground hover:border-primary/20 hover:bg-card/40 hover:text-foreground'}`}
            >
              <p className="text-sm font-semibold">{mode.label}</p>
              <p className="mt-1 text-xs">{mode.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}