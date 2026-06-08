"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { formatUAH } from "@/components/shop/data";
import {
  getAdminOrders,
  updateOrderStatus,
  type AdminOrder,
  type AdminOrderStatus,
} from "@/lib/admin-orders";
import { ShopApiError } from "@/lib/shop-client";
import {
  STATUS_META,
  STATUS_ORDER,
  deliveryLabel,
  formatDateTime,
} from "./data";
import { EmptyState, ErrorBanner, SkeletonList } from "./StatePanels";

type LoadState = "loading" | "ready" | "error";

export function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState<AdminOrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch the order list. No synchronous setState in the effect body (avoids the
  // set-state-in-effect cascade); updates land in the async callbacks.
  useEffect(() => {
    const ac = new AbortController();
    getAdminOrders(ac.signal)
      .then((data) => {
        setOrders(data);
        setState("ready");
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setState("error");
      });
    return () => ac.abort();
  }, [reloadKey]);

  const reload = () => {
    setState("loading");
    setReloadKey((k) => k + 1);
  };

  const digits = (s: string) => s.replace(/\D/g, "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = digits(query);
    const list = orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      const byName = o.contactName.toLowerCase().includes(q);
      const byPhone = qDigits.length > 0 && digits(o.contactPhone).includes(qDigits);
      const byNumber = o.number.toLowerCase().includes(q);
      return byName || byPhone || byNumber;
    });
    // Newest first (server already orders desc; keep stable on the client too).
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orders, statusFilter, query]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changeStatus = async (id: string, status: AdminOrderStatus) => {
    setBusyId(id);
    setActionError(null);
    try {
      const updated = await updateOrderStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setActionError(
        err instanceof ShopApiError
          ? err.message
          : "Не вдалося оновити статус.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: orders.length };
    for (const s of STATUS_ORDER) m[s] = orders.filter((o) => o.status === s).length;
    return m;
  }, [orders]);

  return (
    <Container className="py-10 sm:py-14">
      {/* Header */}
      <div className="mb-6">
        <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
          Адмін · Магазин
        </span>
        <h1 className={cn(displayM, "text-navy-900")}>
          Замовлення <em className="italic text-mint-600">магазину</em>
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
          Перегляд і керування замовленнями магазину.
        </p>
      </div>

      {/* Toolbar: search + status filter */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-[360px]">
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
            placeholder="Пошук за імʼям, телефоном або №"
            aria-label="Пошук замовлень"
            className="w-full rounded-full border border-[color:var(--line-2)] bg-white py-2.5 pl-10 pr-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]"
          />
        </div>

        <div role="group" aria-label="Фільтр за статусом" className="flex flex-wrap gap-2">
          <FilterChip
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="Усі"
            count={counts.all}
          />
          {STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              label={STATUS_META[s].label}
              count={counts[s]}
            />
          ))}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {/* Content */}
      {state === "loading" ? (
        <SkeletonList />
      ) : state === "error" ? (
        <ErrorBanner onRetry={reload} />
      ) : orders.length === 0 ? (
        <EmptyState hint="Замовлення зʼявляться тут, щойно покупці оформлять їх у магазині." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Нічого не знайдено"
          hint="Спробуйте змінити пошук або фільтр статусу."
        />
      ) : (
        <>
          <DesktopTable
            orders={filtered}
            expanded={expanded}
            busyId={busyId}
            onToggle={toggle}
            onStatus={changeStatus}
          />
          <MobileCards
            orders={filtered}
            expanded={expanded}
            busyId={busyId}
            onToggle={toggle}
            onStatus={changeStatus}
          />
        </>
      )}
    </Container>
  );
}

