/**
 * The stats skeleton, shaped like what arrives: a header strip, one raised
 * forecast block, two half-width panels, then two tables — so nothing shifts
 * when the data lands.
 */
export default function StatsLoading() {
  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      <div className="space-y-2">
        <div className="glass-skeleton h-3 w-32 rounded-sm" />
        <div className="glass-skeleton h-8 w-48 rounded-sm" />
      </div>
      <div className="raised p-4 md:px-[22px] md:py-[18px]">
        <div className="glass-skeleton h-3 w-56 rounded-sm" />
        <div className="glass-skeleton mt-4 h-[130px] w-full rounded-sm" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-4 lg:p-5">
          <div className="glass-skeleton h-3 w-40 rounded-sm" />
          <div className="glass-skeleton mt-4 h-16 w-full rounded-sm" />
        </div>
        <div className="surface p-4 lg:p-5">
          <div className="glass-skeleton h-3 w-40 rounded-sm" />
          <div className="glass-skeleton mt-4 h-[110px] w-full rounded-sm" />
        </div>
      </div>
      <div className="well p-3.5">
        <div className="glass-skeleton h-10 w-full rounded-sm" />
        <div className="glass-skeleton mt-2 h-10 w-full rounded-sm" />
        <div className="glass-skeleton mt-2 h-10 w-full rounded-sm" />
      </div>
    </div>
  );
}
