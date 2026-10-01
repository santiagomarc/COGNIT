/** The Shared skeleton: the header, then a well of link rows. */
export default function SharedLoading() {
  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      <div className="space-y-2">
        <div className="glass-skeleton h-3 w-16 rounded-sm" />
        <div className="glass-skeleton h-8 w-32 rounded-sm" />
        <div className="glass-skeleton h-3 w-80 max-w-full rounded-sm" />
      </div>
      <div className="well p-3.5">
        <div className="glass-skeleton h-10 w-full rounded-sm" />
        <div className="glass-skeleton mt-2 h-10 w-full rounded-sm" />
      </div>
    </div>
  );
}
