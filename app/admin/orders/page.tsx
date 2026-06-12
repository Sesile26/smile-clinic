import { Suspense } from "react";
import type { Metadata } from "next";
import { OrdersPage } from "@/components/admin/orders/OrdersPage";

export const metadata: Metadata = {
  title: "Замовлення — Адмін · SmileClinic",
  description: "Перегляд і керування замовленнями магазину.",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
// OrdersPage reads ?page/?pageSize via useSearchParams → Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OrdersPage />
    </Suspense>
  );
}
