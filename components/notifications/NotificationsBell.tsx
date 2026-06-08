"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useNotifications } from "@/hooks/useNotifications";
import type { ClientNotification } from "@/lib/notifications-client";

/** Compact uk relative time. Client-only (no SSR), so locale is fine. */
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "щойно";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} хв тому`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} дн тому`;
  return new Date(iso).toLocaleDateString("uk-UA");
}

export function NotificationsBell() {
  const router = useRouter();
  const { items, unread, listState, conn, markOneRead, markAllAsRead } =
    useNotifications(true);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Click-outside + Escape close (listeners only while open).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Move focus into the panel on open.
  useEffect(() => {
    if (open) {
      containerRef.current
        ?.querySelector<HTMLElement>("[data-autofocus]")
        ?.focus();
    }
  }, [open]);

  const onItemClick = (n: ClientNotification) => {
    if (!n.isRead) markOneRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Сповіщення, непрочитаних: ${unread}` : "Сповіщення"
        }
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-full text-navy-900 transition-colors duration-200 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-mint px-1 text-[10px] font-semibold tabular-nums text-navy-900 ring-2 ring-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Сповіщення"
          className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[color:var(--line)] bg-white shadow-s2"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
            <h2 className="text-sm font-medium text-navy-900">Сповіщення</h2>
            <button
              type="button"
              data-autofocus
              onClick={markAllAsRead}
              disabled={unread === 0}
              className="rounded-md px-2 py-1 text-xs font-medium text-mint-600 transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:text-navy-400 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
            >
              Прочитати всі
            </button>
          </div>

          {/* Calm reconnect hint — no error flash when offline. */}
          {conn === "reconnecting" && (
            <p className="border-b border-[color:var(--line)] bg-cream/50 px-4 py-1.5 text-[11px] text-navy-400">
              Перепідключення…
            </p>
          )}

          {/* Body */}
          <div className="max-h-[60vh] overflow-y-auto">
            {listState === "loading" ? (
              <SkeletonRows />
            ) : listState === "error" && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-navy-400">
                Не вдалося завантажити сповіщення.
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-navy-400">
                Сповіщень поки немає.
              </p>
            ) : (
              <ul className="flex flex-col">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-[color:var(--line)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-cream focus:bg-cream focus:outline-none",
                        !n.isRead && "bg-mint-100/40",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          n.isRead ? "bg-transparent" : "bg-mint",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm text-navy-900",
                            !n.isRead && "font-medium",
                          )}
                        >
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-navy-400">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-navy-400">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col">
      <span className="sr-only">Завантаження сповіщень…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-[color:var(--line)] px-4 py-3 last:border-b-0"
        >
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bone/70" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-3/4 animate-pulse rounded bg-bone/70" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded bg-bone/50" />
          </span>
        </div>
      ))}
    </div>
  );
}
