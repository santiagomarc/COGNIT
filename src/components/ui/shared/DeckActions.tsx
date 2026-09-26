'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDeck } from '@/app/actions/deck';
import { duplicateDeck, restoreDeck, trashDeck } from '@/app/actions/deck-lifecycle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { Copy, Pencil, Trash2, X, Check } from 'lucide-react';
import { formatActionError } from '@/lib/ai-feedback';
import { DECK_TAG_OPTIONS, parseDeckTitleMetadata } from '@/lib/deck-tags';
import { toast } from 'sonner';

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

    // Toggle Edit Mode
    if (isEditing) {
        return (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex w-full flex-col gap-2">
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-8 w-full"
                        autoFocus
                    />
                    <select
                        value={accentTag}
                        onChange={(event) => setAccentTag(event.target.value)}
                        className="h-8 w-full rounded-[var(--radius-control)] border border-[var(--border-control)] bg-transparent px-2 text-base sm:text-xs outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        aria-label="Deck subject tag"
                    >
                        <option value="">No tag</option>
                        {DECK_TAG_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Save deck name"
                    onClick={async () => {
                        setIsLoading(true);
                        const result = await updateDeck(deckId, title, accentTag || null);
                        if (result?.error) {
                            toast.error(typeof result.error === 'string' ? result.error : 'Failed to rename deck');
                        } else {
                            toast.success('Deck renamed');
                        }
                        setIsEditing(false);
                        setIsLoading(false);
                    }}
                    disabled={isLoading}
                >
                    <Check className="h-4 w-4" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel rename"
                    onClick={() => {
                        setIsEditing(false);
                        const currentTitleMeta = parseDeckTitleMetadata(currentTitle);
                        setTitle(currentTitleMeta.cleanTitle);
                        setAccentTag(currentTitleMeta.tag ?? '');
                    }}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                        const currentTitleMeta = parseDeckTitleMetadata(currentTitle);
                        setTitle(currentTitleMeta.cleanTitle);
                        setAccentTag(currentTitleMeta.tag ?? '');
                        setIsEditing(true);
                    }}
                    title="Rename deck"
                    aria-label="Rename deck"
                    className="h-8 w-8"
                >
                    <Pencil className="h-4 w-4" />
                </Button>

                <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleDuplicate}
                    disabled={isLoading}
                    title="Duplicate deck"
                    aria-label="Duplicate deck"
                    className="h-8 w-8"
                >
                    <Copy className="h-4 w-4" />
                </Button>

                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(true)}
                    title="Delete deck"
                    aria-label="Delete deck"
                    className="h-8 w-8 hover:border-[var(--state-lapsed)] hover:text-[var(--state-lapsed)]"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

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
