"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { btnBase, btnGhost, btnMint } from "@/lib/buttons";
import { IcoClose } from "@/components/icons";
import { SkeletonList, EmptyState, ErrorBanner } from "@/components/admin/patients/StatePanels";
import { ShopApiError } from "@/lib/shop-client";
import {
  getAdminUsers,
  changeUserRole,
  getUnlinkedDoctors,
  updateDoctorSpecialty,
  USERS_DEFAULT_PAGE_SIZE,
  USERS_PAGE_SIZES,
  type AdminUser,
  type AdminUsersPage,
  type AdminUsersQuery,
  type ChangeRoleInput,
  type Linkage,
  type Role,
  type UnlinkedDoctor,
} from "@/lib/admin-users";
import { ROLE_META, ROLE_ORDER, formatDate, linkageLabel } from "./data";
import { SpecialtySelect } from "@/components/admin/specialties/SpecialtySelect";
import { NO_SPECIALTY_LABEL } from "@/components/admin/specialties/data";
import { getSpecialties, type ApiSpecialty } from "@/lib/specialties";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * User & role management — ADMIN only (tab hidden + proxy guard + API check).
 * Real data from /api/admin/users; the API enforces every rule (own-role,
 * last-admin, doctor link/unlink) — the UI just reflects results and surfaces
 * server errors. The signed-in admin's own row is locked.
 */
