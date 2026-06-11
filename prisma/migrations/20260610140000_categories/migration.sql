-- Винесення категорій товарів в окрему модель Category.
-- Data-міграція: зберігає наявні текстові категорії (жодних втрат).

-- 1. Нова таблиця Category
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- 2. Нова nullable-колонка зв'язку на Product
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;

-- 3. ДАНІ: з унікальних назв категорій робимо рядки Category.
--    id = 'cat_' || md5(name) — детермінований і унікальний (name унікальні),
--    без потреби в розширеннях БД.
INSERT INTO "Category" ("id", "name", "createdAt", "updatedAt")
SELECT 'cat_' || md5(category), category, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT category
    FROM "Product"
    WHERE category IS NOT NULL AND btrim(category) <> ''
) d;

-- 4. ДАНІ: прив'язуємо товари до відповідної категорії за назвою
UPDATE "Product" p
SET "categoryId" = c."id"
FROM "Category" c
WHERE p.category = c.name;

-- 5. Прибираємо старе текстове поле
ALTER TABLE "Product" DROP COLUMN "category";

-- 6. Індекс на зв'язок + FK (SET NULL при видаленні категорії)
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
ALTER TABLE "Product"
    ADD CONSTRAINT "Product_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
