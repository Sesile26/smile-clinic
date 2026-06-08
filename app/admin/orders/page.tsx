import type { Metadata } from "next";
import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { OrdersPage } from "@/components/admin/orders/OrdersPage";

export const metadata: Metadata = {
  title: "Замовлення — Адмін · SmileClinic",
  description: "Перегляд і керування замовленнями магазину (демо).",
};

// Admin orders screen. Access is gated to STAFF/ADMIN in proxy.ts (/admin/*),
// and the /api/admin/orders endpoints re-check the role server-side.
export default function Page() {
  return (
    <LoginModalProvider>
      <Header />
      <main className="min-h-[60vh] bg-cream/20">
        <OrdersPage />
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
