/**
 * Presentation helpers for /admin/users (data comes from the API — see
 * lib/admin-users). Role badge colours in the navy/mint palette; dates from
 * UTC parts so server and client agree.
 */

import type { Linkage, Role } from "@/lib/admin-users";

export type { Role };

export const ROLE_ORDER: Role[] = ["ADMIN", "STAFF", "DOCTOR", "PATIENT"];

export const ROLE_META: Record<Role, { label: string; badge: string }> = {
  ADMIN: { label: "Адмін", badge: "border-navy-900/15 bg-navy-900 text-white" },
  STAFF: { label: "Персонал", badge: "border-blue-300 bg-blue-50 text-blue-800" },
  DOCTOR: { label: "Лікар", badge: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  PATIENT: { label: "Пацієнт", badge: "border-[color:var(--line-2)] bg-cream text-navy-700" },
};

const MONTHS_GEN = [
  "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
];

/** "7 чер 2024" — date only, from an ISO string (UTC parts). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function linkageLabel(l: Linkage): string {
  if (!l) return "—";
  if (l.type === "patient") return `Пацієнт: ${l.name}`;
  return l.specialtyName
    ? `Лікар: ${l.name} · ${l.specialtyName}`
    : `Лікар: ${l.name}`;
}
