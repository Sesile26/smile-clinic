/**
 * Small presentational helpers for the /shop UI.
 *
 * The product catalog and Nova Poshta cities/warehouses now come from the
 * server (see hooks/useShop + lib/shop-client). What stays here is purely
 * static UI helpers: suggested categories for the admin form, the clinic
 * pickup address, money formatting, and the phone check.
 */

/** Suggested categories for the admin product form (free-text in the DB). */
export const CATEGORIES = [
  "Догляд",
  "Відбілювання",
  "Дитячі",
  "Аксесуари",
] as const;

export const CLINIC_ADDRESS = "вул. Хорива, 24, Київ · Пн–Сб 8:00–22:00";

/** Format an integer UAH amount as "1 499 ₴" (uk grouping). */
export function formatUAH(amount: number): string {
  return `${Math.round(amount).toLocaleString("uk-UA")} ₴`;
}

/** Canonical UA phone check (matches schemas/register + the server). */
export function isValidUaPhone(value: string): boolean {
  return /^\+380\d{9}$/.test(value.replace(/\s/g, ""));
}
