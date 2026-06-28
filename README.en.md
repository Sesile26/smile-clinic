[🇺🇦 Українська](README.md) | **🇬🇧 English**

# SmileClinic

A boutique dental-clinic **PWA**: patients book appointments against a per-doctor
slot calendar, and the same app runs a small e-commerce store for dental-care
products with a cart, checkout and Nova Poshta delivery. Built with the Next.js 16
App Router, role-based auth (admin / staff / doctor / patient), realtime in-app
notifications, native Web Push, and an offline mode backed by a service worker +
local mirror.

## Live demo

**https://smile-clinic-five.vercel.app/**

Sign in with email + password (one shared demo password: **`Password123`**). These
are intentional public demo accounts seeded into every environment — never reuse
this password anywhere real.

| Role | Email | Sees on `/booking` |
|---|---|---|
| ADMIN | `admin@smileclinic.test` | Manages slots for every doctor + admin panel |
| STAFF | `staff@smileclinic.test` | Manages slots for every doctor |
| DOCTOR | `doctor@smileclinic.test` | Own schedule (Наталія Лисенко · Терапевтична стоматологія) |
| PATIENT | `patient1@smileclinic.test` … `patient8@smileclinic.test` | Books free slots, shops the store |

> Tip: start as `admin@smileclinic.test` to see roles, the admin panel and the
> store back office; open `patient1@smileclinic.test` in a second browser to book
> against the admin/doctor's slots and watch the notification fire.

## Tech stack

Versions are pinned in [`package.json`](package.json).

**Frontend** — Next.js 16.2 (App Router) · React 19.2 · TypeScript 5 · Tailwind CSS 4 · React Hook Form 7 + Zod 4

**Backend** — Next.js Route Handlers (Node.js runtime) · Auth.js v5 (`next-auth` 5 beta) with `@auth/prisma-adapter` · bcryptjs (credentials)

**Database** — PostgreSQL · Prisma 7 (`@prisma/client` + `@prisma/adapter-pg` over `pg`)

**PWA / realtime / infra** — `@ducanh2912/next-pwa` 10 (Workbox service worker) · Dexie 4 (offline mirror) · Server-Sent Events (in-app notifications) · `web-push` 3 (native Web Push, VAPID) · `@vercel/blob` (product images) · deployed on **Vercel** with a **Neon** Postgres database

## Features

- **Appointment booking** — per-doctor weekly slot calendar (08:00–22:00), patients grab free slots, staff/doctors manage availability, with booking limits and rate limiting.
- **Role-based access** — ADMIN / STAFF / DOCTOR / PATIENT; roles assigned via seed or an email allowlist on first Google sign-in.
- **Online store** — product catalog with a gallery, categories, cart, checkout and orders.
- **Nova Poshta delivery** — branch lookup at checkout (optional API key).
- **Realtime notifications** — DB-backed notifications delivered live over SSE to an in-app bell (new bookings, order/appointment status, role changes).
- **Native Web Push** — opt-in push notifications to the device (Android), reusing the same notification events.
- **Offline mode (PWA)** — installable app; a Workbox service worker caches the shell and a Dexie mirror serves user data offline.
- **Admin panel** — manage doctors, slots, products, categories and orders.

## Local setup

### Prerequisites

- **Node.js 20+** (required by Next.js 16)
- **PostgreSQL** running locally (or any Postgres connection string)
- **npm** (the repo uses npm scripts and a `package-lock.json`)

### 1. Clone + install

```bash
git clone <repo-url> && cd smile-clinic
npm install
```

`npm install` runs a `postinstall` hook (`prisma generate`) that generates the
Prisma client to a **custom path**, [`lib/generated/prisma`](lib/generated/prisma)
(set by `generator client.output` in the schema). The app imports from there, so
the client must be generated before `dev`/`build` — `postinstall` covers the fresh
install; re-run `npx prisma generate` after any schema change, otherwise the build
fails on the missing client.

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in [`.env`](.env.example) (git-ignored — never commit it):