export function UsersAdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const selfId = session?.user?.id ?? null;

  // ── URL state ─────────────────────────────────────────────────────────────
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = (USERS_PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : USERS_DEFAULT_PAGE_SIZE;
  const urlQ = searchParams.get("q") ?? "";

  const hrefFor = (next: { page?: number; pageSize?: number; q?: string }) => {
    const p = next.page ?? page;
    const ps = next.pageSize ?? pageSize;
    const qq = (next.q ?? urlQ).trim();
    const sp = new URLSearchParams();
    if (qq) sp.set("q", qq);
    if (p > 1) sp.set("page", String(p));
    if (ps !== USERS_DEFAULT_PAGE_SIZE) sp.set("pageSize", String(ps));
    const s = sp.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };
  const resetToFirstPage = () => {
    if (page !== 1) router.replace(hrefFor({ page: 1 }));
  };

  const [query, setQuery] = useState(urlQ);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim() !== urlQ.trim()) router.replace(hrefFor({ q: query, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  // ── Data + derived loading ────────────────────────────────────────────────
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<{ user: AdminUser; to: Role } | null>(null);

  const filters: AdminUsersQuery = {
    q: urlQ,
    role: roleFilter === "all" ? null : roleFilter,
  };
  const requestKey = JSON.stringify({ f: filters, page, pageSize, reloadKey });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const req = JSON.parse(requestKey) as {
      f: AdminUsersQuery;
      page: number;
      pageSize: number;
    };
    getAdminUsers({ ...req.f, page: req.page, pageSize: req.pageSize }, ac.signal)
      .then((d) => {
        if (d.total > 0 && req.page > d.totalPages) {
          const sp = new URLSearchParams();
          if ((req.f.q ?? "").trim()) sp.set("q", (req.f.q ?? "").trim());
          if (d.totalPages > 1) sp.set("page", String(d.totalPages));
          if (req.pageSize !== USERS_DEFAULT_PAGE_SIZE) sp.set("pageSize", String(req.pageSize));
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

  const onRoleChanged = useCallback((updated: AdminUser) => {
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((u) => (u.id === updated.id ? updated : u)) } : prev,
    );
    setPending(null);
  }, []);

  // Specialty directory — loaded once, shared by every DOCTOR row select AND the
  // role-grant modal (no per-row / per-modal refetch).
  const [specialties, setSpecialties] = useState<ApiSpecialty[] | null>(null);
  useEffect(() => {
    let active = true;
    getSpecialties()
      .then((s) => active && setSpecialties(s))
      .catch(() => active && setSpecialties([]));
    return () => {
      active = false;
    };
  }, []);

  // Transient error toast (specialty save) — auto-dismiss.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Patch a doctor row's specialty in place after a successful save.
  const onSpecialtyChanged = useCallback(
    (userId: string, specialtyId: string | null, specialtyName: string | null) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((u) =>
                u.id === userId && u.linkage?.type === "doctor"
                  ? { ...u, linkage: { ...u.linkage, specialtyId, specialtyName } }
                  : u,
              ),
            }
          : prev,
      );
    },
    [],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasFilters = roleFilter !== "all" || urlQ.trim() !== "";

  return (
    <>
      {/* Toolbar */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-[320px]">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук за імʼям або email"
              aria-label="Пошук користувачів"
              className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
            />
          </div>
          {!isLoading && !isError && (
            <p className="text-xs tabular-nums text-navy-400" aria-live="polite">Знайдено: {total}</p>
          )}
        </div>

        <div role="group" aria-label="Фільтр за роллю" className="flex flex-wrap gap-2">
          <RoleChip active={roleFilter === "all"} onClick={() => { setRoleFilter("all"); resetToFirstPage(); }} label="Усі ролі" />
          {ROLE_ORDER.map((r) => (
            <RoleChip key={r} active={roleFilter === r} onClick={() => { setRoleFilter(r); resetToFirstPage(); }} label={ROLE_META[r].label} />
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorBanner onRetry={reload} />
      ) : total === 0 ? (
        hasFilters ? (
          <EmptyState icon="search" title="Нічого не знайдено" hint="Жоден користувач не відповідає пошуку чи фільтру." />
        ) : (
          <EmptyState title="Немає користувачів" hint="Користувачі зʼявляться тут після реєстрації." />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-[color:var(--line)] bg-white md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--line)] bg-cream/60 text-left text-xs font-medium uppercase tracking-[0.04em] text-navy-400">
                  <th scope="col" className="px-4 py-3">Користувач</th>
                  <th scope="col" className="px-3 py-3">Email</th>
                  <th scope="col" className="px-3 py-3">Реєстрація</th>
                  <th scope="col" className="px-3 py-3">Привʼязка</th>
                  <th scope="col" className="px-3 py-3">Роль</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => {
                  const isSelf = u.id === selfId;
                  return (
                    <tr key={u.id} className="border-b border-[color:var(--line)] align-top last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.name ?? u.email ?? "?"} />
                          <span className="font-medium text-navy-900">
                            {u.name ?? "—"}
                            {isSelf && <span className="ml-1.5 text-xs font-normal text-navy-400">(ви)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-navy-400">{u.email ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-navy-700">{formatDate(u.createdAt)}</td>
                      <td className="px-3 py-3 text-navy-700">
                        <LinkageCell user={u} specialties={specialties} onChanged={onSpecialtyChanged} onError={setToast} />
                      </td>
                      <td className="px-3 py-3">
                        <RoleSelect user={u} isSelf={isSelf} onPick={(to) => setPending({ user: u, to })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((u) => {
              const isSelf = u.id === selfId;
              return (
                <li key={u.id} className="rounded-xl border border-[color:var(--line)] bg-white p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name ?? u.email ?? "?"} />
                    <div className="min-w-0">
                      <div className="font-medium text-navy-900">
                        {u.name ?? "—"}
                        {isSelf && <span className="ml-1.5 text-xs font-normal text-navy-400">(ви)</span>}
                      </div>
                      <div className="truncate text-xs text-navy-400">{u.email ?? "—"}</div>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-navy-400">Реєстрація</dt><dd className="text-navy-700">{formatDate(u.createdAt)}</dd></div>
                    <div><dt className="text-navy-400">Привʼязка</dt><dd className="text-navy-700"><LinkageCell user={u} specialties={specialties} onChanged={onSpecialtyChanged} onError={setToast} /></dd></div>
                  </dl>
                  <div className="mt-3 border-t border-[color:var(--line)] pt-3">
                    <RoleSelect user={u} isSelf={isSelf} onPick={(to) => setPending({ user: u, to })} />
                  </div>
                </li>
              );
            })}
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

      {pending && (
        <RoleChangeModal
          user={pending.user}
          to={pending.to}
          specialties={specialties}
          onCancel={() => setPending(null)}
          onDone={onRoleChanged}
        />
      )}

      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-5 left-1/2 z-[120] -translate-x-1/2 rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  );
}

// ─── Linkage / specialty cell ─────────────────────────────────────────────────

function LinkageCell({
  user,
  specialties,
  onChanged,
  onError,
}: {
  user: AdminUser;
  specialties: ApiSpecialty[] | null;
  onChanged: (userId: string, specialtyId: string | null, specialtyName: string | null) => void;
  onError: (message: string) => void;
}) {
  const l: Linkage = user.linkage;
  if (l?.type !== "doctor") return <>{linkageLabel(l)}</>;
  return (
    <div className="flex flex-col gap-1.5">
      <span>
        Лікар: <span className="font-medium text-navy-900">{l.name}</span>
      </span>
      <DoctorSpecialtyCell
        doctorId={l.id}
        currentId={l.specialtyId}
        currentName={l.specialtyName}
        specialties={specialties}
        onChanged={(specialtyId, specialtyName) => onChanged(user.id, specialtyId, specialtyName)}
        onError={onError}
      />
    </div>
  );
}

function DoctorSpecialtyCell({
  doctorId,
  currentId,
  currentName,
  specialties,
  onChanged,
  onError,
}: {
  doctorId: string;
  currentId: string | null;
  currentName: string | null;
  specialties: ApiSpecialty[] | null;
  onChanged: (specialtyId: string | null, specialtyName: string | null) => void;
  onError: (message: string) => void;
}) {
  // undefined = idle (show currentId); otherwise an optimistic in-flight value.
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // While the directory is still loading, show static text (no blank select).
  if (specialties === null) {
    return <span className="text-xs text-navy-400">{currentName ?? NO_SPECIALTY_LABEL}</span>;
  }

  const value = pending !== undefined ? pending : currentId;

  const handle = async (next: string | null) => {
    if (next === currentId) return;
    setPending(next);
    setSaving(true);
    try {
      const updated = await updateDoctorSpecialty(doctorId, next);
      onChanged(updated.specialtyId, updated.specialtyName);
      setPending(undefined); // settled; row now carries the new value
    } catch (err) {
      setPending(undefined); // revert the displayed value to currentId
      onError(err instanceof ShopApiError ? err.message : "Не вдалося оновити спеціальність");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SpecialtySelect
      value={value}
      specialties={specialties}
      onChange={handle}
      loading={saving}
      ariaLabel={`Спеціальність лікаря ${currentName ?? ""}`.trim()}
      className="w-full max-w-[220px] rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-xs text-navy-900 outline-none transition-[border,box-shadow] focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

// ─── Row pieces ───────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cream text-xs font-medium text-navy-900">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function RoleSelect({ user, isSelf, onPick }: { user: AdminUser; isSelf: boolean; onPick: (to: Role) => void }) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Роль користувача {user.name ?? user.email}</span>
      <select
        value={user.role}
        disabled={isSelf}
        title={isSelf ? "Не можна змінити власну роль" : undefined}
        onChange={(e) => { const to = e.target.value as Role; if (to !== user.role) onPick(to); }}
        className={cn(
          "rounded-lg border py-1.5 pl-2.5 pr-7 text-xs font-medium outline-none transition-[border,box-shadow] focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)] disabled:cursor-not-allowed disabled:opacity-50",
          ROLE_META[user.role].badge,
        )}
      >
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r} className="bg-white text-navy-900">{ROLE_META[r].label}</option>
        ))}
      </select>
    </label>
  );
}

function RoleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        active ? "border-navy-900 bg-navy-900 text-white" : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
      )}>
      {label}
    </button>
  );
}

