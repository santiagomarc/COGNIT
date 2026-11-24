'use client';

import { useRef, type ReactNode, type RefObject } from 'react';
import { DropdownMenu } from 'radix-ui';

const ITEM =
  'flex h-8 cursor-pointer select-none items-center rounded-[var(--radius-control)] px-2.5 type-sm text-ink ' +
  'outline-hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] data-highlighted:bg-surface-raised data-disabled:pointer-events-none data-disabled:opacity-50 pointer-coarse:h-11';

type DeckActionsMenuProps = {
  trigger: ReactNode;
  triggerRef: RefObject<HTMLButtonElement | null>;
  defaultOpen: boolean;
  busy: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
};

/**
 * The deck row's "⋯" menu. Radix supplies the menu keyboard contract (arrow
 * keys, typeahead, Escape, focus back to the trigger); DeckActions loads this
 * file on first use, because the dashboard's bundle has no room for it.
 *
 * Not modal: a modal Radix menu injects a `<style>` to lock scrolling, and a
 * three-item menu doesn't need the page inert.
 */
export function DeckActionsMenu({ trigger, triggerRef, defaultOpen, busy, onRename, onDuplicate, onTrash }: DeckActionsMenuProps) {
  const trashOnClose = useRef(false);

  return (
    <DropdownMenu.Root modal={false} defaultOpen={defaultOpen}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-[var(--z-overlay)] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-surface p-1 shadow-[var(--elevate-2)]"
          onCloseAutoFocus={(event) => {
            if (!trashOnClose.current) return;
            trashOnClose.current = false;
            // The confirm dialog records the focused element as its opener, so
            // focus has to be back on the trigger before it opens.
            event.preventDefault();
            triggerRef.current?.focus();
            onTrash();
          }}
        >
          <DropdownMenu.Item className={ITEM} onSelect={onRename}>Rename</DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} disabled={busy} onSelect={onDuplicate}>Duplicate</DropdownMenu.Item>
          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => {
              trashOnClose.current = true;
            }}
          >
            Move to trash
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
