'use client';

import { useState } from 'react';
import { deleteDeck, updateDeck } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, X, Check } from 'lucide-react';

interface DeckActionsProps {
    deckId: string;
    currentTitle: string;
}

export function DeckActions({ deckId, currentTitle }: DeckActionsProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(currentTitle);
    const [isLoading, setIsLoading] = useState(false);

    // Toggle Edit Mode
    if (isEditing) {
        return (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-8 w-full neon-focus"
                    autoFocus
                />
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                        setIsLoading(true);
                        await updateDeck(deckId, title);
                        setIsEditing(false);
                        setIsLoading(false);
                    }}
                    disabled={isLoading}
                >
                    <Check className="h-4 w-4 text-green-500" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                        setIsEditing(false);
                        setTitle(currentTitle);
                    }}
                >
                    <X className="h-4 w-4 text-red-500" />
                </Button>
            </div>
        );
    }

    return (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
            <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                title="Rename Deck"
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
            >
                <Pencil className="h-4 w-4" />
            </Button>

            <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                    if (confirm('Are you sure you want to delete this deck?')) {
                        await deleteDeck(deckId);
                    }
                }}
                title="Delete Deck"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
}
