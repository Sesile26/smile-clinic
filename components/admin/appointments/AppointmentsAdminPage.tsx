"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/cn";
import { SkeletonList, EmptyState, ErrorBanner } from "@/components/admin/patients/StatePanels";
import { ShopApiError } from "@/lib/shop-client";
import { getDoctors } from "@/lib/booking-client";
import type { ApiDoctor } from "@/lib/booking-types";
import {
  confirmAppointment,
  rejectAppointment,
} from "@/lib/appointments-manage";
import {
  getAdminAppointments,
  APPT_DEFAULT_PAGE_SIZE,
  APPT_PAGE_SIZES,
  type AdminAppointmentsPage,
  type AdminAppointmentsQuery,
  type AppointmentStatus,
  type ApptPeriod,
} from "@/lib/admin-appointments";
import { STATUS_META, formatDateTime } from "./data";

const SEARCH_DEBOUNCE_MS = 300;
const FILTER_STATUSES: AppointmentStatus[] = ["pending", "confirmed"];

/**
 * Scheduled appointments for STAFF/ADMIN/DOCTOR. Role comes from the session
 * (no toggle) — but it only tailors the doctor filter visibility; the SERVER
 * scopes a DOCTOR to their own schedule regardless. Filters/search/pagination
 * are server-side; page/pageSize/q live in the URL.
 */
