import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductsPage } from "@/components/admin/products/ProductsPage";

export const metadata: Metadata = {
  title: "Товари — Адмін · SmileClinic",
  description: "Керування товарами магазину.",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
// ProductsPage reads ?page/?pageSize/?category/?q via useSearchParams → Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProductsPage />
    </Suspense>
  );
}