// ─── Toolbar bits ────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        active
          ? "border-navy-900 bg-navy-900 text-white"
          : "border-[color:var(--line-2)] bg-white text-navy-700 hover:border-navy-900",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          active ? "bg-white/20 text-white" : "bg-cream text-navy-400",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AdminOrderStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        m.badge,
      )}
    >
      {m.label}
    </span>
  );
}

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: AdminOrderStatus;
  onChange: (s: AdminOrderStatus) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Змінити статус замовлення</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AdminOrderStatus)}
        aria-label="Статус замовлення"
        className="rounded-lg border border-[color:var(--line-2)] bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-navy-900 outline-none transition-[border,box-shadow] focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)] disabled:opacity-50"
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function OrderDetails({ order }: { order: AdminOrder }) {
  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-cream/40 p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-navy-400">
        Склад замовлення
      </h3>
      <ul className="flex flex-col divide-y divide-[color:var(--line)]">
        {order.items.map((it, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-navy-700">
              {it.name}{" "}
              <span className="text-navy-400">
                × {it.quantity} · {formatUAH(it.price)}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-navy-900">
              {formatUAH(it.price * it.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
        <span className="text-navy-400">Разом</span>
        <span className="text-base font-medium tabular-nums text-navy-900">
          {formatUAH(order.total)}
        </span>
      </div>
      <p className="mt-2 text-xs text-navy-400">{deliveryLabel(order)}</p>
    </div>
  );
}

function ExpandToggle({
  expanded,
  onClick,
  controls,
  label,
}: {
  expanded: boolean;
  onClick: () => void;
  controls: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={expanded ? `Згорнути ${label}` : `Розгорнути ${label}`}
      className="grid h-8 w-8 place-items-center rounded-full text-navy-700 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn("transition-transform", expanded && "rotate-180")}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

interface ListProps {
  orders: AdminOrder[];
  expanded: Set<string>;
  busyId: string | null;
  onToggle: (id: string) => void;
  onStatus: (id: string, s: AdminOrderStatus) => void;
}

// ─── Desktop table ───────────────────────────────────────────────────────────

function DesktopTable({ orders, expanded, busyId, onToggle, onStatus }: ListProps) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[color:var(--line)] bg-white md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--line)] bg-cream/60 text-left text-xs font-medium uppercase tracking-[0.04em] text-navy-400">
            <th scope="col" className="w-10 px-2 py-3" />
            <th scope="col" className="px-3 py-3">№</th>
            <th scope="col" className="px-3 py-3">Дата</th>
            <th scope="col" className="px-3 py-3">Покупець</th>
            <th scope="col" className="px-3 py-3">Доставка</th>
            <th scope="col" className="px-3 py-3 text-right">Сума</th>
            <th scope="col" className="px-3 py-3">Статус</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const isOpen = expanded.has(o.id);
            const panelId = `order-${o.id}-details`;
            return (
              <Fragment key={o.id}>
                <tr className="border-b border-[color:var(--line)] align-top last:border-b-0">
                  <td className="px-2 py-3">
                    <ExpandToggle
                      expanded={isOpen}
                      onClick={() => onToggle(o.id)}
                      controls={panelId}
                      label={`замовлення ${o.number}`}
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-navy-900">{o.number}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-navy-700">
                    {formatDateTime(o.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-navy-900">{o.contactName}</div>
                    <div className="text-xs tabular-nums text-navy-400">
                      {o.contactPhone}
                    </div>
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-navy-700">
                    <span className="line-clamp-2">{deliveryLabel(o)}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-navy-900">
                    {formatUAH(o.total)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusSelect
                      value={o.status}
                      disabled={busyId === o.id}
                      onChange={(s) => onStatus(o.id, s)}
                    />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-[color:var(--line)] last:border-b-0">
                    <td colSpan={7} className="px-3 pb-4 pt-0">
                      <div id={panelId}>
                        <OrderDetails order={o} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mobile cards ────────────────────────────────────────────────────────────

function MobileCards({ orders, expanded, busyId, onToggle, onStatus }: ListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {orders.map((o) => {
        const isOpen = expanded.has(o.id);
        const panelId = `order-m-${o.id}-details`;
        return (
          <li
            key={o.id}
            className="rounded-xl border border-[color:var(--line)] bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-navy-900">{o.number}</div>
                <div className="text-xs text-navy-400">
                  {formatDateTime(o.createdAt)}
                </div>
              </div>
              <StatusBadge status={o.status} />
            </div>

            <div className="mt-3 text-sm">
              <div className="font-medium text-navy-900">{o.contactName}</div>
              <div className="text-xs tabular-nums text-navy-400">
                {o.contactPhone}
              </div>
              <div className="mt-1 text-navy-700">{deliveryLabel(o)}</div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-base font-medium tabular-nums text-navy-900">
                {formatUAH(o.total)}
              </span>
              <ExpandToggle
                expanded={isOpen}
                onClick={() => onToggle(o.id)}
                controls={panelId}
                label={`замовлення ${o.number}`}
              />
            </div>

            {isOpen && (
              <div id={panelId} className="mt-3">
                <OrderDetails order={o} />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--line)] pt-3">
              <span className="text-xs text-navy-400">Статус:</span>
              <StatusSelect
                value={o.status}
                disabled={busyId === o.id}
                onChange={(s) => onStatus(o.id, s)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
