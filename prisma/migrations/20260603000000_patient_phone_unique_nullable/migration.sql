-- Phone стає nullable: Google-реєстрація не збирає телефон, а Postgres
-- unique-індекс дозволяє кілька NULL, тож Google-користувачі не конфліктують.
ALTER TABLE "Patient" ALTER COLUMN "phone" DROP NOT NULL;

-- Унікальність телефону: один канонічний +380XXXXXXXXX = один пацієнт.
-- УВАГА: впаде, якщо в "Patient" є рядки з однаковим (не-NULL) phone —
-- спершу прибрати дублікати.
CREATE UNIQUE INDEX "Patient_phone_key" ON "Patient"("phone");
