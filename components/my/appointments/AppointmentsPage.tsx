"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useMyAppointments } from "@/hooks/useMyAppointments";
import { cancelMyAppointment, PAST_PAGE_SIZE } from "@/lib/my-appointments";
import { BookingApiError } from "@/lib/booking-client";
import { AppointmentCard } from "./AppointmentCard";
import { CancelModal } from "./CancelModal";
import {
  ErrorBanner,
  OfflineNotice,
  SectionEmpty,
  SkeletonList,
} from "./StatePanels";

export function AppointmentsPage() {
  // Reads ?page via useSearchParams → wrap in Suspense.
  return (
    <Suspense fallback={<Container className="py-10 sm:py-14"><SkeletonList count={3} /></Container>}>
      <AppointmentsInner />
    </Suspense>
  );
}

function AppointmentsInner() {
  const { isOnline } = useOnlineStatus();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // History page lives in the URL (?page) so reload/back keep the position.
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const { upcoming, past, state, pastLoading, reload, source } = useMyAppointments(
    isOnline,
    page,
    PAST_PAGE_SIZE,
  );

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hrefFor = (p: number) => (p <= 1 ? pathname : `${pathname}?page=${p}`);

  // Clamp an out-of-range ?page (e.g. shared/stale link) to the last page.
  useEffect(() => {
    if (!pastLoading && past.total > 0 && page > past.totalPages) {
      router.replace(hrefFor(past.totalPages));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastLoading, past.total, past.totalPages, page]);

  const cancelTarget =
    upcoming.find((a) => a.id === cancelId) ??
    past.items.find((a) => a.id === cancelId) ??
    null;

  const confirmCancel = async () => {
    if (!cancelId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await cancelMyAppointment(cancelId);
      setCancelId(null);
      reload(); // slot is freed server-side; refetch the fresh list
    } catch (err) {
      setActionError(
        err instanceof BookingApiError
          ? err.message
          : "Не вдалося скасувати запис. Спробуйте ще раз.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const loadingFirst = state === "loading";
  const rangeStart = past.total === 0 ? 0 : (page - 1) * past.pageSize + 1;
  const rangeEnd = Math.min(page * past.pageSize, past.total);

  return (
    <Container className="py-10 sm:py-14">
      {/* Header */}
      <div className="mb-6">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
          Мій профіль
        </span>
        <h1 className={cn(displayM, "text-navy-900")}>
          Мої <em className="italic text-mint-600">записи</em>
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
          Ваші майбутні візити та історія відвідувань клініки.
        </p>
      </div>

      {!isOnline && <OfflineNotice className="mb-6" />}

      {actionError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {state === "error" && source === "server" ? (
        <ErrorBanner onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-10">
          {/* Upcoming — ALL, no pagination */}
          <section aria-labelledby="upcoming-heading">
            <SectionHeading
              id="upcoming-heading"
              title="На коли я записаний"
              count={loadingFirst ? undefined : upcoming.length}
            />
            {loadingFirst ? (
              <SkeletonList count={2} />
            ) : upcoming.length === 0 ? (
              <SectionEmpty
                title="Ви ще не записані"
                hint="Запишіться до лікаря у зручний час — візит зʼявиться тут."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    variant="upcoming"
                    online={isOnline}
                    onCancel={setCancelId}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Past — paginated history */}
          <section aria-labelledby="past-heading">
            <SectionHeading
              id="past-heading"
              title="Історія візитів"
              count={loadingFirst ? undefined : past.total}
            />
            {loadingFirst || pastLoading ? (
              <SkeletonList count={3} />
            ) : past.total === 0 ? (
              <SectionEmpty title="Історія візитів порожня" />
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {past.items.map((a) => (
                    <AppointmentCard key={a.id} appointment={a} variant="past" />
                  ))}
                </div>
                <PaginationPanel
                  page={page}
                  totalPages={past.totalPages}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  total={past.total}
                  hrefFor={hrefFor}
                  onNavigate={(p) => router.push(hrefFor(p))}
                />
              </>
            )}
          </section>
        </div>
      )}

      {cancelTarget && (
        <CancelModal
          key={cancelTarget.id}
          appointment={cancelTarget}
          submitting={submitting}
          onConfirm={confirmCancel}
          onClose={() => setCancelId(null)}
        />
      )}
    </Container>
  );
}

function SectionHeading({
  id,
  title,
  count,
}: {
  id: string;
  title: string;
  count?: number;
}) {
  return (
    <h2
      id={id}
      className="mb-3 flex items-center gap-2 font-serif text-[22px] tracking-[-0.01em] text-navy-900"
    >
      {title}
      {count !== undefined && (
        <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium tabular-nums text-navy-400">
          {count}
        </span>
      )}
    </h2>
  );
}

// ─── Numbered pagination (matches the admin tables) ───────────────────────────

function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const keep = [...new Set([1, totalPages, current - 1, current, current + 1])]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of keep) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function PaginationPanel({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  hrefFor,
  onNavigate,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  hrefFor: (p: number) => string;
  onNavigate: (p: number) => void;
}) {
  const arrow =
    "grid h-9 w-9 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--line-2)]";
  return (
    <nav aria-label="Пагінація історії візитів" className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-xs tabular-nums text-navy-400">{rangeStart}–{rangeEnd} із {total}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onNavigate(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="hidden items-center gap-1.5 sm:flex">
          {buildPageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} aria-hidden="true" className="px-1 text-sm text-navy-400">…</span>
            ) : (
              <a
                key={p}
                href={hrefFor(p)}
                onClick={(e) => { e.preventDefault(); onNavigate(p); }}
                aria-label={`Сторінка ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                  p === page ? "bg-navy-900 text-white" : "border border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
                )}
              >
                {p}
              </a>
            ),
          )}
        </div>
        <span className="px-1 text-sm tabular-nums text-navy-700 sm:hidden">стор. {page} із {totalPages}</span>
        <button type="button" onClick={() => onNavigate(page + 1)} disabled={page >= totalPages} aria-label="Наступна сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    </nav>
  );
}
