import type { Metadata } from "next";
import { ProductsPage } from "@/components/admin/products/ProductsPage";

export const metadata: Metadata = {
  title: "Товари — Адмін · SmileClinic",
  description: "Керування товарами магазину.",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
export default function Page() {
  return <ProductsPage />;
}
