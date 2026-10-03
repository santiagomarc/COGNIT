/** The Settings skeleton: the heading, the index, then ruled sections. */
export default function SettingsLoading() {
  return (
    <div className="container mx-auto flex max-w-[1000px] flex-col p-4 md:px-8 md:py-6">
      <div className="space-y-2 pb-4">
        <div className="glass-skeleton h-8 w-36 rounded-sm" />
        <div className="glass-skeleton h-3 w-72 max-w-full rounded-sm" />
        <div className="glass-skeleton mt-4 h-3 w-96 max-w-full rounded-sm" />
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="border-t border-border py-6 md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-x-12">
          <div className="space-y-2">
            <div className="glass-skeleton h-4 w-28 rounded-sm" />
            <div className="glass-skeleton h-3 w-40 rounded-sm" />
          </div>
          <div className="mt-3 space-y-3 md:mt-0">
            <div className="glass-skeleton h-10 w-full rounded-sm" />
            <div className="glass-skeleton h-10 w-full rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}
