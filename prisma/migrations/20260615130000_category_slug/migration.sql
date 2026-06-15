-- Category.slug для URL-фільтра каталогу (?category=<slug>).
-- Додаємо нульовим, бекфілимо, робимо NOT NULL + UNIQUE — безпечно на наявних даних.

ALTER TABLE "Category" ADD COLUMN "slug" TEXT;

-- Бекфіл відомих демо-категорій (узгоджено з lib/slug.ts slugify).
UPDATE "Category" SET slug = 'zubni-shchitky'    WHERE name = 'Зубні щітки'     AND slug IS NULL;
UPDATE "Category" SET slug = 'pasty'             WHERE name = 'Пасти'           AND slug IS NULL;
UPDATE "Category" SET slug = 'opoliskuvachi'     WHERE name = 'Ополіскувачі'    AND slug IS NULL;
UPDATE "Category" SET slug = 'iryhatory'         WHERE name = 'Іригатори'       AND slug IS NULL;
UPDATE "Category" SET slug = 'nytka'             WHERE name = 'Нитка'           AND slug IS NULL;
UPDATE "Category" SET slug = 'vidbiliuvannia'    WHERE name = 'Відбілювання'    AND slug IS NULL;
UPDATE "Category" SET slug = 'dytiacha-hihiiena' WHERE name = 'Дитяча гігієна'  AND slug IS NULL;
UPDATE "Category" SET slug = 'aksesuary'         WHERE name = 'Аксесуари'       AND slug IS NULL;

-- Фолбек для будь-якої іншої наявної категорії: id гарантує унікальність і NOT NULL.
UPDATE "Category" SET slug = id WHERE slug IS NULL;

ALTER TABLE "Category" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
