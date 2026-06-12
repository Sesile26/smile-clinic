import { Suspense } from "react";
import type { Metadata } from "next";
import { UsersAdminPage } from "@/components/admin/users/UsersAdminPage";

export const metadata: Metadata = {
  title: "Користувачі — Адмін · SmileClinic",
  description: "Керування користувачами та ролями (демо).",
};

// Chrome (Header/Footer/title/tabs/Container) comes from app/admin/layout.tsx.
// ADMIN-only: tab hidden in AdminTabs, proxy.ts ADMIN_ROUTES guard, and the API
// re-checks role === ADMIN. Reads ?page/?pageSize/?q via useSearchParams → Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <UsersAdminPage />
    </Suspense>
  );
}
