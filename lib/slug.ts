/**
 * Slugify a Ukrainian name into an ASCII URL slug (e.g. "Зубні щітки" →
 * "zubni-shchitky"). Used by the seed (to generate Category.slug) and the
 * offline catalog filter; the migration backfills the same values, so all
 * three agree. No React / Node built-ins — safe anywhere.
 */

const UK: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
  з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’ʼ`]/g, "") // drop apostrophes (мʼякий знак тощо)
    .split("")
    .map((ch) => UK[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
