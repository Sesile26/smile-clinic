import { Suspense } from "react";
import type { Metadata } from "next";
import { CustomersPage } from "@/components/admin/customers/CustomersPage";

export const metadata: Metadata = {
  title: "Покупці — Адмін · SmileClinic",
  description: "Покупці магазину та їхня історія покупок.",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
// CustomersPage reads ?page/?pageSize/?q/?customer via useSearchParams → Suspense.
// Access: STAFF/ADMIN (the generic /admin guard in proxy.ts; a DOCTOR is bounced).
// MOCK DATA — frontend only.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CustomersPage />
    </Suspense>
  );
}
