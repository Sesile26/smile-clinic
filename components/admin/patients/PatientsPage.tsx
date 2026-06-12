"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/cn";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { ShopApiError } from "@/lib/shop-client";
import {
  getAdminPatients,
  getPatientAppointments,
  PATIENTS_DEFAULT_PAGE_SIZE,
  PATIENTS_PAGE_SIZES,
  type AdminPatientAppointment,
  type AdminPatientRow,
  type AdminPatientsPage,
  type AdminPatientsQuery,
  type AppointmentStatus,
} from "@/lib/admin-patients";
import { STATUS_META, STATUS_ORDER, formatDate, formatDateTime } from "./data";
import { EmptyState, ErrorBanner, SkeletonList } from "./StatePanels";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Patients list + per-patient appointment history. Pagination, search and
 * page-size live in the URL (?page&pageSize&q) so refresh / back / sharing work.
 * Role scoping is SERVER-SIDE (a DOCTOR's list/history only ever contains their
 * own patients/records) — the client just renders what the API returns; the
 * session role here only tailors the heading copy.
 */
export function PatientsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isDoctor = session?.user?.role === "DOCTOR";

  // ── URL = source of truth for list state ──────────────────────────────────
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = (PATIENTS_PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : PATIENTS_DEFAULT_PAGE_SIZE;
  const urlQ = searchParams.get("q") ?? "";

  const hrefFor = (next: { page?: number; pageSize?: number; q?: string }) => {
    const p = next.page ?? page;
    const ps = next.pageSize ?? pageSize;
    const qq = (next.q ?? urlQ).trim();
    const sp = new URLSearchParams();
    if (qq) sp.set("q", qq);
    if (p > 1) sp.set("page", String(p));
    if (ps !== PATIENTS_DEFAULT_PAGE_SIZE) sp.set("pageSize", String(ps));
    const s = sp.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };

  // Search input (local) → debounced into the URL, resetting to page 1.
  const [query, setQuery] = useState(urlQ);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim() !== urlQ.trim()) {
        router.replace(hrefFor({ q: query, page: 1 }));
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── Data + derived loading ────────────────────────────────────────────────
  const [data, setData] = useState<AdminPatientsPage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = JSON.stringify({ q: urlQ, page, pageSize, reloadKey });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Selected patient (NOT in the URL — only the list state is shareable).
  const [selected, setSelected] = useState<AdminPatientRow | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const req = JSON.parse(requestKey) as AdminPatientsQuery & {
      page: number;
      pageSize: number;
    };
    getAdminPatients(
      { q: req.q, page: req.page, pageSize: req.pageSize },
      ac.signal,
    )
      .then((d) => {
        if (d.total > 0 && req.page > d.totalPages) {
          const sp = new URLSearchParams();
          if ((req.q ?? "").trim()) sp.set("q", (req.q ?? "").trim());
          if (d.totalPages > 1) sp.set("page", String(d.totalPages));
          if (req.pageSize !== PATIENTS_DEFAULT_PAGE_SIZE) {
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

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasSearch = urlQ.trim() !== "";

  return (
    <Container className="py-10 sm:py-14">
      <div className="mb-6">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
          {isDoctor ? "Лікар · Пацієнти" : "Адмін · Пацієнти"}
        </span>
        <h1 className={cn(displayM, "text-navy-900")}>
          Пацієнти <em className="italic text-mint-600">клініки</em>
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
          {isDoctor
            ? "Ваші пацієнти та історія їхніх візитів до вас."
            : "Усі пацієнти клініки та історія їхніх записів."}
        </p>
      </div>

      {selected ? (
        <PatientDetail
          patient={selected}
          onBack={() => setSelected(null)}
        />
      ) : isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorBanner onRetry={reload} />
      ) : (
        <>
          {/* Search */}
          <div className="mb-5">
            <div className="relative w-full sm:max-w-[360px]">
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
                placeholder="Пошук за імʼям або телефоном"
                aria-label="Пошук пацієнтів"
                className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
              />
            </div>
          </div>

          {items.length === 0 ? (
            hasSearch ? (
              <EmptyState
                icon="search"
                title="Нічого не знайдено"
                hint="Жоден пацієнт не відповідає пошуку. Змініть запит."
              />
            ) : (
              <EmptyState
                title={isDoctor ? "Немає ваших пацієнтів" : "Ще немає пацієнтів"}
                hint={
                  isDoctor
                    ? "Тут зʼявляться пацієнти, які матимуть запис до вас."
                    : "Пацієнти зʼявляться тут після перших записів."
                }
              />
            )
          ) : (
            <>
              <p className="mb-2 text-xs tabular-nums text-navy-400" aria-live="polite">
                Знайдено: {total}
              </p>
              <PatientsTable patients={items} onOpen={setSelected} />
              <PatientsCards patients={items} onOpen={setSelected} />
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
      )}
    </Container>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        m.badge,
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

// ─── List: desktop table ──────────────────────────────────────────────────────

interface ListProps {
  patients: AdminPatientRow[];
  onOpen: (p: AdminPatientRow) => void;
}

function PatientsTable({ patients, onOpen }: ListProps) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[color:var(--line)] bg-white md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--line)] bg-cream/60 text-left text-xs font-medium uppercase tracking-[0.04em] text-navy-400">
            <th scope="col" className="px-4 py-3">Пацієнт</th>
            <th scope="col" className="px-3 py-3">Телефон</th>
            <th scope="col" className="px-3 py-3">Email</th>
            <th scope="col" className="px-3 py-3 text-center">Записів</th>
            <th scope="col" className="px-3 py-3">Останній візит</th>
            <th scope="col" className="w-10 px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr
              key={p.id}
              className="border-b border-[color:var(--line)] transition-colors last:border-b-0 hover:bg-cream/40"
            >
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onOpen(p)}
                  className="text-left font-medium text-navy-900 underline-offset-2 hover:text-mint-600 hover:underline focus:rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                >
                  {p.name}
                </button>
              </td>
              <td className="whitespace-nowrap px-3 py-3 tabular-nums text-navy-700">
                {p.phone ?? "—"}
              </td>
              <td className="px-3 py-3 text-navy-400">{p.email ?? "—"}</td>
              <td className="px-3 py-3 text-center tabular-nums text-navy-700">
                {p.appointmentCount}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-navy-700">
                {p.lastVisitAt ? formatDate(p.lastVisitAt) : "—"}
              </td>
              <td className="px-2 py-3">
                <button
                  type="button"
                  onClick={() => onOpen(p)}
                  aria-label={`Відкрити історію: ${p.name}`}
                  className="grid h-8 w-8 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── List: mobile cards ───────────────────────────────────────────────────────

function PatientsCards({ patients, onOpen }: ListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {patients.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p)}
            className="w-full rounded-xl border border-[color:var(--line)] bg-white p-4 text-left transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-navy-900">{p.name}</span>
              <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-xs tabular-nums text-navy-700">
                {p.appointmentCount} зап.
              </span>
            </div>
            <div className="mt-1 text-xs tabular-nums text-navy-400">
              {p.phone ?? "—"}
            </div>
            <div className="text-xs text-navy-400">{p.email ?? "—"}</div>
            <div className="mt-2 text-xs text-navy-700">
              Останній візит:{" "}
              <span className="font-medium">
                {p.lastVisitAt ? formatDate(p.lastVisitAt) : "—"}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Detail: one patient's appointment history ───────────────────────────────

function PatientDetail({
  patient,
  onBack,
}: {
  patient: AdminPatientRow;
  onBack: () => void;
}) {
  const [appts, setAppts] = useState<AdminPatientAppointment[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  // Captured once on mount (client-only) → future/past split has a stable
  // reference and no SSR hydration mismatch (the detail only renders on click).
  const [now] = useState(() => Date.now());

  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [timeFilter, setTimeFilter] = useState<"all" | "future" | "past">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    getPatientAppointments(patient.id, ac.signal)
      .then((rows) => {
        setAppts(rows);
        setState("ready");
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setState(
          err instanceof ShopApiError && err.status === 404 ? "error" : "error",
        );
      });
    return () => ac.abort();
  }, [patient.id, reloadKey]);

  const fromTs = dateFrom ? Date.parse(`${dateFrom}T00:00:00.000Z`) : null;
  const toTs = dateTo ? Date.parse(`${dateTo}T23:59:59.999Z`) : null;

  const filtered = useMemo(() => {
    return (appts ?? []).filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      const ts = new Date(a.date).getTime();
      if (timeFilter === "future" && ts < now) return false;
      if (timeFilter === "past" && ts >= now) return false;
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      return true;
    });
  }, [appts, statusFilter, timeFilter, fromTs, toTs, now]);

  const future = filtered.filter((a) => new Date(a.date).getTime() >= now);
  const past = filtered.filter((a) => new Date(a.date).getTime() < now);
  const showGroups = timeFilter === "all";

  const hasActiveFilters =
    statusFilter !== "all" || timeFilter !== "all" || !!dateFrom || !!dateTo;
  const resetFilters = () => {
    setStatusFilter("all");
    setTimeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        До списку
      </button>

      <div className="mb-5 rounded-xl border border-[color:var(--line)] bg-white p-5">
        <h2 className="font-serif text-[24px] leading-tight tracking-[-0.01em] text-navy-900">
          {patient.name}
        </h2>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-navy-400">
          <span className="tabular-nums">{patient.phone ?? "—"}</span>
          <span>{patient.email ?? "—"}</span>
          <span>Записів: {patient.appointmentCount}</span>
        </div>
      </div>

      {state === "loading" ? (
        <SkeletonList rows={4} />
      ) : state === "error" ? (
        <ErrorBanner onRetry={() => { setState("loading"); setReloadKey((k) => k + 1); }} />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={timeFilter}
                onChange={setTimeFilter}
                options={[
                  { v: "all", label: "Усі" },
                  { v: "future", label: "Майбутні" },
                  { v: "past", label: "Минулі" },
                ]}
              />
              <span className="hidden h-5 w-px bg-[color:var(--line-2)] sm:block" />
              <label className="flex items-center gap-2 text-xs text-navy-400">
                Від
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
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
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="Дата до"
                  className="rounded-lg border border-[color:var(--line-2)] bg-white px-2.5 py-1.5 text-sm text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
                />
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-full border border-[color:var(--line-2)] bg-white px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
                >
                  Скинути
                </button>
              )}
            </div>

            <div role="group" aria-label="Фільтр за статусом" className="flex flex-wrap gap-2">
              <StatusChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="Усі статуси" />
              {STATUS_ORDER.map((s) => (
                <StatusChip
                  key={s}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  label={STATUS_META[s].label}
                />
              ))}
            </div>
          </div>

          {/* Timeline */}
          {filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title={
                (appts ?? []).length === 0
                  ? "Немає записів"
                  : "Немає записів за фільтрами"
              }
              hint={
                (appts ?? []).length === 0
                  ? "У цього пацієнта поки немає історії записів."
                  : "Жоден запис не відповідає обраним умовам. Змініть фільтри."
              }
            />
          ) : showGroups ? (
            <div className="flex flex-col gap-6">
              {future.length > 0 && <TimelineGroup title="Майбутні" items={future} />}
              {past.length > 0 && <TimelineGroup title="Минулі" items={past} />}
            </div>
          ) : (
            <TimelineList items={filtered} />
          )}
        </>
      )}
    </div>
  );
}

