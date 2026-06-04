"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import type { DemoState } from "./data";
import { DemoControls } from "./DemoControls";
import { ManageView } from "./ManageView";
import { BookingView } from "./BookingView";
import { SkeletonCalendar } from "./StatePanels";

type Role = "doctor" | "patient";

/**
 * Top-level /booking client component. Owns the cross-cutting demo state:
 *  - role toggle (doctor ⇄ patient) — stand-in until real roles land;
 *  - demo UI state (ready/loading/empty/error);
 *  - simulated offline.
 * Calendar navigation/selection lives inside each view.
 */
export function BookingPage() {
  const [role, setRole] = useState<Role>("patient");
  const [demoState, setDemoState] = useState<DemoState>("ready");
  const [forceOffline, setForceOffline] = useState(false);

  // `today` is set after mount so SSR and the first client render agree
  // (no hydration mismatch from new Date()); the gap doubles as a loading state.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const { isOnline } = useOnlineStatus();
  const online = isOnline && !forceOffline;

  return (
    <Container className="py-10 sm:py-14">
      {/* Page header */}
      <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
            Запис онлайн
          </span>
          <h1 className={cn(displayM, "text-navy-900")}>
            Бронювання <em className="italic text-mint-600">візиту</em>
          </h1>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.55] text-navy-400">
            Оберіть зручний час до вашого лікаря. Лікарі та адміністратори
            керують слотами, пацієнти бронюють вільні віконця.
          </p>
        </div>

        <RoleToggle role={role} onChange={setRole} />
      </div>

      <DemoControls
        demoState={demoState}
        onDemoState={setDemoState}
        forceOffline={forceOffline}
        onForceOffline={setForceOffline}
        online={isOnline}
      />

      {today === null ? (
        <SkeletonCalendar />
      ) : role === "doctor" ? (
        <ManageView
          today={today}
          demoState={demoState}
          onRetry={() => setDemoState("ready")}
        />
      ) : (
        <BookingView
          today={today}
          demoState={demoState}
          online={online}
          onRetry={() => setDemoState("ready")}
        />
      )}
    </Container>
  );
}

function RoleToggle({
  role,
  onChange,
}: {
  role: Role;
  onChange: (r: Role) => void;
}) {
  const options: { value: Role; label: string }[] = [
    { value: "patient", label: "Я пацієнт" },
    { value: "doctor", label: "Я лікар" },
  ];
  return (
    <div
      role="group"
      aria-label="Режим перегляду"
      className="inline-flex shrink-0 self-start rounded-full bg-cream p-1 lg:self-auto"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={role === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint",
            role === o.value
              ? "bg-navy-900 text-white"
              : "text-navy-400 hover:text-navy-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
