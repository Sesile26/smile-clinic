import { Suspense } from "react";
import type { Metadata } from "next";
import { PatientsPage } from "@/components/admin/patients/PatientsPage";

export const metadata: Metadata = {
  title: "Пацієнти — Адмін · SmileClinic",
  description: "Історія записів пацієнтів.",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
// PatientsPage reads ?page/?pageSize/?q via useSearchParams → Suspense.
// Access: proxy.ts allows STAFF/ADMIN/DOCTOR here (a DOCTOR is re-scoped to
// their own patients server-side); a PATIENT → home.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PatientsPage />
    </Suspense>
  );
}
