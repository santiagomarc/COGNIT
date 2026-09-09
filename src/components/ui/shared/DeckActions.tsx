'use client';

import { useState } from 'react';
import { deleteDeck, updateDeck } from '@/app/actions/deck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { Pencil, Trash2, X, Check } from 'lucide-react';
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

    async function handleDelete() {
        setIsLoading(true);
        onDeleteOptimistic?.();
        const result = await deleteDeck(deckId);
        if (result?.error) {
            onDeleteRollback?.();
            toast.error(typeof result.error === 'string' ? result.error : 'Failed to delete deck');
        } else {
            toast.success('Deck deleted');
        }
        setIsLoading(false);
        setShowDeleteConfirm(false);
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
                        className="h-8 w-full rounded-[var(--radius-control)] border border-[var(--border-control)] bg-transparent px-2 text-xs outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
                title="Delete this deck?"
                description="All cards in this deck will be permanently deleted. This cannot be undone."
                confirmLabel="Delete"
                variant="destructive"
                loading={isLoading}
                onConfirm={handleDelete}
            />
        </>
    );
}
