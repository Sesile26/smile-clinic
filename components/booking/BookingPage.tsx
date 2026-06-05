"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { useBookingIdentity, isManager } from "@/hooks/useBooking";
import { ManageView } from "./ManageView";
import { BookingView } from "./BookingView";
import { SkeletonCalendar } from "./StatePanels";

const ROLE_LABEL: Record<string, string> = {
  PATIENT: "Пацієнт",
  DOCTOR: "Лікар",
  STAFF: "Адміністратор",
  ADMIN: "Адміністратор",
};

/**
 * /booking entry point. The view is chosen by the REAL session role (resolved
 * online from Auth.js, offline from the Dexie mirror) — no more mock toggle:
 *   • PATIENT                → booking;
 *   • DOCTOR / STAFF / ADMIN → slot management.
 * proxy.ts already redirects anonymous users to /login.
 */
export function BookingPage() {
  const identity = useBookingIdentity();
  const { isOnline } = useOnlineStatus();

  // Lazy init is safe here: `today` is only read once identity is ready, which
  // never happens during SSR / the first hydration render (session is still
  // "loading" → we render the skeleton), so there's no hydration mismatch.
  const [today] = useState(() => new Date());

  const manager = isManager(identity.role);

  return (
    <Container className="py-10 sm:py-14">
      <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
            Запис онлайн
          </span>
          <h1 className={cn(displayM, "text-navy-900")}>
            {manager ? (
              <>
                Керування <em className="italic text-mint-600">розкладом</em>
              </>
            ) : (
              <>
                Бронювання <em className="italic text-mint-600">візиту</em>
              </>
            )}
          </h1>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
            {manager
              ? "Позначайте робочі слоти у календарі. Пацієнти бачитимуть лише вільні віконця для запису."
              : "Оберіть лікаря та зручний час. Підтвердіть запис у два кліки."}
          </p>
        </div>

        {identity.role && (
          <span
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[color:var(--line-2)] bg-white px-3.5 py-2 text-sm font-medium text-navy-700 lg:self-auto"
            aria-label={`Роль: ${ROLE_LABEL[identity.role] ?? identity.role}`}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-2 w-2 rounded-full",
                isOnline ? "bg-mint" : "bg-yellow-500",
              )}
            />
            {ROLE_LABEL[identity.role] ?? identity.role}
            {!isOnline && <span className="text-navy-400">· офлайн</span>}
          </span>
        )}
      </div>

      {!identity.ready ? (
        <SkeletonCalendar />
      ) : identity.role === null ? (
        <p className="rounded-xl border border-[color:var(--line)] bg-white px-6 py-12 text-center text-sm text-navy-400">
          Потрібен вхід, щоб переглянути цю сторінку.
        </p>
      ) : manager ? (
        <ManageView today={today} identity={identity} online={isOnline} />
      ) : (
        <BookingView today={today} online={isOnline} />
      )}
    </Container>
  );
}