| Variable | Required | What it is / where to get it |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (pooled). |
| `DATABASE_URL_UNPOOLED` | optional | Direct (non-pooling) connection string — used by `prisma migrate deploy` / seed on hosts like Neon. Locally you can reuse `DATABASE_URL`. |
| `AUTH_SECRET` | ✅ | Session-signing secret. Generate with `npx auth secret`. |
| `AUTH_URL` | optional | Canonical app URL (e.g. `http://localhost:3000` in dev). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional | Google OAuth credentials. Leave empty to sign in with email + password only. |
| `AUTH_ADMIN_EMAILS` | optional | Comma-separated emails granted **ADMIN** on first Google sign-in. |
| `AUTH_STAFF_EMAILS` | optional | Comma-separated emails granted **STAFF** on first Google sign-in. |
| `AUTH_DOCTOR_EMAILS` | optional | Comma-separated emails granted **DOCTOR** on first Google sign-in. |
| `NOVA_POSHTA_API_KEY` | optional | Nova Poshta API key (delivery branch lookup at checkout). |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | optional | Vercel Blob (product image uploads). Provided by the Vercel integration in prod. |
| `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | optional | Web Push (VAPID). Generate **once** with `npx web-push generate-vapid-keys`; `VAPID_SUBJECT` is a `mailto:` contact. Without these, push is silently skipped. |

Optional tunables (have defaults): `MAX_ACTIVE_APPOINTMENTS`, `BOOKING_RATE_LIMIT`,
`BOOKING_RATE_WINDOW_MS`.

### 3. Database — migrate, generate, seed

```bash
npx prisma migrate dev      # applies migrations AND auto-seeds demo data
```

`prisma migrate dev` (and `prisma migrate reset`) run the seed automatically (the
command lives in `prisma.config.ts → migrations.seed`, mirrored in
`package.json → prisma.seed`). The seed ([`prisma/seed.ts`](prisma/seed.ts)) is
idempotent and creates the demo accounts above plus specialties, 8 categories,
100 products and 100 orders.

```bash
npx prisma migrate reset    # drop, re-migrate, re-seed from scratch
npm run db:seed             # run the seed by itself
npx prisma generate         # regenerate the client after a schema change
```

> An optional demo doctor schedule (bookable slots) is seeded separately:
> `node prisma/seed.mjs`.

On a production host, `migrate deploy` does **not** seed — run it as a separate
step: `npx prisma migrate deploy && npm run db:seed`.

### 4. Run the dev server

```bash
npm run dev                 # http://localhost:3000
```

> **PWA & Web Push are disabled in development** (`disable: NODE_ENV === "development"`
> in [`next.config.ts`](next.config.ts)). The service worker is not registered and
> push won't fire locally — that's expected. To exercise the SW / install prompt /
> Web Push, run a production build (`npm run build && npm run start`) or test on the
> deployed Vercel site (with the `VAPID_*` env vars set).

## Deployment

Deployed on **Vercel** (build command `prisma generate && next build --webpack`,
see [`vercel.json`](vercel.json)) against a **Neon** Postgres database. Set the same
environment variables in the Vercel project settings; apply migrations with
`prisma migrate deploy` and seed once with `npm run db:seed`. No secrets live in the
repo — only placeholders in `.env.example`.

## Scripts

From [`package.json`](package.json):

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `next dev` | Start the dev server on :3000. |
| `npm run build` | `next build --webpack` | Production build (webpack — required by next-pwa). |
| `npm run start` | `next start` | Serve the production build. |
| `npm run lint` | `eslint` | Lint the project. |
| `npm run db:seed` | `node --import tsx prisma/seed.ts` | Seed demo data (idempotent). |
| `npm run icons` | `node scripts/generate-icons.mjs` | Regenerate PWA icons. |
| `postinstall` | `prisma generate` | Auto-generates the Prisma client after install. |

Common Prisma commands: `npx prisma migrate dev` (new migration + seed),
`npx prisma migrate reset` (rebuild + seed), `npx prisma migrate deploy` (CI/prod,
no seed), `npx prisma generate` (regenerate client), `npx prisma studio` (DB browser).
