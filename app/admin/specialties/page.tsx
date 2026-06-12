import type { Metadata } from "next";
import { SpecialtiesPanel } from "@/components/admin/specialties/SpecialtiesPanel";

export const metadata: Metadata = {
  title: "Спеціальності — Адмін · SmileClinic",
  description: "Керування спеціальностями лікарів.",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
// STAFF/ADMIN (таб у AdminTabs). ТІЛЬКИ UI на мок-даних — без API/гардів.
export default function Page() {
  return <SpecialtiesPanel />;
}
