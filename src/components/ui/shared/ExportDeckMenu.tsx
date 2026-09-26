import { Button } from '@/components/ui/button';

/**
 * Two downloads (plan §4.1c). Plain links to the export route: no client
 * JavaScript, and the browser's own download UI. Anki reads the file with
 * File → Import (2.1.55+), no dialog choices needed.
 */
export function ExportDeckMenu({ deckId }: { deckId: string }) {
  return (
    <div role="group" aria-label="Export this deck" className="flex items-center gap-1">
      <Button asChild variant="ghost" size="sm">
        <a href={`/api/decks/${deckId}/export?format=csv`} download>Export CSV</a>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <a href={`/api/decks/${deckId}/export?format=anki`} download>Export for Anki</a>
      </Button>
    </div>
  );
}
