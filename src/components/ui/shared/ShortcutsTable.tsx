'use client';

import { useSyncExternalStore } from 'react';

import { Kbd } from '@/components/ui/Kbd';
import { groupShortcuts, keycapLabel } from '@/lib/shortcuts';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

const noop = () => () => {};

/**
 * Whether to draw ⌘ or Ctrl. The server cannot know, so it renders the
 * neutral "Ctrl" spelling and the client corrects it after hydration.
 */
function useApplePlatform(): boolean {
  return useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/**
 * Every shortcut, grouped by where it works (sidebar plan §5.7, SET-06). The
 * shortcuts dialog and Settings → Keyboard shortcuts both render this, from
 * the one registry in `src/lib/shortcuts.ts`.
 */
export function ShortcutsTable({ className }: { className?: string }) {
  const apple = useApplePlatform();

  return (
    <div className={className}>
      {groupShortcuts().map((group) => (
        <table key={group.scope} className="mb-4 w-full border-collapse last:mb-0">
          <caption className={`${LABEL} pb-1.5 text-left`}>{group.scope}</caption>
          <tbody>
            {group.shortcuts.map((shortcut) => (
              <tr key={shortcut.id} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-2 pr-4 text-left text-[13px] font-normal text-ink-dim">
                  {shortcut.label}
                </th>
                <td className="py-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    {shortcut.keys.map((key, index) => (
                      <Kbd key={`${shortcut.id}-${index}`}>{keycapLabel(key, apple)}</Kbd>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
