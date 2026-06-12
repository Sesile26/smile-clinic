"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/cn";

type Role = "ADMIN" | "STAFF" | "DOCTOR" | "PATIENT";

/**
 * Admin section tabs — these are ROUTES (<Link>), not local state, so each tab
 * keeps its own URL state (?page&pageSize&q) and deep-links / back work. Tabs
 * are filtered by the session role: STAFF/ADMIN see everything; a DOCTOR sees
 * only "Пацієнти".
 */
const TABS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/admin/orders", label: "Замовлення", roles: ["ADMIN", "STAFF"] },
  { href: "/admin/patients", label: "Пацієнти", roles: ["ADMIN", "STAFF", "DOCTOR"] },
  { href: "/admin/appointments", label: "Записи", roles: ["ADMIN", "STAFF", "DOCTOR"] },
  { href: "/admin/products", label: "Товари", roles: ["ADMIN", "STAFF"] },
  { href: "/admin/categories", label: "Категорії", roles: ["ADMIN", "STAFF"] },
  { href: "/admin/users", label: "Користувачі", roles: ["ADMIN"] },
];

export function AdminTabs() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;

  const tabs = role ? TABS.filter((t) => t.roles.includes(role)) : [];
  if (tabs.length === 0) return null;

  return (
    <nav aria-label="Розділи адмін-панелі" className="mb-6 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-[color:var(--line)]">
        {tabs.map((t) => {
          const active =
            pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-mint",
                  active
                    ? "border-mint text-navy-900"
                    : "border-transparent text-navy-400 hover:text-navy-900",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
