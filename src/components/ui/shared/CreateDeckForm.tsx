'use client'; // allows to use hooks like useState and useEffect

import { useState } from 'react';
import {createDeck} from '@/app/actions'; // import server action
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import { toast } from 'sonner';

export function CreateDeckForm() {
    // simple state to handle loading
    const[isLoading, setIsLoading] = useState(false);

    // handle form submission
    async function handleSubmit(formData: FormData) {
        setIsLoading(true);

        // extract data from form
        const title = formData.get('title') as string;
        // call the server action (the backend function)
        const result = await createDeck({ title, is_public: false });
        // handle the response
        if (result?.error) {
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to create deck');
        } else {
        toast.success('Deck created successfully');
        }
        setIsLoading(false);
    }

    return (
    <form action={handleSubmit} className="glass-card glow-border flex flex-col gap-4 p-5 rounded-2xl text-card-foreground max-w-md">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Create New Deck</h3>
        <p className="text-sm text-muted-foreground">Start a new collection of flashcards.</p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="title">Deck Title</Label>
        <Input id="title" name="title" placeholder="e.g. Automata Theory" required />
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Deck'}
      </Button>
    </form>
  );
}