# SmileClinic — Agent Notes

## Brand identity
**SmileClinic** — сучасна стоматологічна клініка.  
Visual language: deep navy (#0A1628) + teal/mint (#00C9A7), clean sans-serif typography, sharp corners, minimal medical aesthetic. _Ніколи_ не використовувати "грайливі" rounded corners на основних поверхнях.

---

## Обов'язково перед будь-якою задачею

- Завжди читай цей `AGENTS.md` **перед початком роботи** — він фіксує робочі контракти проекту (стек, конвенції, заборонене).
- Ознайомся з актуальною структурою (`app/`, `components/`, `lib/`, `hooks/`, `services/`, `prisma/`) — детальна мапа нижче в розділі **Project structure**.
- Якщо змінюєш структуру (нові файли/каталоги/сервіси/утиліти/іконки) — **одразу** оновлюй цей файл у тому ж коміті. Не "потім".
- Перед комітом — `npx tsc --noEmit`.

---

## Структура проекту

- `app/` — Next.js App Router сторінки. Тонкі контейнери — фетч + композиція секцій.
  - `app/(auth)/login/` — сторінка логіну
  - `app/(dashboard)/dashboard/` — головний дашборд
  - `app/(dashboard)/appointments/` — записи на прийом
  - `app/(dashboard)/patients/` — база пацієнтів
  - `app/(dashboard)/doctors/` — лікарі
  - `app/api/` — Next.js API Route Handlers
- `components/` — компоненти, розкладені по фічах:
  - `components/ui/` — спільні UI-примітиви
  - `components/icons/` — SVG-іконки
  - `components/layout/` — Header, Sidebar, Footer
  - `components/appointments/` — секції сторінки записів
  - `components/patients/` — секції сторінки пацієнтів
  - `components/dashboard/` — секції дашборду
  - `components/auth/` — форми логіну/реєстрації
- `lib/` — низькорівневі інструменти: `db.ts` (Dexie/IndexedDB), `prisma.ts`, `sync.ts`, `cn.ts`
- `hooks/` — кастомні React хуки
- `services/` — API-клієнти (один файл = один ресурс)
- `prisma/` — схема БД та міграції
- `public/` — статичні файли, manifest.json, іконки PWA

---

## Стилі

- **Тільки Tailwind-класи + arbitrary values.** Окремі CSS-файли для компонентів **заборонені**. Виняток: глобальні класи в `app/globals.css` для речей, які Tailwind не покриває (псевдо-елементи, складні animations, дочірні селектори).
- **Кольори — лише через семантичні Tailwind-токени** (`bg-navy`, `text-teal`, `border-teal/55`). Повний список — у `tailwind.config.ts`.
- **Не використовувати `rgba(...)` для відомих кольорів** — тільки токени. Виняток: `rgba` всередині складних arbitrary values (gradients у `[background:...]`, `shadow-[...]`).
- Sharp corners скрізь — `rounded-none` або max `rounded-sm` на основних поверхнях. `rounded-md` лише для badge/pill елементів.

---

## Компоненти

- **Всі стилі — через Tailwind.** Окремі CSS-файли для компонентів заборонені.
- **Великі сторінки розбивати на підкомпоненти** в `components/<page>/<Section>.tsx`. Кожна секція самодостатня — свій рендер блоку + per-action loading state. Приклади: `appointments/{AppointmentList,AppointmentForm,AppointmentFilter}Section.tsx`, `patients/{PatientCard,PatientHistory,PatientForm}Section.tsx`.
- **SVG-іконки — в `components/icons/`** (один файл = одна іконка). Імпорт через barrel: `import { IcoCalendar, IcoTooth } from '@/components/icons'`. Кожна іконка приймає `className?: string`, `size?: number`, `strokeWidth?: number`.
- **Спільні UI-блоки — в `components/ui/`.** Перш ніж писати новий — перевір, чи вже є аналог у `ui/`.
- **Форми — `react-hook-form` + `zod`** (схеми в `schemas/`). Не керувати стейтом форми вручну.
- **Сторінка — тонкий контейнер.** Вся UI-сітка живе в дочірніх компонентах. Сторінка лише: auth gate + композиція секцій.

---

## UI-примітиви (`components/ui/`)

Перед створенням нового компонента — перевір цей список:

| Компонент | Призначення |
|---|---|
| `Button` | Кнопки (primary, secondary, ghost, danger) |
| `Card` | Базова картка з border |
| `Input` | Поле вводу |
| `Select` | Випадаючий список |
| `Badge` | Статус-бейдж (pending, confirmed, done, cancelled) |
| `Modal` | Модальне вікно |
| `Spinner` | Індикатор завантаження |
| `OfflineBanner` | Банер при відсутності інтернету |
| `SyncStatus` | Статус синхронізації з сервером |
| `AppointmentCard` | Картка запису на прийом |
| `PatientCard` | Картка пацієнта |

---

## Іконки (`components/icons/`)

Один файл = одна іконка. Barrel-імпорт через `index.ts`.

| Іконка | Файл |
|---|---|
| `IcoTooth` | `IcoTooth.tsx` |
| `IcoCalendar` | `IcoCalendar.tsx` |
| `IcoUser` | `IcoUser.tsx` |
| `IcoClose` | `IcoClose.tsx` |
| `IcoChevron` | `IcoChevron.tsx` |
| `IcoCheck` | `IcoCheck.tsx` |
| `IcoSearch` | `IcoSearch.tsx` |
| `IcoSync` | `IcoSync.tsx` |
| `IcoWifi` | `IcoWifi.tsx` |
| `IcoPlus` | `IcoPlus.tsx` |

Кожна іконка: `className?: string`, `size?: number` (default 24), `strokeWidth?: number` (default 1.5).

---

## Сервіси (API)

- Всі HTTP-запити — **через сервіси в `services/`**. Не викликай fetch напряму з компонентів.
- **Один файл = один ресурс:** `appointmentService.ts`, `patientService.ts`, `doctorService.ts`, `authService.ts`.
- Авторизовані запити — через спільний `api` instance. Request interceptor читає токен і додає `Authorization: Bearer <token>`.
- **Авторизація через `Authorization: Bearer` header**, не cookies. Токен зберігається в `localStorage['token']`.
- Запис / читання / очистка токена — **лише через `setToken()` / `readToken()` / `clearToken()`** з `services/api.ts`. Прямі `localStorage.setItem('token', …)` поза `api.ts` заборонені.

---

## Хуки (`hooks/`)

| Хук | Призначення |
|---|---|
| `useAppointments` | CRUD для записів (IndexedDB + sync) |
| `usePatients` | CRUD для пацієнтів |
| `useOnlineStatus` | `{ isOnline: boolean }` |
| `useSync` | `{ isSyncing, pendingCount, triggerSync }` |
| `useAuth` | `{ user, login, logout, isAuthenticated }` |

Всі хуки — TypeScript. Перевірка `typeof window !== 'undefined'` для SSR-сумісності.

---

## IndexedDB / Offline (Dexie)

- Локальна БД — `lib/db.ts` через `Dexie.js`.
- **Offline-first:** завжди зберігати в IndexedDB спочатку, потім синхронізувати з PostgreSQL.
- Синхронізація — `lib/sync.ts`. Авто-запуск при `window.addEventListener('online', syncAll)`.
- Статуси запису: `'pending'` → `'synced'` / `'failed'`.
- **Таблиці IndexedDB:** `appointments`, `patients`.

---

## Prisma / PostgreSQL

- Схема — `prisma/schema.prisma`.
- Prisma Client singleton — `lib/prisma.ts`. Не створювати `new PrismaClient()` поза цим файлом.
- Міграції — `npx prisma db push` (dev) / `npx prisma migrate deploy` (prod).
- **Моделі:** `Patient`, `Doctor`, `Appointment`, `User`.

---

## PWA

- Конфіг — `next.config.js` через `@ducanh2912/next-pwa`.
- Manifest — `public/manifest.json`.
- `turbopack: {}` обов'язково в `next.config.js` (Next.js 16 сумісність).
- Service Worker вимкнений в `development` режимі.

---

## Утиліти (`lib/` та `utils/`)

| Утиліта | Файл |
|---|---|
| `cn(...classes)` | `lib/cn.ts` |
| `formatDate`, `formatTime` | `lib/formatDate.ts` |
| `formatPhone` | `lib/formatPhone.ts` |
| `getStatusColor`, `getStatusLabel` | `lib/appointmentStatus.ts` |

---

## Типи (`types/`)

- Всі API-типи — в `types/`.
- `types/appointment.ts`, `types/patient.ts`, `types/doctor.ts`, `types/user.ts`.
- **Заборонено `any` без обґрунтування.**

---

## Заборонено

- ❌ Окремі CSS-файли для компонентів. Виняток — глобальні класи в `app/globals.css`.
- ❌ Хардкодити кольори через `rgba(...)` коли є зареєстрований токен.
- ❌ Дублювати код між файлами — виноси в `lib/`, `components/icons/`, `components/ui/`.
- ❌ Викликати API напряму з компонентів (fetch/axios) — тільки через `services/*`.
- ❌ `any` без обґрунтування. Типи живуть у `types/`.
- ❌ Створювати новий `PrismaClient()` поза `lib/prisma.ts`.
- ❌ Читати/писати токен через `localStorage` напряму поза `services/api.ts`.
- ❌ Бізнес-логіка в сторінках (`app/**/page.tsx`) — тільки композиція компонентів.
- ❌ SVG-іконки інлайном в JSX — всі іконки живуть в `components/icons/`.
- ❌ Стилі через `style={{}}` prop коли можна через Tailwind.

---

## Environment variables

```
DATABASE_URL          # PostgreSQL connection string (Supabase)
NEXTAUTH_SECRET       # NextAuth secret key
NEXTAUTH_URL          # App URL (http://localhost:3000 для dev)
NEXT_PUBLIC_APP_URL   # Публічний URL додатку
```

Зберігати в `.env.local` (не комітити).

---

## Session flow

1. App mount: якщо `localStorage['token']` існує — відновити сесію через `getCurrentUser()`.
2. Login: POST `/api/auth/login` → `setToken(token)` + оновити стан `useAuth`.
3. Logout: `clearToken()` + очистити стан `useAuth`.
4. 401 response: interceptor автоматично викликає `clearToken()` + redirect на `/login`.

---

## Working agreements

- Перед будь-якою UI задачею читати `AGENTS.md`.
- `app/**/page.tsx` — **тільки UI shell**: auth gate + композиція секцій. Нуль бізнес-логіки.
- Prefer **typed** code. Всі API типи в `types/`.
- Компоненти розміщувати в `components/<фіча>/` — папка за фічею.
- Великі сторінки розбивати на секції в `components/<назва сторінки>/`.
- SVG іконки — **завжди** в `components/icons/`, barrel-імпорт.
- Форми — `react-hook-form` + `zod`. Ніколи вручну.
- API — тільки через `services/*`.
- Після будь-якої зміни структури — одразу оновлювати цей `AGENTS.md`.
- Після кожної фічі — `npx tsc --noEmit` перед комітом.

---

## Додавання нового компонента — чеклист

1. Перевір `components/ui/` — можливо вже є аналог.
2. Визнач фічу → створи в `components/<фіча>/`.
3. Якщо потрібна нова іконка → `components/icons/IcoНазва.tsx` + додай в `index.ts`.
4. Стилі — тільки Tailwind.
5. Props — TypeScript інтерфейс.
6. Якщо новий файл — оновити цей `AGENTS.md`.

---

## Додавання нового API endpoint — чеклист

1. Route handler → `app/api/<ресурс>/route.ts`.
2. Prisma запит → через `lib/prisma.ts` singleton.
3. Сервісна функція → `services/<ресурс>Service.ts`.
4. Тип відповіді → `types/<ресурс>.ts`.
5. Хук якщо потрібен → `hooks/use<Ресурс>.ts`.
