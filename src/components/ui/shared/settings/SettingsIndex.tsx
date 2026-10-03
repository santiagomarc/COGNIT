import { SETTINGS_SECTIONS } from '@/lib/sidebar-nav';

/**
 * The section index (sidebar plan §5.1, SET-00). The expanded sidebar lists
 * the sections itself (§6.4), so this shows only where it cannot: the phone
 * drawer, which is closed while reading, and the 48px rail, which has no room.
 * globals.css decides from `.shell[data-sidebar]` and the width.
 */
export function SettingsIndex() {
  return (
    // `settings-index`: hidden by globals.css wherever the expanded sidebar lists the sections itself.
    <nav aria-label="Settings sections" className="settings-index mt-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="inline-flex items-center rounded-[var(--radius-sm)] text-[13px] text-ink-dim outline-hidden hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] max-md:min-h-11"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
