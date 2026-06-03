# SmileClinic — Agent Notes

## Brand identity
**SmileClinic** — сучасна стоматологічна клініка.  
Visual language: deep navy (#0A1628) + teal/mint (#00C9A7), clean sans-serif typography, sharp corners, minimal medical aesthetic. _Ніколи_ не використовувати "грайливі" rounded corners на основних поверхнях.

---

## Hard Rules (тримати в голові завжди)

1. **Перечитуй релевантний розділ перед суттєвою роботою:** нова фіча, новий API-роут, зміна auth/data-шару, створення компонента/іконки/утиліти. Для дрібних правок (текст, відступ, копірайт) досить Hard Rules вгорі — повне перечитування не потрібне. Змінив структуру (файл/каталог/утиліта/іконка/команда) — **онови `AGENTS.md` у тому ж коміті**.
2. **Перед комітом — `npx tsc --noEmit`.**
3. **Тільки Tailwind** (класи + arbitrary values). Окремих CSS-файлів для компонентів немає; кольори — лише через зареєстровані токени; жодного `style={{}}`, де працює Tailwind.
4. **Sharp corners:** `rounded-none` / max `rounded-sm` на основних поверхнях; `rounded-md` лише для badge/pill.
5. **Сторінка (`app/**/page.tsx`) — тонкий контейнер:** auth-gate + композиція секцій, **нуль бізнес-логіки**.
6. **SVG-іконки — лише в `components/icons/`** (barrel-імпорт із `index.ts`), ніколи інлайн у JSX.
7. **Форми — `react-hook-form` + `zod`** (схеми в `schemas/`), ніколи ручний стейт.
8. **Auth — NextAuth/Auth.js v5, cookie-based (JWT-сесія).** Сервер: `auth()` + гварди `lib/auth-helpers.ts`; клієнт: `signIn/signOut/useSession`. **Жодних `Authorization: Bearer` чи токенів у `localStorage`.**
9. **Дані клієнта — read-only Dexie-mirror** (server→client, одностороння). Записи — online-only через `/api/*`. Зворотного синку немає.
10. **Prisma — singleton `lib/prisma.ts`** (не `new PrismaClient()` деінде); типи без `any` без обґрунтування; код не дублювати — виноси в `lib/`, `components/ui/`, `components/icons/`.

Решта — довідка нижче.

---

## Known gaps (виправити при дотику)

Відкриті проблеми — деталі у відповідних розділах нижче, тут лише покажчик:

- **`/api/appointments` і `/api/patients` без auth-гарду** — закрити гардом при будь-якій правці цих роутів. → див. «Route Handlers».
- **`OfflineBanner` показує «changes will sync», хоча зворотного синку немає** — текст оманливий, переписати; не покладатись на нього. → див. «Дані».
- **Submit офлайн не оброблений** (падає в загальну помилку) — свідома offline-поведінка ще TODO. → див. «Дані».

---

## Команди

Пакетний менеджер — **npm** (`package-lock.json`).

| Команда | Дія |
|---|---|
| `npm run dev` | Next.js dev-сервер |
| `npm run build` | прод-білд (`next build --webpack`) |
| `npm start` | прод-сервер |
| `npm run lint` | ESLint |
| `npm run icons` | генерація SVG-іконок (`scripts/generate-icons.mjs`) |
| `npx tsc --noEmit` | перевірка типів (окремого npm-скрипта немає) |
| `npx prisma migrate dev` | створити + накотити міграцію (dev) |
| `npx prisma migrate deploy` | накотити міграції (prod) |
| `npx prisma generate` | перегенерувати клієнт → `lib/generated/prisma` |

---

## Іменування

Виведено з коду — дотримуватись для нового:

- Компоненти і секції — **PascalCase**; секція має суфікс `Section` (`HeroSection.tsx`).
- Іконки — `Ico<Name>` (`IcoTooth.tsx`); генеруються скриптом, barrel у `components/icons/index.ts`.
- Хуки — `use<Name>` (`useMirror`).
- Утиліти/функції — camelCase (`normalizePhone`, `pullMirror`); файли в `lib/` — camelCase (виняток: `auth-helpers.ts`).
- zod-схеми — файл lowercase (`register.ts`), експорт `<name>Schema` (`registerSchema`).
- Сервіси — `<resource>Service.ts` (⏳ цільове, у коді ще немає).
- API-роути — `app/api/<resource>/route.ts`.

---

## Структура проекту

- `app/` — Next.js App Router. Сторінки — тонкі контейнери (auth-gate + композиція секцій).
  - `app/page.tsx` — головна (лендінг); `app/(auth)/login/` — логін; `app/offline/` — офлайн-фолбек.
  - `app/(dashboard)/{dashboard,appointments,patients}/` — кабінет.
  - `app/api/` — Route Handlers: `appointments/` (+`[id]`), `patients/`, `register/`, `mirror/`, `auth/[...nextauth]/`.
- `components/` — за фічами:
  - `ui/` — спільні UI-примітиви; `layout/` — `Header`, `Footer`; `icons/` — SVG (1 файл = 1 іконка);
  - `auth/` — `SessionProvider`, `AuthButtons`; `home/` — секції лендінгу (`HeroSection`, `ServicesSection`, `DoctorsSection`, …).
- `lib/` — `prisma.ts`, `db.ts` (Dexie), `mirror.ts` (pull), `auth-helpers.ts`, `cn.ts`, `typography.ts`, `buttons.ts`, `normalizePhone.ts`.
- `hooks/` — кастомні React-хуки. `schemas/` — zod-схеми (`login.ts`, `register.ts`).
- `prisma/` — схема та міграції. Згенерований клієнт — `lib/generated/prisma` (кастомний output).
- `auth.ts` / `auth.config.ts` — Auth.js (split-config). `middleware.ts` — edge-guard. `public/` — статика, `manifest.json`.

---

## Стилі

- **Tailwind v4:** конфіг підключається через `@config "../tailwind.config.ts"` в `app/globals.css`. Окремі CSS-файли для компонентів заборонені. Виняток — глобальні класи в `app/globals.css` для того, що Tailwind не покриває (псевдо-елементи, складні animations, дочірні селектори).
- **Кольори — лише зареєстровані токени** (`bg-navy-900`, `text-mint`, `bg-cream`). Шкала: `navy-900/800/700/400`, `mint`/`mint-600`/`mint-100`, `cream`, `bone`, `ink`, `paper`. Шрифти: `font-serif` (Cormorant Garamond), `font-sans` (DM Sans). Тіні: `shadow-s1/s2/s3`. Easing: `ease-smooth`. Повний список — `tailwind.config.ts`.
- **Без `rgba(...)` для відомих кольорів** — тільки токени. Виняток: `rgba` всередині складних arbitrary values (gradients у `[background:...]`, `shadow-[...]`).

---

## Компоненти

- **Великі сторінки → секції** в `components/<фіча>/<Section>.tsx`. Кожна секція самодостатня (свій рендер + per-action loading).
- **Спільні UI-блоки — в `components/ui/`.** Перш ніж писати новий примітив — перевір, чи вже є аналог.

### UI-примітиви (`components/ui/`)

| Компонент | Призначення |
|---|---|
| `Container` | Центрований 1280px-контейнер |
| `SectionHeader` | Заголовок секції (title + lede) |
| `Eyebrow` | Надзаголовок з мʼятною крапкою |
| `Reveal` | Scroll-reveal обгортка (IntersectionObserver) |
| `AppointmentCard` | Картка запису на прийом |
| `OfflineBanner` | Банер при відсутності інтернету |
| `LoginModal` | Модалка логіну/реєстрації (таби, rhf+zod) |
| `LoginModalProvider` | Контекст `useLoginModal()` (open/close) |

### Іконки (`components/icons/`)

Один файл = одна іконка; barrel-імпорт: `import { IcoTooth } from '@/components/icons'`. **Актуальний перелік — у `components/icons/index.ts`** (не дублювати тут вручну). Кожна іконка: `className?: string`, `size?: number` (default 24), `strokeWidth?: number` (база 1.5). Спільний тип — `IconProps` (`components/icons/IconProps.ts`). `IcoGoogle` — мультиколірний бренд-логотип з фіксованими кольорами.

---

## Auth (NextAuth / Auth.js v5)

- **Cookie-based JWT-сесія** (`session.strategy = "jwt"`, httpOnly-cookie). JWT обовʼязковий через Credentials-провайдер. Жодного Bearer/`localStorage`.
- **Split-config:** `auth.config.ts` — edge-safe (Google-провайдер, `pages.signIn`), вживається в `middleware.ts`. `auth.ts` — повний (PrismaAdapter + Credentials + callbacks), експортує `{ handlers, signIn, signOut, auth }`.
- **Провайдери:** Google OAuth + Credentials (email/пароль, `bcrypt`). Credentials валідує `schemas/login.ts` (`loginSchema`, в `auth.ts`); реєстрація `/api/register` — окремо `schemas/register.ts` (`registerSchema`). Дві різні схеми, не плутати.
- **Сесія несе** `user.id`, `user.role` (`Role`), `user.patientId` (callbacks `jwt`/`session`).
- **Сервер:** `await auth()`; рольові гварди — `lib/auth-helpers.ts` (`requireAuth(roles?)`, `requireStaff`, `requireAdmin`, `requirePatient`) з редіректом на `/login`.
- **Клієнт:** `signIn`/`signOut`/`useSession` з `next-auth/react`; кореневий `components/auth/SessionProvider.tsx`.
- **`Role` (enum у `prisma/schema.prisma`):** `ADMIN`, `STAFF`, `PATIENT` (дефолт `PATIENT`).
- **Ролі:** призначаються в event `createUser` за списками `AUTH_ADMIN_EMAILS` / `AUTH_STAFF_EMAILS`; інакше `PATIENT` (з привʼязкою до `Patient` за email).
- **Route handler:** `app/api/auth/[...nextauth]/route.ts` ре-експортує `handlers`.

---

## Дані: read-only Dexie-mirror

- **Server (Postgres) — єдине джерело правди.** `lib/mirror.ts` `pullMirror()` тягне рольовий зріз із `/api/mirror` і **атомарно** (clear+bulkPut в одній Dexie-транзакції) перезаписує локальну БД. Потік **строго односторонній** server→Dexie; зворотного синку **немає**.
- **Записи — online-only** через `/api/*`. Єдиний реальний клієнтський запис сьогодні — **реєстрація** (`LoginModal` → `/api/register`); форм бронювання/пацієнтів ще немає (сторінки кабінету — заглушки `<div>…</div>`). **Offline-обробки submit немає:** кнопка офлайн не дізейблиться, інлайн-попередження немає — `fetch` падає, показується загальна помилка «Щось пішло не так». Єдиний офлайн-сигнал — глобальний `OfflineBanner` (пасивний, дисмісабельний; його текст «changes will sync» оманливий — зворотного синку немає). **TODO:** свідома offline-поведінка submit + чесний текст банера.
- **Dexie** — `lib/db.ts` (`ClinicDatabase`, v2). Таблиці: `appointments`, `patients`, `doctors`, `profile`.
- **Lifecycle** — `hooks/useMirror.ts` (монтуєтся раз у `SessionProvider`): pull при вході/зміні юзера, re-pull на `online`, **wipe Dexie при signOut** (щоб на спільному пристрої дані не текли). 401 → wipe; offline/5xx → лишити попередній зріз.
- **Читання в UI** — Dexie-хуки (`useAppointments` через `useLiveQuery`). `/api/mirror` — `NetworkOnly`, без кешу.

---

## Сервіси та типи — ⏳ цільова конвенція (ще не реалізовано)

> У коді **поки немає** `services/` і `types/`. Зараз: читання — через Dexie-хуки + `/api/mirror`; мутації — `fetch` до `/api/*` прямо з компонента. Нижче — цільовий контракт, до якого приводити новий код.

- **API-запити — через сервіси в `services/`** (один файл = один ресурс, напр. `appointmentService.ts`); не розкидати `fetch` по компонентах.
- **Спільні API-типи — в `types/`** (`types/<ресурс>.ts`).

---

## Route Handlers — помилки та статус-коди

Наявні роути (`appointments`, `appointments/[id]`, `patients`, `register`, `mirror`) дотримуються єдиного патерна — застосовувати його й для нових:

- Тіло помилки — завжди JSON **`{ error: string }`** (людиночитане повідомлення).
- Парсинг: `try { await request.json() } catch` → `{ error: "Invalid JSON" }`, **400**.
- Невалідне/неповне тіло → **400**; не знайдено (Prisma `P2025`) → **404**; дубль/унікальність (`P2002`) → **409**; неавторизовано → **401**.
- Інша помилка — `console.error(...)` + `{ error: "…" }`, **500**.
- Успіх: ресурс у JSON (**200**), створення — **201**, видалення — **204** (порожнє тіло).

Реальні відхилення від патерна (не вигадані):
- `/api/register` для zod-помилок повертає **структурований** `{ error: "validation", details: [{ path, message }] }` — єдиний роут із `details`; решта кладуть текст прямо в `error`. Цільово — поширити цей формат на валідацію всюди.
- `/api/appointments` і `/api/patients` **не мають auth-гарду** (401/403 не повертають), на відміну від `/api/mirror` (стартує з `auth()`). **TODO:** закрити мутаційні роути гардом.

---

## Prisma / PostgreSQL

- Схема — `prisma/schema.prisma`. Клієнт-singleton — `lib/prisma.ts` (не створювати `new PrismaClient()` деінде).
- Міграції: `npx prisma migrate dev` (створити) / `npx prisma migrate deploy` (накотити); після зміни схеми — `npx prisma generate` (output → `lib/generated/prisma`).
- **Моделі:** `Patient`, `Doctor`, `Appointment`, `User`, `Account`, `Session`, `VerificationToken` (останні три — адаптер Auth.js).

---

## Хуки (`hooks/`)

| Хук | Повертає / робить |
|---|---|
| `useAppointments` | `LocalAppointment[]` — read-only Dexie-зріз (`useLiveQuery`) |
| `useMirror` | `{ status, lastPullAt, retry }` — оркеструє pull/​wipe мірора |
| `useOnlineStatus` | `{ isOnline: boolean }` |

Всі хуки TS, із перевіркою `typeof window !== 'undefined'` для SSR.

---

## Утиліти (`lib/`)

| Утиліта | Файл |
|---|---|
| `cn(...classes)` | `cn.ts` |
| `displayXl/L/M`, `lede` | `typography.ts` |
| `btnBase/btnPrimary/btnMint/btnGhost/btnLink` | `buttons.ts` |
| `normalizePhone` | `normalizePhone.ts` (канон `+380XXXXXXXXX`; вживати і в zod-трансформі, і в API) |
| `pullMirror` | `mirror.ts` |
| `requireAuth/requireStaff/requireAdmin/requirePatient` | `auth-helpers.ts` |

---

## PWA

- Конфіг — `next.config.ts` через `@ducanh2912/next-pwa`. Manifest — `public/manifest.json`.
- `turbopack: {}` обовʼязково (сумісність Next.js 16). Service Worker вимкнено в `development`.
- `/api/mirror` — `NetworkOnly` (кешування заборонено).

---

## Environment variables

```
DATABASE_URL          # PostgreSQL connection string
AUTH_SECRET           # Auth.js secret
AUTH_URL              # App URL (http://localhost:3000 для dev)
AUTH_GOOGLE_ID        # Google OAuth client id
AUTH_GOOGLE_SECRET    # Google OAuth client secret
AUTH_ADMIN_EMAILS     # CSV email-ів → роль ADMIN
AUTH_STAFF_EMAILS     # CSV email-ів → роль STAFF
```

Зберігати в `.env.local` (не комітити).
