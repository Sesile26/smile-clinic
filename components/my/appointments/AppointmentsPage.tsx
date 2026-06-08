"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useMyAppointments } from "@/hooks/useMyAppointments";
import { cancelMyAppointment } from "@/lib/my-appointments";
import { BookingApiError } from "@/lib/booking-client";
import { isUpcoming, type Appointment } from "./data";
import { AppointmentCard } from "./AppointmentCard";
import { CancelModal } from "./CancelModal";
import {
  ErrorBanner,
  OfflineNotice,
  SectionEmpty,
  SkeletonList,
} from "./StatePanels";

export function AppointmentsPage() {
  const { isOnline } = useOnlineStatus();
  const { items, state, reload, source } = useMyAppointments(isOnline);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // `now` is set after mount so the upcoming/past split AND local-time
  // formatting never differ between SSR and the first client render.
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);

  const { upcoming, past } = useMemo(() => {
    if (!now) return { upcoming: [], past: [] };
    const up: Appointment[] = [];
    const pa: Appointment[] = [];
    for (const a of items) (isUpcoming(a, now) ? up : pa).push(a);
    up.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    pa.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { upcoming: up, past: pa };
  }, [items, now]);

  const cancelTarget = items.find((a) => a.id === cancelId) ?? null;

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

  const loading = state === "loading" || now === null;

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

      {!isOnline && (
        <OfflineNotice className="mb-6" />
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {state === "error" && source === "server" ? (
        <ErrorBanner onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-10">
          {/* Upcoming */}
          <section aria-labelledby="upcoming-heading">
            <SectionHeading
              id="upcoming-heading"
              title="На коли я записаний"
              count={loading ? undefined : upcoming.length}
            />
            {loading ? (
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

          {/* Past */}
          <section aria-labelledby="past-heading">
            <SectionHeading
              id="past-heading"
              title="Історія візитів"
              count={loading ? undefined : past.length}
            />
            {loading ? (
              <SkeletonList count={3} />
            ) : past.length === 0 ? (
              <SectionEmpty title="Історія візитів порожня" />
            ) : (
              <div className="flex flex-col gap-3">
                {past.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} variant="past" />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Mounted only while a target is selected (keyed by id). */}
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
