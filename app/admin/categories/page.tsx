import type { Metadata } from "next";
import { CategoriesPanel } from "@/components/admin/categories/CategoriesPanel";

export const metadata: Metadata = {
  title: "Категорії — Адмін · SmileClinic",
  description: "Керування категоріями товарів.",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
export default function Page() {
  return <CategoriesPanel />;
}
