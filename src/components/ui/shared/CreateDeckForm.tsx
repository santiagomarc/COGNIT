'use client'; // allows to use hooks like useState and useEffect

import { useState } from 'react';
import {createDeck} from '@/app/actions'; // import server action
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

export function CreateDeckForm() {
    // simple state to handle loading
    const[isLoading, setIsLoading] = useState(false);
    const[error, setError] = useState<string | null>(null);

    // handle form submission
    async function handleSubmit(formData: FormData) {
        setIsLoading(true);
        setError(null);

        // extract data from form
        const title = formData.get('title') as string;
        // call the server action (the backend function)
        const result = await createDeck({ title, is_public: false });
        // handle the response
        if (result?.error) {
            //simplistic eeror handling FOR NOW
            setError(typeof result.error === 'string' ? result.error : 'Failed to create deck');
        } else {
        // Success! The page will automatically refresh because of revalidatePath in actions.ts
        // We can clear the form or close the modal here if we had one.        }
        }
        setIsLoading(false);
    }

    return (
    <form action={handleSubmit} className="flex flex-col gap-4 p-4 border rounded-lg bg-card text-card-foreground shadow-sm max-w-md">
      <div>
        <h3 className="text-lg font-semibold">Create New Deck</h3>
        <p className="text-sm text-muted-foreground">Start a new collection of flashcards.</p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="title">Deck Title</Label>
        <Input id="title" name="title" placeholder="e.g. Automata Theory" required />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Deck'}
      </Button>
    </form>
  );
}