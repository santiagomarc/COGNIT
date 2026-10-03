import { cn } from '@/lib/utils';

type SettingsSectionProps = {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * One Settings section (design system §7.12, Rev. E): a 240 px heading column
 * beside the controls at `md` and up, stacked below. Sections are separated by
 * a rule, never a card — this is a dense surface (§1 principle 1).
 *
 * `scroll-mt-16` keeps the heading clear of the sticky shell header when the
 * section is reached by its `#id`.
 */
export function SettingsSection({ id, title, description, children, className }: SettingsSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        'scroll-mt-16 border-t border-border py-6 md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-x-12',
        className,
      )}
    >
      <div className="mb-3 md:mb-0">
        <h2 id={`${id}-title`} className="text-base font-semibold tracking-[-.01em] text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-[13px] leading-[1.55] text-ink-dim">{description}</p> : null}
      </div>
      <div className="min-w-0 divide-y divide-border">{children}</div>
    </section>
  );
}

type SettingsRowProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** The control's id, so the label is a real `<label>`. Omit for read-only rows and control groups. */
  htmlFor?: string;
  /** id for the hint, for the control's `aria-describedby`. */
  hintId?: string;
  children?: React.ReactNode;
};

/** A labelled row: label and hint on the left, the control on the right; stacked below `md`. */
export function SettingsRow({ label, hint, htmlFor, hintId, children }: SettingsRowProps) {
  const LabelTag = htmlFor ? 'label' : 'p';
  return (
    <div className="flex min-h-14 flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="min-w-0">
        <LabelTag {...(htmlFor ? { htmlFor } : {})} className="block text-sm text-ink">
          {label}
        </LabelTag>
        {hint ? (
          <p id={hintId} className="mt-0.5 text-[12px] leading-[1.5] text-ink-dim">
            {hint}
          </p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
