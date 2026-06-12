-- Винесення спеціальностей лікарів у довідник Specialty (за зразком Category).
-- Дані наявних Doctor.specialty (текст) переносяться без втрат у нову модель.

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_name_key" ON "Specialty"("name");

-- AlterTable: додаємо нову FK-колонку, текстову поки лишаємо для перенесення.
ALTER TABLE "Doctor" ADD COLUMN "specialtyId" TEXT;

-- Data: унікальні наявні тексти specialty -> записи Specialty.
INSERT INTO "Specialty" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, btrim("specialty"), now(), now()
FROM "Doctor"
WHERE "specialty" IS NOT NULL AND btrim("specialty") <> ''
GROUP BY btrim("specialty");

-- Data: привʼязуємо лікарів до їхньої спеціальності.
UPDATE "Doctor" d
SET "specialtyId" = s."id"
FROM "Specialty" s
WHERE s."name" = btrim(d."specialty");

-- AlterTable: дані перенесено — прибираємо стару текстову колонку.
ALTER TABLE "Doctor" DROP COLUMN "specialty";

-- CreateIndex
CREATE INDEX "Doctor_specialtyId_idx" ON "Doctor"("specialtyId");

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