export function AppointmentsAdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isDoctor = session?.user?.role === "DOCTOR";

  // ── URL state ─────────────────────────────────────────────────────────────
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = (APPT_PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : APPT_DEFAULT_PAGE_SIZE;
  const urlQ = searchParams.get("q") ?? "";

  const hrefFor = (next: { page?: number; pageSize?: number; q?: string }) => {
    const p = next.page ?? page;
    const ps = next.pageSize ?? pageSize;
    const qq = (next.q ?? urlQ).trim();
    const sp = new URLSearchParams();
    if (qq) sp.set("q", qq);
    if (p > 1) sp.set("page", String(p));
    if (ps !== APPT_DEFAULT_PAGE_SIZE) sp.set("pageSize", String(ps));
    const s = sp.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };
  const resetToFirstPage = () => {
    if (page !== 1) router.replace(hrefFor({ page: 1 }));
  };

  // ── Local filters ─────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<ApptPeriod>("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [statuses, setStatuses] = useState<Set<AppointmentStatus>>(
    () => new Set<AppointmentStatus>(FILTER_STATUSES),
  );

  const [query, setQuery] = useState(urlQ);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim() !== urlQ.trim()) router.replace(hrefFor({ q: query, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── Doctor roster for the STAFF/ADMIN filter ──────────────────────────────
  const [doctors, setDoctors] = useState<ApiDoctor[]>([]);
  useEffect(() => {
    if (isDoctor) return;
    let active = true;
    getDoctors()
      .then((d) => {
        if (active) setDoctors(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isDoctor]);

  // ── Data + derived loading (mirrors /admin/patients) ──────────────────────
  const [data, setData] = useState<AdminAppointmentsPage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters: AdminAppointmentsQuery = {
    period,
    from: period === "range" ? dateFrom || null : null,
    to: period === "range" ? dateTo || null : null,
    doctorId: isDoctor ? null : doctorFilter === "all" ? null : doctorFilter,
    statuses: [...statuses].sort(),
    q: urlQ,
  };
  const requestKey = JSON.stringify({ f: filters, page, pageSize, reloadKey });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const req = JSON.parse(requestKey) as {
      f: AdminAppointmentsQuery;
      page: number;
      pageSize: number;
    };
    getAdminAppointments({ ...req.f, page: req.page, pageSize: req.pageSize }, ac.signal)
      .then((d) => {
        // Jumped past the end (stale page after a filter shrank results)?
        if (d.total > 0 && req.page > d.totalPages) {
          const sp = new URLSearchParams();
          if ((req.f.q ?? "").trim()) sp.set("q", (req.f.q ?? "").trim());
          if (d.totalPages > 1) sp.set("page", String(d.totalPages));
          if (req.pageSize !== APPT_DEFAULT_PAGE_SIZE) {
            sp.set("pageSize", String(req.pageSize));
          }
          const s = sp.toString();
          router.replace(`${pathname}${s ? `?${s}` : ""}`);
          return;
        }
        setData(d);
        setLoadedKey(requestKey);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setErrorKey(requestKey);
      });
    return () => ac.abort();
  }, [requestKey, router, pathname]);

  const isError = errorKey === requestKey;
  const isLoading = !isError && loadedKey !== requestKey;
  const reload = () => {
    setErrorKey(null);
    setReloadKey((k) => k + 1);
  };

  // ── Filter handlers (reset to page 1) ─────────────────────────────────────
  const pickPeriod = (p: ApptPeriod) => {
    setPeriod(p);
    resetToFirstPage();
  };
  const toggleStatus = (s: AppointmentStatus) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    resetToFirstPage();
  };
  const pickDoctor = (id: string) => {
    setDoctorFilter(id);
    resetToFirstPage();
  };

  const runAction = async (id: string, action: "confirm" | "reject") => {
    setBusyId(id);
    setActionError(null);
    try {
      if (action === "confirm") await confirmAppointment(id);
      else await rejectAppointment(id);
      setReloadKey((k) => k + 1); // refetch current page
    } catch (err) {
      setActionError(
        err instanceof ShopApiError || (err as { message?: string })?.message
          ? (err as { message: string }).message
          : "Не вдалося оновити запис.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasFilters =
    period !== "today" ||
    doctorFilter !== "all" ||
    statuses.size !== FILTER_STATUSES.length ||
    urlQ.trim() !== "" ||
    !!dateFrom ||
    !!dateTo;

  return (
    <>
      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={period}
            onChange={pickPeriod}
            options={[
              { v: "today", label: "Сьогодні" },
              { v: "week", label: "Тиждень" },
              { v: "future", label: "Усі майбутні" },
              { v: "range", label: "Діапазон" },
            ]}
          />
          {!isLoading && !isError && (
            <p className="text-xs tabular-nums text-navy-400" aria-live="polite">
              Знайдено: {total}
            </p>
          )}
        </div>

        {period === "range" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-navy-400">
              Від
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  resetToFirstPage();
                }}
                aria-label="Дата від"
                className="rounded-lg border border-[color:var(--line-2)] bg-white px-2.5 py-1.5 text-sm text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-navy-400">
              До
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  resetToFirstPage();
                }}
                aria-label="Дата до"
                className="rounded-lg border border-[color:var(--line-2)] bg-white px-2.5 py-1.5 text-sm text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:max-w-[320px]">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук за пацієнтом"
              aria-label="Пошук за пацієнтом"
              className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
            />
          </div>

          {!isDoctor && (
            <label className="flex items-center gap-2 text-xs text-navy-400">
              Лікар
              <select
                value={doctorFilter}
                onChange={(e) => pickDoctor(e.target.value)}
                aria-label="Фільтр за лікарем"
                className="rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-sm text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
              >
                <option value="all">Усі лікарі</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div role="group" aria-label="Фільтр за статусом" className="flex gap-2">
            {FILTER_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statuses.has(s)}
                onClick={() => toggleStatus(s)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                  statuses.has(s)
                    ? "border-navy-900 bg-navy-900 text-white"
                    : "border-[color:var(--line-2)] bg-white text-navy-400 hover:border-navy-900",
                )}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorBanner onRetry={reload} />
      ) : items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon="search"
            title="Нічого не знайдено"
            hint="Жоден запис не відповідає фільтрам. Змініть період, лікаря, статус або пошук."
          />
        ) : (
          <EmptyState
            title="Немає записів"
            hint="На обраний період немає запланованих візитів."
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-[color:var(--line)] bg-white md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--line)] bg-cream/60 text-left text-xs font-medium uppercase tracking-[0.04em] text-navy-400">
                  <th scope="col" className="px-4 py-3">Дата й час</th>
                  <th scope="col" className="px-3 py-3">Пацієнт</th>
                  <th scope="col" className="px-3 py-3">Лікар</th>
                  <th scope="col" className="px-3 py-3">Статус</th>
                  <th scope="col" className="px-3 py-3 text-right">Дії</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-b border-[color:var(--line)] align-top last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-navy-900">
                      {formatDateTime(a.date)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-navy-900">{a.patientName}</div>
                      <div className="text-xs tabular-nums text-navy-400">{a.patientPhone ?? "—"}</div>
                    </td>
                    <td className="px-3 py-3 text-navy-700">
                      {a.doctorName}
                      {a.doctorSpecialty && (
                        <span className="text-navy-400"> · {a.doctorSpecialty}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-3 py-3">
                      <RowActions
                        status={a.status}
                        busy={busyId === a.id}
                        onConfirm={() => runAction(a.id, "confirm")}
                        onReject={() => runAction(a.id, "reject")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((a) => (
              <li key={a.id} className="rounded-xl border border-[color:var(--line)] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium tabular-nums text-navy-900">{formatDateTime(a.date)}</div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="mt-2 text-sm">
                  <div className="font-medium text-navy-900">{a.patientName}</div>
                  <div className="text-xs tabular-nums text-navy-400">{a.patientPhone ?? "—"}</div>
                  <div className="mt-1 text-navy-700">
                    {a.doctorName}
                    {a.doctorSpecialty && (
                      <span className="text-navy-400"> · {a.doctorSpecialty}</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 border-t border-[color:var(--line)] pt-3">
                  <RowActions
                    status={a.status}
                    busy={busyId === a.id}
                    onConfirm={() => runAction(a.id, "confirm")}
                    onReject={() => runAction(a.id, "reject")}
                  />
                </div>
              </li>
            ))}
          </ul>

          <PaginationPanel
            page={page}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={total}
            pageSize={pageSize}
            onPage={(p) => router.push(hrefFor({ page: p }))}
            onPageSize={(s) => router.push(hrefFor({ pageSize: s, page: 1 }))}
          />
        </>
      )}
    </>
  );
}

// ─── Row actions (confirm / reject for pending) ──────────────────────────────

function RowActions({
  status,
  busy,
  onConfirm,
  onReject,
}: {
  status: AppointmentStatus;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  if (status !== "pending") return <span className="text-xs text-navy-400">—</span>;
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="rounded-full bg-mint px-3 py-1.5 text-xs font-medium text-navy-900 transition-colors hover:bg-mint-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50"
      >
        Підтвердити
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className="rounded-full border border-[color:var(--line-2)] px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
      >
        Відхилити
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", m.badge)}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full border border-[color:var(--line-2)] bg-white p-1">
      {options.map(({ v, label }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
            value === v ? "bg-navy-900 text-white" : "text-navy-700 hover:text-navy-900",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Pagination (mirrors /admin/orders) ──────────────────────────────────────

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
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const arrow =
    "grid h-9 w-9 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--line-2)]";
  return (
    <nav aria-label="Пагінація записів" className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-xs tabular-nums text-navy-400">
        {rangeStart}–{rangeEnd} із {total}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="hidden items-center gap-1.5 sm:flex">
          {buildPageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} aria-hidden="true" className="px-1 text-sm text-navy-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-label={`Сторінка ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "h-9 min-w-9 rounded-full px-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
                  p === page ? "bg-navy-900 text-white" : "border border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>
        <span className="px-1 text-sm tabular-nums text-navy-700 sm:hidden">стор. {page} із {totalPages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Наступна сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-navy-400">
        Рядків на сторінці:
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Кількість рядків на сторінці"
          className="rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
        >
          {APPT_PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </nav>
  );
}
