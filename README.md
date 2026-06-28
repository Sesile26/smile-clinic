**🇺🇦 Українська** | [🇬🇧 English](README.en.md)

# SmileClinic

Бутік-клініка стоматології як **PWA**: пацієнти бронюють прийоми за календарем
слотів кожного лікаря, а той самий застосунок містить інтернет-магазин товарів
для догляду за зубами з кошиком, оформленням і доставкою Новою Поштою. Зроблено
на Next.js 16 (App Router), з ролями (admin / staff / doctor / patient),
realtime-сповіщеннями, нативним Web Push і офлайн-режимом на service worker +
локальному дзеркалі даних.

## Live demo

**https://smile-clinic-five.vercel.app/**

Вхід за email + паролем (один спільний демо-пароль: **`Password123`**). Це навмисні
публічні демо-акаунти, які засіваються в усіх середовищах — ніколи не
використовуйте цей пароль десь реально.

| Роль | Email | Що бачить на `/booking` |
|---|---|---|
| ADMIN | `admin@smileclinic.test` | Керування слотами всіх лікарів + адмін-панель |
| STAFF | `staff@smileclinic.test` | Керування слотами всіх лікарів |
| DOCTOR | `doctor@smileclinic.test` | Свій розклад (Наталія Лисенко · Терапевтична стоматологія) |
| PATIENT | `patient1@smileclinic.test` … `patient8@smileclinic.test` | Бронює вільні слоти, користується магазином |

> Порада: почніть як `admin@smileclinic.test`, щоб побачити ролі, адмін-панель і
> бек-офіс магазину; відкрийте `patient1@smileclinic.test` в іншому браузері, щоб
> забронювати слот адміна/лікаря й побачити, як спрацьовує сповіщення.

## Тех-стек

Версії зафіксовані в [`package.json`](package.json).

**Фронтенд** — Next.js 16.2 (App Router) · React 19.2 · TypeScript 5 · Tailwind CSS 4 · React Hook Form 7 + Zod 4

**Бекенд** — Next.js Route Handlers (Node.js runtime) · Auth.js v5 (`next-auth` 5 beta) з `@auth/prisma-adapter` · bcryptjs (вхід за паролем)

**База даних** — PostgreSQL · Prisma 7 (`@prisma/client` + `@prisma/adapter-pg` поверх `pg`)

**PWA / realtime / інфра** — `@ducanh2912/next-pwa` 10 (Workbox service worker) · Dexie 4 (офлайн-дзеркало) · Server-Sent Events (сповіщення в застосунку) · `web-push` 3 (нативний Web Push, VAPID) · `@vercel/blob` (фото товарів) · задеплоєно на **Vercel** з базою **Neon** Postgres

## Можливості

- **Запис на прийом** — тижневий календар слотів по кожному лікарю (08:00–22:00), пацієнти беруть вільні слоти, staff/лікарі керують доступністю; з лімітами записів і rate limiting.
- **Доступ за ролями** — ADMIN / STAFF / DOCTOR / PATIENT; ролі задаються через seed або email-allowlist при першому вході через Google.
- **Інтернет-магазин** — каталог товарів із галереєю, категорії, кошик, оформлення й замовлення.
- **Доставка Новою Поштою** — пошук відділення при оформленні (опційний API-ключ).
- **Realtime-сповіщення** — сповіщення з БД доставляються наживо через SSE у дзвіночок (нові записи, статуси замовлень/прийомів, зміна ролі).
- **Нативний Web Push** — push-сповіщення на пристрій за згодою (Android), на тих самих подіях, що й дзвіночок.
- **Офлайн-режим (PWA)** — встановлюваний застосунок; Workbox service worker кешує оболонку, а дзеркало Dexie віддає дані офлайн.
- **Адмін-панель** — керування лікарями, слотами, товарами, категоріями та замовленнями.

## Локальний запуск

### Передумови

- **Node.js 20+** (вимога Next.js 16)
- **PostgreSQL** локально (або будь-який Postgres connection string)
- **npm** (репозиторій використовує npm-скрипти та `package-lock.json`)

### 1. Клон + встановлення

```bash
git clone <repo-url> && cd smile-clinic
npm install
```

`npm install` запускає хук `postinstall` (`prisma generate`), який генерує Prisma-
клієнт у **кастомний шлях** [`lib/generated/prisma`](lib/generated/prisma) (заданий
у `generator client.output` у схемі). Застосунок імпортує саме звідти, тож клієнт
має бути згенерований перед `dev`/`build` — `postinstall` покриває свіже
встановлення; після будь-якої зміни схеми перезапустіть `npx prisma generate`,
інакше збірка падає на відсутньому клієнті.

### 2. Змінні середовища

```bash
cp .env.example .env
```

