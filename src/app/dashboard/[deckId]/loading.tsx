export default function DeckDetailLoading() {
  return (
    <div className="container mx-auto space-y-8 p-8">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="space-y-3 rounded-2xl border bg-card p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-56 animate-pulse rounded-2xl border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
