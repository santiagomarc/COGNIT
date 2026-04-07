export default function DeckDetailLoading() {
  return (
    <div className="container mx-auto space-y-8 p-6 md:p-8">
      <div className="glass-skeleton h-6 w-40 rounded-lg" />
      <div className="space-y-3 rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-md p-6">
        <div className="glass-skeleton h-8 w-64 rounded-lg" />
        <div className="glass-skeleton h-4 w-96 max-w-full rounded-lg" />
      </div>

      <div className="rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-md p-5">
        <div className="glass-skeleton h-6 w-32 rounded-lg" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="glass-skeleton h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