Заповніть [`.env`](.env.example) (у git-ignore — ніколи не комітити):

| Змінна | Обов'язкова | Що це / де взяти |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (pooled). |
| `DATABASE_URL_UNPOOLED` | опц. | Прямий (non-pooling) рядок — для `prisma migrate deploy` / seed на хостах типу Neon. Локально можна продублювати `DATABASE_URL`. |
| `AUTH_SECRET` | ✅ | Секрет для підпису сесій. Згенерувати: `npx auth secret`. |
| `AUTH_URL` | опц. | Канонічна URL застосунку (напр. `http://localhost:3000` у dev). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | опц. | Google OAuth credentials. Лишіть порожніми, щоб входити лише за email + паролем. |
| `AUTH_ADMIN_EMAILS` | опц. | Email через кому → роль **ADMIN** при першому вході через Google. |
| `AUTH_STAFF_EMAILS` | опц. | Email через кому → роль **STAFF** при першому вході через Google. |
| `AUTH_DOCTOR_EMAILS` | опц. | Email через кому → роль **DOCTOR** при першому вході через Google. |
| `NOVA_POSHTA_API_KEY` | опц. | API-ключ Нової Пошти (пошук відділення при оформленні). |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | опц. | Vercel Blob (завантаження фото товарів). На проді надає інтеграція Vercel. |
| `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | опц. | Web Push (VAPID). Згенерувати **один раз**: `npx web-push generate-vapid-keys`; `VAPID_SUBJECT` — `mailto:`-контакт. Без них push тихо пропускається. |

Опційні налаштування (мають дефолти): `MAX_ACTIVE_APPOINTMENTS`, `BOOKING_RATE_LIMIT`,
`BOOKING_RATE_WINDOW_MS`.

### 3. База даних — migrate, generate, seed

```bash
npx prisma migrate dev      # накотить міграції ТА авто-засідить демо-дані
```

`prisma migrate dev` (і `prisma migrate reset`) запускають seed автоматично
(команда живе в `prisma.config.ts → migrations.seed`, продубльована в
`package.json → prisma.seed`). Seed ([`prisma/seed.ts`](prisma/seed.ts))
ідемпотентний і створює демо-акаунти вище плюс довідник спеціальностей, 8 категорій,
100 товарів і 100 замовлень.

```bash
npx prisma migrate reset    # дроп, повторна міграція, повторний seed з нуля
npm run db:seed             # запустити seed окремо
npx prisma generate         # регенерувати клієнт після зміни схеми
```

> Опційний демо-розклад лікаря (слоти для бронювання) сідиться окремо:
> `node prisma/seed.mjs`.

На прод-хості `migrate deploy` **не** запускає seed — викличте окремим кроком:
`npx prisma migrate deploy && npm run db:seed`.

### 4. Запуск dev-сервера

```bash
npm run dev                 # http://localhost:3000
```

> **PWA та Web Push вимкнені в розробці** (`disable: NODE_ENV === "development"`
> у [`next.config.ts`](next.config.ts)). Service worker не реєструється, і push
> локально не спрацьовує — це очікувано. Щоб перевірити SW / запит на встановлення /
> Web Push, зробіть продакшн-збірку (`npm run build && npm run start`) або тестуйте
> на задеплоєному сайті Vercel (із заданими `VAPID_*`).

## Деплой

Задеплоєно на **Vercel** (build-команда `prisma generate && next build --webpack`,
див. [`vercel.json`](vercel.json)) з базою **Neon** Postgres. Задайте ті самі змінні
середовища в налаштуваннях проєкту Vercel; накотіть міграції через
`prisma migrate deploy` і засідіть один раз `npm run db:seed`. У репозиторії немає
секретів — лише плейсхолдери в `.env.example`.

## Скрипти

З [`package.json`](package.json):

| Скрипт | Команда | Що робить |
|---|---|---|
| `npm run dev` | `next dev` | Запуск dev-сервера на :3000. |
| `npm run build` | `next build --webpack` | Продакшн-збірка (webpack — потрібен для next-pwa). |
| `npm run start` | `next start` | Запуск продакшн-збірки. |
| `npm run lint` | `eslint` | Лінт проєкту. |
| `npm run db:seed` | `node --import tsx prisma/seed.ts` | Засідити демо-дані (ідемпотентно). |
| `npm run icons` | `node scripts/generate-icons.mjs` | Регенерувати PWA-іконки. |
| `postinstall` | `prisma generate` | Авто-генерація Prisma-клієнта після install. |

Поширені команди Prisma: `npx prisma migrate dev` (нова міграція + seed),
`npx prisma migrate reset` (перестворити + seed), `npx prisma migrate deploy`
(CI/прод, без seed), `npx prisma generate` (регенерувати клієнт),
`npx prisma studio` (браузер БД).
