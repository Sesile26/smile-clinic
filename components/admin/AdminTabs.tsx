"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/cn";

type Role = "ADMIN" | "STAFF" | "DOCTOR" | "PATIENT";

interface Tab {
  href: string;
  label: string;
  roles: Role[];
}

/**
 * Admin section tabs — ROUTES (<Link>), not local state, so each tab keeps its
 * own URL state (?page&pageSize&q) and deep-links / back work. Tabs are grouped
 * into three visual clusters in the SAME nav row (Клініка / Магазин /
 * Адміністрування); routes are unchanged. Filtering is by session role: a group
 * with no accessible tab (e.g. Магазин/Адміністрування for a DOCTOR) is hidden
 * entirely — label and divider included. The APIs re-check the role anyway.
 */
const GROUPS: { label: string; tabs: Tab[] }[] = [
  {
    label: "Клініка",
    tabs: [
      { href: "/admin/appointments", label: "Записи", roles: ["ADMIN", "STAFF", "DOCTOR"] },
      { href: "/admin/patients", label: "Пацієнти", roles: ["ADMIN", "STAFF", "DOCTOR"] },
    ],
  },
  {
    label: "Магазин",
    tabs: [
      { href: "/admin/orders", label: "Замовлення", roles: ["ADMIN", "STAFF"] },
      { href: "/admin/customers", label: "Покупці", roles: ["ADMIN", "STAFF"] },
      { href: "/admin/products", label: "Товари", roles: ["ADMIN", "STAFF"] },
      { href: "/admin/categories", label: "Категорії", roles: ["ADMIN", "STAFF"] },
    ],
  },
  {
    label: "Адміністрування",
    tabs: [
      { href: "/admin/users", label: "Користувачі", roles: ["ADMIN", "STAFF"] },
      { href: "/admin/specialties", label: "Спеціальності", roles: ["ADMIN", "STAFF"] },
    ],
  },
];

export function AdminTabs() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;

  // Drop tabs the role can't see, then drop now-empty groups (no empty headers).
  const groups = role
    ? GROUPS.map((g) => ({
        ...g,
        tabs: g.tabs.filter((t) => t.roles.includes(role)),
      })).filter((g) => g.tabs.length > 0)
    : [];
  if (groups.length === 0) return null;

  return (
    <nav aria-label="Розділи адмін-панелі" className="mb-6 overflow-x-auto">
      <div className="flex min-w-max border-b border-[color:var(--line)]">
        {groups.map((group, gi) => (
          <Fragment key={group.label}>
            {gi > 0 && (
              <span
                aria-hidden="true"
                className="mx-2 w-px self-stretch bg-[color:var(--line-2)]"
              />
            )}
            <div className="flex flex-col">
              <span className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-navy-300">
                {group.label}
              </span>
              <ul className="flex gap-1">
                {group.tabs.map((t) => {
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
            </div>
          </Fragment>
        ))}
      </div>
    </nav>
  );
}
