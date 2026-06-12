import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PatientsPage } from "@/components/admin/patients/PatientsPage";

export const metadata: Metadata = {
  title: "Пацієнти — Адмін · SmileClinic",
  description: "Історія записів пацієнтів.",
};

// Access is gated in proxy.ts: STAFF/ADMIN/DOCTOR may open /admin/patients
// (a DOCTOR is re-scoped to their own patients server-side); a PATIENT → home.
// The API re-checks the role independently of this guard.
export default function Page() {
  return (
    <LoginModalProvider>
      <Header />
      <main className="min-h-[60vh] bg-cream/20">
        {/* PatientsPage reads ?page/?pageSize/?q via useSearchParams → Suspense. */}
        <Suspense fallback={null}>
          <PatientsPage />
        </Suspense>
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