function TimelineGroup({
  title,
  items,
}: {
  title: string;
  items: AdminPatientAppointment[];
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-navy-400">
        {title} · {items.length}
      </h3>
      <TimelineList items={items} />
    </section>
  );
}

function TimelineList({ items }: { items: AdminPatientAppointment[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((a) => (
        <li
          key={a.id}
          className="rounded-xl border border-[color:var(--line)] bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium tabular-nums text-navy-900">
                {formatDateTime(a.date)}
              </div>
              <div className="mt-0.5 text-sm text-navy-700">
                {a.doctorName}
                <span className="text-navy-400"> · {a.doctorSpecialty}</span>
              </div>
            </div>
            <StatusBadge status={a.status} />
          </div>
          {a.notes && (
            <p className="mt-3 rounded-lg bg-cream/50 px-3 py-2 text-sm text-navy-700">
              {a.notes}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Small shared controls ────────────────────────────────────────────────────

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

function StatusChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        active
          ? "border-navy-900 bg-navy-900 text-white"
          : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
      )}
    >
      {label}
    </button>
  );
}

// ─── Pagination (mirrors /admin/orders) ──────────────────────────────────────

function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
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
    <nav
      aria-label="Пагінація пацієнтів"
      className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-xs tabular-nums text-navy-400">
        {rangeStart}–{rangeEnd} із {total}
      </p>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
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
                  p === page
                    ? "bg-navy-900 text-white"
                    : "border border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <span className="px-1 text-sm tabular-nums text-navy-700 sm:hidden">
          стор. {page} із {totalPages}
        </span>

        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Наступна сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
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
          {PATIENTS_PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </nav>
  );
}
