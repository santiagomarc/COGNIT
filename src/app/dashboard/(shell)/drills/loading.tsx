/**
 * The Drills skeleton, shaped like what arrives: the header, the raised
 * launcher, then the well of other decks — so nothing shifts when it lands.
 */
export default function DrillsLoading() {
  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      <div className="space-y-2">
        <div className="glass-skeleton h-3 w-20 rounded-sm" />
        <div className="glass-skeleton h-8 w-32 rounded-sm" />
        <div className="glass-skeleton h-3 w-48 rounded-sm" />
      </div>
      <div className="raised flex items-center justify-between gap-4 p-4 md:px-[22px] md:py-4">
        <div className="space-y-2">
          <div className="glass-skeleton h-3 w-16 rounded-sm" />
          <div className="glass-skeleton h-4 w-48 rounded-sm" />
          <div className="glass-skeleton h-3 w-28 rounded-sm" />
        </div>
        <div className="glass-skeleton h-[44px] w-32 rounded-sm" />
      </div>
      <div className="well p-3.5">
        <div className="glass-skeleton h-8 w-full rounded-sm" />
        <div className="glass-skeleton mt-2 h-8 w-full rounded-sm" />
      </div>
    </div>
  );
}
