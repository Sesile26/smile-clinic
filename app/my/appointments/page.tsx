import type { Metadata } from "next";
import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AppointmentsPage } from "@/components/my/appointments/AppointmentsPage";

export const metadata: Metadata = {
  title: "Мої записи — SmileClinic",
  description: "Майбутні візити та історія відвідувань клініки.",
};

// Access is gated to authenticated users in proxy.ts (/my/*); the API returns
// only the current user's appointments and re-checks the session server-side.
export default function Page() {
  return (
    <LoginModalProvider>
      <Header />
      <main className="min-h-[60vh] bg-cream/20">
        <AppointmentsPage />
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
