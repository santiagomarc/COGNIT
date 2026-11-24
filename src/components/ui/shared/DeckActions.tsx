'use client';

import { lazy, Suspense, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDeck } from '@/app/actions/deck';
import { duplicateDeck, restoreDeck, trashDeck } from '@/app/actions/deck-lifecycle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { X, Check } from 'lucide-react';
import { formatActionError } from '@/lib/ai-feedback';
import { DECK_TAG_OPTIONS, parseDeckTitleMetadata } from '@/lib/deck-tags';
import { toast } from 'sonner';

const loadMenu = () => import('@/components/ui/shared/DeckActionsMenu');
const DeckActionsMenu = lazy(() => loadMenu().then((mod) => ({ default: mod.DeckActionsMenu })));

interface DeckActionsProps {
    deckId: string;
    currentTitle: string;
    onDeleteOptimistic?: () => void;
    onDeleteRollback?: () => void;
}

export function DeckActions({ deckId, currentTitle, onDeleteOptimistic, onDeleteRollback }: DeckActionsProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState('');
    const [accentTag, setAccentTag] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // The menu's code loads on the first click, which is also the click that opens it.
    const [menu, setMenu] = useState<'waiting' | 'open' | 'ready'>('waiting');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const router = useRouter();

    // Trash, not delete (plan §4.1a): the toast's Undo restores the deck and
    // reuses the optimistic rollback to put its row back.
    async function handleDelete() {
        setIsLoading(true);
        onDeleteOptimistic?.();
        const result = await trashDeck(deckId);
        if ('error' in result && result.error) {
            onDeleteRollback?.();
            toast.error(formatActionError(result.error, 'Failed to delete the deck.'));
        } else {
            toast.success('Deck moved to the trash', {
                description: 'You can restore it for 30 days.',
                action: {
                    label: 'Undo',
                    onClick: () => {
                        void restoreDeck(deckId).then((restored) => {
                            if ('error' in restored && restored.error) {
                                toast.error(formatActionError(restored.error, 'Could not restore the deck.'));
                                return;
                            }
                            onDeleteRollback?.();
                            router.refresh();
                        });
                    },
                },
            });
        }
        setIsLoading(false);
        setShowDeleteConfirm(false);
    }

    // A copy of the content, enrichment and embeddings, with fresh scheduling (plan §4.1b).
    async function handleDuplicate() {
        setIsLoading(true);
        const result = await duplicateDeck({ deck_id: deckId, keep_progress: false });
        setIsLoading(false);
        if (!('success' in result) || !result.success) {
            toast.error(formatActionError('error' in result ? result.error : null, 'Could not duplicate the deck.'));
            return;
        }
        toast.success('Deck duplicated');
        router.push(`/dashboard/${result.deckId}`);
    }

    function startRename() {
        const currentTitleMeta = parseDeckTitleMetadata(currentTitle);
        setTitle(currentTitleMeta.cleanTitle);
        setAccentTag(currentTitleMeta.tag ?? '');
        setMenu('ready');
        setIsEditing(true);
    }

    function stopRename() {
        setIsEditing(false);
        // The trigger only exists again once the form has gone.
        requestAnimationFrame(() => triggerRef.current?.focus());
    }

    async function handleRename() {
        setIsLoading(true);
        const result = await updateDeck(deckId, title, accentTag || null);
        setIsLoading(false);
        if (result?.error) {
            toast.error(typeof result.error === 'string' ? result.error : 'Failed to rename deck');
            return;
        }
        toast.success('Deck renamed');
        stopRename();
    }

    // Covers the whole row: the actions column is one button wide, and an input inside it was 26px.
    // On a phone it takes two lines, and the row (`has-[form]` in DeckRow) grows to hold them.
    if (isEditing) {
        return (
            <form
                className="absolute inset-0 z-10 flex items-center gap-2 max-sm:flex-wrap max-sm:content-center bg-[var(--recess)] px-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleRename();
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') stopRename();
                }}
            >
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-8 min-w-0 flex-1 max-sm:basis-full pointer-coarse:h-11"
                    aria-label="Deck name"
                    autoFocus
                />
                <select
                    value={accentTag}
                    onChange={(event) => setAccentTag(event.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-control)] bg-transparent px-2 text-base sm:w-[160px] sm:flex-none sm:text-xs pointer-coarse:h-11 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    aria-label="Deck subject tag"
                >
                    <option value="">No tag</option>
                    {DECK_TAG_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save deck name" disabled={isLoading}>
                    <Check className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel rename" onClick={stopRename}>
                    <X className="h-4 w-4" />
                </Button>
            </form>
        );
    }

    const trigger = (
        <Button
            ref={triggerRef}
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Actions for ${parseDeckTitleMetadata(currentTitle).cleanTitle}`}
            aria-haspopup="menu"
            className="text-ink-dim hover:text-ink"
            onPointerEnter={() => void loadMenu()}
            onFocus={() => void loadMenu()}
            onClick={menu === 'waiting' ? () => setMenu('open') : undefined}
        >
            <span aria-hidden="true">⋯</span>
        </Button>
    );

    return (
        <>
            {menu === 'waiting' ? (
                trigger
            ) : (
                <Suspense fallback={trigger}>
                    <DeckActionsMenu
                        trigger={trigger}
                        triggerRef={triggerRef}
                        defaultOpen={menu === 'open'}
                        busy={isLoading}
                        onRename={startRename}
                        onDuplicate={handleDuplicate}
                        onTrash={() => setShowDeleteConfirm(true)}
                    />
                </Suspense>
            )}

            <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title="Move this deck to the trash?"
                description="It disappears everywhere now and is deleted for good after 30 days. You can restore it until then."
                confirmLabel="Move to trash"
                variant="destructive"
                loading={isLoading}
                onConfirm={handleDelete}
            />
        </>
    );
}
