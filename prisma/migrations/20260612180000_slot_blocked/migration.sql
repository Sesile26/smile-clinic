-- Додає статус слота "blocked" (слот, у який лікар не працює). Адитивна зміна:
-- ALTER TYPE ADD VALUE не чіпає наявні рядки (їхній статус лишається free/booked).
ALTER TYPE "SlotStatus" ADD VALUE 'blocked';