// ─── Role-change modal ────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const fieldInput = "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-2.5 px-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";
const fieldLabel = "text-xs font-medium tracking-[0.04em] text-navy-700";
const fieldError = "text-xs text-red-500";

function RoleChangeModal({
  user,
  to,
  specialties,
  onCancel,
  onDone,
}: {
  user: AdminUser;
  to: Role;
  /** Shared specialty directory from the page (null = still loading). */
  specialties: ApiSpecialty[] | null;
  onCancel: () => void;
  onDone: (updated: AdminUser) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const toDoctor = to === "DOCTOR";
  const fromDoctor = user.role === "DOCTOR";

  const [bindMode, setBindMode] = useState<"existing" | "new">("existing");
  const [doctors, setDoctors] = useState<UnlinkedDoctor[] | null>(null);
  const [existingId, setExistingId] = useState<string>("");
  const [newName, setNewName] = useState("");
  // Specialty for a NEW doctor — id from the directory (null = "Без спеціальності").
  const [newSpecialtyId, setNewSpecialtyId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    const t = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 60);
    return () => {
      window.clearTimeout(t);
      unlockBodyScroll();
      prev?.focus?.();
    };
  }, []);

  // Load unlinked doctors + the specialty directory when promoting to DOCTOR.
  useEffect(() => {
    if (!toDoctor) return;
    let active = true;
    getUnlinkedDoctors()
      .then((d) => {
        if (!active) return;
        setDoctors(d);
        if (d.length > 0) setExistingId(d[0].id);
        else setBindMode("new");
      })
      .catch(() => active && setDoctors([]));
    return () => {
      active = false;
    };
  }, [toDoctor]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const list = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onCancel],
  );

  // Спеціальність — з мок-довідника (+ «Без спеціальності» = порожній рядок),
  // тож обовʼязкове лише імʼя лікаря.
  const newValid = newName.trim().length >= 2;
  const canConfirm =
    !busy && (!toDoctor || (bindMode === "existing" ? !!existingId : newValid));

  const handleConfirm = async () => {
    setTouched(true);
    if (!canConfirm) return;
    const input: ChangeRoleInput = { role: to };
    if (toDoctor) {
      if (bindMode === "existing") input.doctorId = existingId;
      else input.newDoctor = { name: newName.trim(), specialtyId: newSpecialtyId || null };
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await changeUserRole(user.id, input);
      onDone(updated);
    } catch (err) {
      setError(err instanceof ShopApiError ? err.message : "Не вдалося змінити роль.");
      setBusy(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[110] grid place-items-center bg-[rgba(10,22,40,0.55)] p-5 backdrop-blur-[10px]"
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="roleChangeTitle" className="relative flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl bg-white shadow-s3">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-6 py-4">
          <h2 id="roleChangeTitle" className="font-serif text-[22px] leading-none tracking-[-0.01em] text-navy-900">Зміна ролі</h2>
          <button type="button" onClick={onCancel} aria-label="Закрити" className="grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint">
            <IcoClose size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto scrollbar-none px-6 py-5">
          <p className="text-sm text-navy-700">
            Змінити роль <span className="font-medium text-navy-900">{user.email ?? user.name}</span> з{" "}
            <span className="font-medium">{ROLE_META[user.role].label}</span> на{" "}
            <span className="font-medium">{ROLE_META[to].label}</span>?
          </p>

          {toDoctor && (
            <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--line)] bg-cream/40 p-3.5">
              <span className={fieldLabel}>Привʼязати до лікаря</span>
              <div className="flex gap-2">
                <ModeBtn active={bindMode === "existing"} onClick={() => setBindMode("existing")} label="Наявний лікар" />
                <ModeBtn active={bindMode === "new"} onClick={() => setBindMode("new")} label="Створити лікаря" />
              </div>

              {bindMode === "existing" ? (
                doctors === null ? (
                  <p className="text-xs text-navy-400">Завантаження лікарів…</p>
                ) : doctors.length > 0 ? (
                  <select data-autofocus value={existingId} onChange={(e) => setExistingId(e.target.value)} aria-label="Лікар без акаунта" className={fieldInput}>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.specialtyName ? `${d.name} · ${d.specialtyName}` : d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-navy-400">Немає вільних лікарів — створіть нового.</p>
                )
              ) : (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="doc-name" className={fieldLabel}>Імʼя лікаря</label>
                    <input id="doc-name" data-autofocus type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Напр. Олена Коваль" className={fieldInput} aria-invalid={touched && newName.trim().length < 2} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="doc-spec" className={fieldLabel}>Спеціальність</label>
                    <SpecialtySelect
                      id="doc-spec"
                      value={newSpecialtyId}
                      specialties={specialties}
                      onChange={setNewSpecialtyId}
                      className={fieldInput}
                    />
                  </div>
                  {touched && !newValid && <span className={fieldError}>Вкажіть імʼя лікаря (мін. 2 символи).</span>}
                </div>
              )}
            </div>
          )}

          {fromDoctor && !toDoctor && (
            <div role="note" className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <span aria-hidden="true" className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <span>
                Акаунт буде відвʼязано від лікаря{" "}
                <span className="font-medium">{user.linkage?.type === "doctor" ? user.linkage.name : "—"}</span>
                . Запис лікаря та історія візитів збережуться.
              </span>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-[color:var(--line)] px-6 py-4 sm:flex-row-reverse">
          <button type="button" onClick={handleConfirm} disabled={!canConfirm} className={cn(btnBase, btnMint, "flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50")}>
            {busy ? "Збереження…" : "Змінити роль"}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className={cn(btnBase, btnGhost, "flex-1 justify-center disabled:opacity-50")}>
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn(
        "flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        active ? "border-navy-900 bg-navy-900 text-white" : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
      )}>
      {label}
    </button>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function buildPageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const keep = [...new Set([1, totalPages, current - 1, current, current + 1])].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
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
  const arrow = "grid h-9 w-9 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-navy-700 transition-colors hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[color:var(--line-2)]";
  return (
    <nav aria-label="Пагінація користувачів" className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-xs tabular-nums text-navy-400">{rangeStart}–{rangeEnd} із {total}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Попередня сторінка" className={arrow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="hidden items-center gap-1.5 sm:flex">
          {buildPageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} aria-hidden="true" className="px-1 text-sm text-navy-400">…</span>
            ) : (
              <button key={p} type="button" onClick={() => onPage(p)} aria-label={`Сторінка ${p}`} aria-current={p === page ? "page" : undefined}
                className={cn("h-9 min-w-9 rounded-full px-2 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint", p === page ? "bg-navy-900 text-white" : "border border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900")}>
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
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Кількість рядків на сторінці"
          className="rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-navy-900 outline-none focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]">
          {USERS_PAGE_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </label>
    </nav>
  );
}
