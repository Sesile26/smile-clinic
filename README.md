# SmileClinic

Бутік-мережа стоматологічних клінік. Next.js 16 (App Router) · React 19 · Prisma 7 + PostgreSQL · TypeScript · PWA · Tailwind 4.

---

## Авторизація через Google (Auth.js v5)

### 1. Створити OAuth credentials у Google Cloud Console

1. Відкрийте [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Натисніть **Create Credentials → OAuth client ID**.
3. Тип застосунку: **Web application**.
4. В **Authorised redirect URIs** додайте:
   - Розробка: `http://localhost:3000/api/auth/callback/google`
   - Продакшн: `https://yourdomain.com/api/auth/callback/google`
5. Скопіюйте **Client ID** та **Client Secret**.

### 2. Налаштувати змінні середовища

```bash
cp .env.example .env
```

Заповніть `.env`:

| Змінна | Опис |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Секрет для підпису сесій. Генерація: `npx auth secret` |
| `AUTH_URL` | Канонічна URL застосунку (продакшн) |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `AUTH_ADMIN_EMAILS` | Список email через кому → роль **ADMIN** при першому вході |
| `AUTH_STAFF_EMAILS` | Список email через кому → роль **STAFF** при першому вході |
| `AUTH_DOCTOR_EMAILS` | Список email через кому → роль **DOCTOR** при першому вході |

> **Увага:** `.env` ніколи не комітити. Лише `.env.example` потрапляє до git.

### 3. Додати email персоналу в allowlist

Ролі призначаються **один раз** при першій реєстрації через Google.

```env
AUTH_ADMIN_EMAILS="admin@smileclinic.ua"
AUTH_STAFF_EMAILS="doctor1@smileclinic.ua,reception@smileclinic.ua"
```

- Якщо email є в `AUTH_ADMIN_EMAILS` — отримує роль `ADMIN`.
- Якщо email є в `AUTH_STAFF_EMAILS` — отримує роль `STAFF`.
- Всі інші — `PATIENT`. Якщо email збігається з наявним `Patient.email` — автоматично прив'язується до запису пацієнта.

Щоб змінити роль вже зареєстрованого користувача — оновіть запис напряму в БД:

```sql
UPDATE "User" SET role = 'STAFF' WHERE email = 'doctor@smileclinic.ua';
```

### 4. Запустити міграцію

```bash
# Застосувати міграцію до БД (перший раз або після pull)
npx prisma migrate deploy

# Або в режимі розробки (генерує нову міграцію при змінах схеми)
npx prisma migrate dev
```

### 5. Запустити dev-сервер

```bash
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000).

---

## Тестові акаунти (демо)

> ⚠️ **Це демонстраційний проєкт.** Нижче — навмисні **демо-акаунти зі спільним
> публічним паролем**. Вони створюються в **усіх** середовищах (локально та на
> прод-демо) свідомо. **Ніколи не використовуйте цей пароль і ці акаунти в
> реальному продакшені з чутливими даними.**

Усі акаунти мають один пароль: **`Password123`** (вхід через email + пароль).

| Роль | Email | Пароль | Що бачить на `/booking` |
|---|---|---|---|
| ADMIN | `admin@smileclinic.test` | `Password123` | Керування слотами всіх лікарів |
| STAFF | `staff@smileclinic.test` | `Password123` | Керування слотами всіх лікарів |
| DOCTOR | `doctor@smileclinic.test` | `Password123` | Свій розклад (Наталія Лисенко · Терапевтична стоматологія) |
| PATIENT | `patient1@smileclinic.test` | `Password123` | Бронювання вільних слотів |
| PATIENT | `patient2@smileclinic.test` | `Password123` | Бронювання вільних слотів |

Дані описані в `prisma/seed.ts` — **ідемпотентно** (upsert за email / `Doctor.userId`),
тож повторний запуск seed не дублює акаунти й не падає на унікальних обмеженнях.

### Засідити локально

`prisma migrate dev` та `prisma migrate reset` **автоматично** запускають seed
(команда налаштована в `prisma.config.ts → migrations.seed` і продубльована в
`package.json → prisma.seed`). Тобто після клонування репозиторію достатньо:

```bash
npx prisma migrate dev      # застосує міграції + засідить демо-акаунти
# або повне перестворення БД з нуля:
npx prisma migrate reset    # дропне БД, накотить міграції, засідить
```

Окремо (без міграцій) seed можна запустити так:

```bash
npx prisma db seed
# або
npm run db:seed
```

### Засідити прод-демо

`prisma migrate deploy` (прод) **НЕ** запускає seed автоматично — на проді його
треба викликати окремим кроком **після** деплою міграцій:

```bash
npx prisma migrate deploy   # 1) накотити міграції
npm run db:seed             # 2) засідити демо-акаунти (ідемпотентно)
```

Додайте обидва рядки у ваш пайплайн деплою / release-команду хостингу. Приклади:

- **Vercel** — у Project Settings → *Build Command* (або окремий post-deploy
  скрипт): `prisma migrate deploy && npm run db:seed`. Потрібен `DATABASE_URL`
  в Environment Variables; `tsx` уже в `devDependencies`, тож переконайтесь, що
  деплой не пропускає dev-залежності на кроці seed (інакше використайте
  `prisma migrate deploy && prisma db seed`).
- **Railway / Render / Fly.io** — додайте release/деплой-команду:
  `npx prisma migrate deploy && npm run db:seed`.
- **Docker / вручну на сервері** — після старту контейнера з доступом до БД:
  `npm run db:seed`.

Повторний деплой просто переконфігурує ті самі акаунти (idempotent) — дублів не
буде.

---

## Структура авторизації

```
auth.ts                          # Auth.js конфіг: Google provider, PrismaAdapter, колбеки
middleware.ts                    # Захист маршрутів за роллю
app/api/auth/[...nextauth]/      # Route handler
components/auth/
  SessionProvider.tsx            # Client-side SessionProvider обгортка
  AuthButtons.tsx                # GoogleSignInButton, SignOutButton, AuthStatus
lib/auth-helpers.ts              # requireAuth(), requireStaff(), requireAdmin()
```

### Захист серверних сторінок

```tsx
// app/(dashboard)/patients/page.tsx
import { requireStaff } from "@/lib/auth-helpers";

export default async function PatientsPage() {
  await requireStaff(); // редиректить якщо не ADMIN/STAFF
  // ...
}
```

### Ролі

| Роль | Доступ |
|---|---|
| `ADMIN` | Усі маршрути |
| `STAFF` | `/dashboard`, `/patients`, `/appointments` |
| `PATIENT` | `/cabinet` (кабінет пацієнта) |

---

## Офлайн і PWA

Service Worker не кешує:
- `/api/auth/*` — завжди NetworkOnly (авторизація)
- `/api/appointments`, `/api/patients` — NetworkFirst (офлайн-fallback через Dexie)

PWA вимкнено в режимі розробки (`NODE_ENV=development`).

---

## Команди

```bash
npm run dev          # Dev-сервер
npm run build        # Продакшн-збірка
npm run lint         # ESLint
npm run db:seed      # Засідити демо-акаунти (ідемпотентно; працює і на проді)

npx prisma migrate dev       # Нова міграція (розробка) — автоматично сідить
npx prisma migrate reset     # Перестворити БД з нуля — автоматично сідить
npx prisma migrate deploy    # Застосувати міграції (CI/продакшн) — БЕЗ seed
npx prisma db seed           # Запустити seed окремо (prisma/seed.ts)
npx prisma generate          # Регенерувати клієнт (після змін схеми)
npx prisma studio            # Браузер БД
```
