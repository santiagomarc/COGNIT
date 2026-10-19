'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { CommandPalette as CommandPaletteType } from '@/components/ui/shared/CommandPalette';
import { paletteOpenAfterHotkey } from '@/lib/command-palette';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/lib/dashboard-events';
import { pageShortcutBlocked } from '@/lib/hotkeys';
import { isPaletteHotkey } from '@/lib/shell-hotkeys';
import { useLazyDialog } from '@/lib/use-lazy-dialog';

const loadPalette = () => import('@/components/ui/shared/CommandPalette');
const CommandPalette = dynamic(() => loadPalette().then((mod) => mod.CommandPalette), { ssr: false });

/** Opens a closed palette on ⌘K, as the palette's own handler would. */
function opensPalette(event: KeyboardEvent): boolean {
  return isPaletteHotkey(event) && paletteOpenAfterHotkey(false, pageShortcutBlocked(event));
}

/**
 * The ⌘K palette, loaded on first use (performance plan PERF-13): ⌘K, or the
 * sidebar's Search through OPEN_COMMAND_PALETTE_EVENT, mounts it already open.
 * Its data still comes from the server with the shell.
 */
export function LazyCommandPalette(props: Omit<ComponentProps<typeof CommandPaletteType>, 'defaultOpen'>) {
  const mode = useLazyDialog({ eventName: OPEN_COMMAND_PALETTE_EVENT, opensOn: opensPalette, preload: loadPalette });
  return mode === 'waiting' ? null : <CommandPalette {...props} defaultOpen={mode === 'open'} />;
}
