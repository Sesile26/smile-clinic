import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { displayM } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AdminTabs } from "@/components/admin/AdminTabs";

/**
 * Shared chrome for the whole /admin/* section: Header/Footer, the page title
 * and the route-based tabs. Each child route (orders / patients / products /
 * categories) renders only its own content — the title, tabs and the Container
 * wrapper live HERE, so the pages no longer duplicate them.
 *
 * Access is enforced in proxy.ts: STAFF/ADMIN for the section, plus DOCTOR for
 * /admin/patients. The tabs themselves are role-filtered (AdminTabs), and the
 * APIs re-check the role independently.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <LoginModalProvider>
      <Header />
      <main className="min-h-[60vh] bg-cream/20">
        <Container className="py-10 sm:py-14">
          <div className="mb-6">
            <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mint-100 px-3 py-1 text-xs font-medium text-mint-600">
              Адмін-панель
            </span>
            <h1 className={cn(displayM, "text-navy-900")}>
              Панель <em className="italic text-mint-600">адміністратора</em>
            </h1>
          </div>
          <AdminTabs />
          {children}
        </Container>
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
