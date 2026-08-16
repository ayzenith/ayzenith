/**
 * The CMS had no loading state anywhere.
 *
 * Every dashboard page is `force-dynamic` and queries the database, so without a
 * Suspense boundary Next.js keeps the PREVIOUS page on screen until the new one
 * has finished rendering on the server — measured at roughly a second. Clicking
 * a link therefore did nothing at all for that second, which reads as a broken
 * button rather than as loading.
 *
 * This file is that boundary. It does two things at once: the shell appears the
 * instant a link is clicked, and — because a route with a loading state can be
 * prefetched — Next can fetch it on hover before the click even happens.
 *
 * The skeleton deliberately mirrors the real layout (header, stat row, list) so
 * the page settles into place instead of jumping.
 */
function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-surface-sunken motion-safe:animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Sayfa yükleniyor" aria-live="polite">
      <span className="sr-only">Yükleniyor…</span>

      {/* PageHeader */}
      <div className="mb-8">
        <Bar className="h-8 w-56" />
        <Bar className="mt-3 h-4 w-full max-w-2xl" />
        <Bar className="mt-2 h-4 w-2/3 max-w-md" />
      </div>

      {/* Stat row */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5">
            <Bar className="h-3 w-24" />
            <Bar className="mt-4 h-7 w-16" />
          </div>
        ))}
      </div>

      {/* Content card */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <Bar className="h-4 w-40" />
        <div className="mt-5 space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Bar className="size-10 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <Bar className="h-4 w-1/3" />
                <Bar className="mt-2 h-3 w-1/2" />
              </div>
              <Bar className="hidden h-3 w-20 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
