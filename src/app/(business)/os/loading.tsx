/**
 * Business OS loading state.
 *
 * Every screen here is dynamic and database-backed, so navigation always costs a
 * round trip. Without a skeleton the browser sits on the previous page and the
 * click feels ignored; with one, the app answers immediately and fills in.
 */
export default function OsLoading() {
  return (
    <div role="status" aria-label="Yükleniyor" className="motion-safe:animate-pulse">
      <div className="mb-7 space-y-2">
        <div className="h-7 w-56 rounded-md bg-neutral-200" />
        <div className="h-4 w-96 max-w-full rounded bg-neutral-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <div className="h-3 w-20 rounded bg-neutral-100" />
            <div className="mt-3 h-6 w-28 rounded bg-neutral-200" />
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-3.5">
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/60 px-5 py-3.5">
            <div className="h-4 flex-1 rounded bg-neutral-100" />
            <div className="h-4 w-24 rounded bg-neutral-100" />
            <div className="h-4 w-20 rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
