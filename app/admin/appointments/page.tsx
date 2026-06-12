import { Suspense } from "react";
import type { Metadata } from "next";
import { AppointmentsAdminPage } from "@/components/admin/appointments/AppointmentsAdminPage";

export const metadata: Metadata = {
  title: "Записи — Адмін · SmileClinic",
  description: "Заплановані записи пацієнтів (демо).",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
// MOCK ONLY — role toggle + data live in the client component; real data, role
// scoping and the proxy guard for DOCTOR are wired during integration.
// Reads ?page/?pageSize/?q via useSearchParams → Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AppointmentsAdminPage />
    </Suspense>
  );
}
