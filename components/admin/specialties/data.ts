/**
 * Presentation helpers for the specialty directory (data comes from the API —
 * see lib/specialties + useSpecialties). Display-only constants.
 */

/** Lyric label for the "no specialty" choice in selects and the summary row. */
export const NO_SPECIALTY_LABEL = "Без спеціальності";

/** uk-множина для «лікар» (1 лікар / 2–4 лікарі / 5+ лікарів). */
export function pluralDoctors(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "лікар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "лікарі";
  return "лікарів";
}
