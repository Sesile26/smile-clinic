/**
 * Self-contained demo seed for SmileClinic — everything a fresh clone needs to
 * run with realistic data, in dependency order:
 *
 *   1. Users (ADMIN / STAFF / DOCTOR / PATIENT)        — upsert (idempotent)
 *   2. Doctor specialty directory                       — upsert
 *   3. Demo buyers (PATIENT + Patient cards)            — upsert
 *   4. Product categories                               — upsert
 *   5. 100 products across the categories               — clear + refill
 *   6. 100 orders with items, varied status/date/ship   — clear + refill
 *
 * Idempotency:
 *   • accounts / categories / specialties → upsert (no duplicates on re-run);
 *   • products / orders → wiped and re-created, so it's EXACTLY 100 each time.
 * Cleanup tolerates an EMPTY database (deleteMany is a no-op), so the very first
 * seed on a fresh `migrate` works the same as a re-seed.
 *
 * Does NOT touch appointments / availability slots / notifications — booking demo
 * data is a separate script (prisma/seed.mjs).
 *
 * Run:  npx prisma db seed   (also auto-runs on `prisma migrate dev` / `reset`)
 * Stack: Prisma 7 client (lib/generated/prisma) + @prisma/adapter-pg, bcryptjs.
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "../lib/generated/prisma/client";
import {
  DeliveryMethod,
  OrderStatus,
  Role,
} from "../lib/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { slugify } from "../lib/slug";

// TEST DATA ONLY. One shared plaintext password for every seeded account;
// bcrypt-hashed (cost 12) before storage, never written raw.
const TEST_PASSWORD = "Password123";
const BCRYPT_COST = 12;

const ORDER_COUNT = 100;

// ─── Deterministic PRNG (so a re-seed produces the same demo set) ────────────
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260613);
const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** n distinct elements from arr. */
function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

// ─── Catalog templates ───────────────────────────────────────────────────────
interface CatTemplate {
  category: string;
  count: number;
  noun: string;
  brands: string[];
  variants: string[];
  /** price range, грн */
  price: [number, number];
  blurb: string;
}
const CATALOG: CatTemplate[] = [
  {
    category: "Зубні щітки",
    count: 14,
    noun: "Зубна щітка",
    brands: ["Curaprox", "Oral-B", "Splat", "Lacalut", "President", "Paro"],
    variants: ["мʼяка", "середня", "ультрамʼяка", "для чутливих ясен", "класична"],
    price: [80, 450],
    blurb: "Делікатне та ефективне очищення емалі й ясен щодня.",
  },
  {
    category: "Пасти",
    count: 14,
    noun: "Зубна паста",
    brands: ["Sensodyne", "R.O.C.S.", "Lacalut", "Splat", "Colgate", "Biorepair"],
    variants: ["відбілювальна", "для чутливих зубів", "захист від карієсу", "комплексний догляд", "з фтором"],
    price: [60, 320],
    blurb: "Щоденний догляд: захист від карієсу, свіжість і міцна емаль.",
  },
  {
    category: "Ополіскувачі",
    count: 13,
    noun: "Ополіскувач для рота",
    brands: ["Listerine", "Lacalut", "Parodontax", "Colgate", "President"],
    variants: ["антибактеріальний", "для ясен", "освіжаючий", "без спирту", "з фтором"],
    price: [90, 380],
    blurb: "Свіже дихання та додатковий захист у важкодоступних місцях.",
  },
  {
    category: "Іригатори",
    count: 9,
    noun: "Іригатор",
    brands: ["Philips", "Waterpik", "Revyline", "B.Well", "Oral-B"],
    variants: ["стаціонарний", "портативний", "для всієї родини", "з набором насадок"],
    price: [900, 3500],
    blurb: "Гідроочищення міжзубних проміжків та зон навколо брекетів.",
  },
  {
    category: "Нитка",
    count: 12,
    noun: "Зубна нитка",
    brands: ["Oral-B", "Splat", "Curaprox", "DenTek", "President"],
    variants: ["вощена", "мʼятна", "з фтором", "стрічкова", "для брекетів"],
    price: [50, 180],
    blurb: "Очищення контактних поверхонь зубів, де щітка не дістає.",
  },
  {
    category: "Відбілювання",
    count: 12,
    noun: "Засіб для відбілювання",
    brands: ["Crest", "R.O.C.S.", "Global White", "White Glo", "iWhite"],
    variants: ["смужки", "гель", "набір", "олівець", "капи"],
    price: [250, 1200],
    blurb: "Делікатне домашнє освітлення емалі на кілька тонів.",
  },
  {
    category: "Дитяча гігієна",
    count: 13,
    noun: "Дитячий догляд",
    brands: ["Splat Junior", "R.O.C.S. Kids", "Chicco", "Lacalut Kids", "Curaprox Kids"],
    variants: ["щітка", "паста", "набір", "напальчник", "ополіскувач"],
    price: [70, 300],
    blurb: "Безпечні засоби для дітей — привчають до гігієни з усмішкою.",
  },
  {
    category: "Аксесуари",
    count: 13,
    noun: "Аксесуар",
    brands: ["Curaprox", "Oral-B", "TePe", "Paro", "President"],
    variants: ["футляр для щітки", "тримач", "змінні насадки", "йоржики міжзубні", "скребок для язика"],
    price: [100, 900],
    blurb: "Корисні дрібниці для повного та зручного догляду.",
  },
];

interface GenProduct {
  name: string;
  description: string;
  longDescription: string;
  price: number;
  stock: number;
  categoryName: string;
  imageUrl: string;
  images: string[];
}
function generateProducts(): GenProduct[] {
  const out: GenProduct[] = [];
  let idx = 0;
  const ph = (text: string) =>
    `https://placehold.co/600x450/E8F5F1/0A1628?text=${encodeURIComponent(text)}`;
  for (const t of CATALOG) {
    const combos: { brand: string; variant: string }[] = [];
    for (const brand of t.brands) {
      for (const variant of t.variants) combos.push({ brand, variant });
    }
    for (const { brand, variant } of sample(combos, t.count)) {
      const name = `${t.noun} ${brand} «${variant}»`;
      const price = int(t.price[0], t.price[1]);
      // Deterministically ~13% out of stock (every 8th product), rest varied.
      const stock = idx % 8 === 0 ? 0 : int(1, 60);
      const imgCount = 2 + (idx % 2); // 2–3 photos per product (gallery demo)
      const images = [ph(brand), ...Array.from({ length: imgCount - 1 }, (_, i) => ph(`${brand} ${i + 2}`))];
      out.push({
        name,
        description: `${brand}: ${variant}. ${t.blurb}`,
        longDescription:
          `${name} — ${t.blurb} Засіб ${brand} у виконанні «${variant}» поєднує щоденну ефективність ` +
          `із бережним доглядом за порожниною рота. Рекомендуємо пацієнтам клініки для регулярного ` +
          `використання вдома — помітний результат за кілька тижнів. Зберігати в сухому місці за ` +
          `кімнатної температури, берегти від дітей. Виробник залишає за собою право оновлювати склад.`,
        price,
        stock,
        categoryName: t.category,
        imageUrl: images[0],
        images,
      });
      idx++;
    }
  }
  return out; // exactly sum(counts) = 100
}

const NP_CITIES = ["Київ", "Львів", "Одеса", "Харків", "Дніпро", "Полтава", "Вінниця", "Івано-Франківськ"];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_COST);

    // ── 1. Role accounts (upsert) ─────────────────────────────────────────────
    const admin = await prisma.user.upsert({
      where: { email: "admin@smileclinic.test" },
      update: { name: "Адміністратор Клініки", passwordHash, role: Role.ADMIN },
      create: { email: "admin@smileclinic.test", name: "Адміністратор Клініки", passwordHash, role: Role.ADMIN },
    });
    const staff = await prisma.user.upsert({
      where: { email: "staff@smileclinic.test" },
      update: { name: "Реєстратор", passwordHash, role: Role.STAFF },
      create: { email: "staff@smileclinic.test", name: "Реєстратор", passwordHash, role: Role.STAFF },
    });

    // ── 2. Specialty directory (upsert) ───────────────────────────────────────
    const specialtyNames = [
      "Терапевтична стоматологія",
      "Ортодонтія",
      "Хірургічна стоматологія",
      "Дитяча стоматологія",
      "Ортопедична стоматологія",
      "Пародонтологія",
      "Естетична стоматологія",
      "Імплантологія",
    ];
    for (const name of specialtyNames) {
      await prisma.specialty.upsert({ where: { name }, update: {}, create: { name } });
    }
    const therapy = await prisma.specialty.findUniqueOrThrow({
      where: { name: "Терапевтична стоматологія" },
    });

    // ── 3. Doctor account + linked card (upsert) ──────────────────────────────
    const doctorUser = await prisma.user.upsert({
      where: { email: "doctor@smileclinic.test" },
      update: { name: "Наталія Лисенко", passwordHash, role: Role.DOCTOR },
      create: { email: "doctor@smileclinic.test", name: "Наталія Лисенко", passwordHash, role: Role.DOCTOR },
    });
    const doctor = await prisma.doctor.upsert({
      where: { userId: doctorUser.id },
      update: { name: "Наталія Лисенко", specialtyId: therapy.id },
      create: { name: "Наталія Лисенко", specialtyId: therapy.id, userId: doctorUser.id },
    });

    // ── 4. Demo buyers: PATIENT users + Patient cards (upsert) ─────────────────
    const buyerSeeds = [
      { email: "patient1@smileclinic.test", name: "Тарас Бондаренко", phone: "+380501110001" },
      { email: "patient2@smileclinic.test", name: "Ірина Шевченко", phone: "+380501110002" },
      { email: "patient3@smileclinic.test", name: "Олег Мельник", phone: "+380671110003" },
      { email: "patient4@smileclinic.test", name: "Наталія Кравець", phone: "+380931110004" },
      { email: "patient5@smileclinic.test", name: "Андрій Поліщук", phone: "+380681110005" },
      { email: "patient6@smileclinic.test", name: "Софія Романенко", phone: "+380501110006" },
      { email: "patient7@smileclinic.test", name: "Дмитро Ткаченко", phone: "+380631110007" },
      { email: "patient8@smileclinic.test", name: "Олена Левчук", phone: "+380951110008" },
    ];
    const buyers: { userId: string; name: string; phone: string; email: string }[] = [];
    for (const b of buyerSeeds) {
      const patient = await prisma.patient.upsert({
        where: { email: b.email },
        update: { name: b.name, phone: b.phone },
        create: { name: b.name, email: b.email, phone: b.phone },
      });
      const user = await prisma.user.upsert({
        where: { email: b.email },
        update: { name: b.name, passwordHash, role: Role.PATIENT, patientId: patient.id },
        create: { email: b.email, name: b.name, passwordHash, role: Role.PATIENT, patientId: patient.id },
      });
      buyers.push({ userId: user.id, name: b.name, phone: b.phone, email: b.email });
    }

    // ── 5. Categories (upsert) ────────────────────────────────────────────────
    const categoryMap = new Map<string, string>();
    for (const t of CATALOG) {
      const slug = slugify(t.category);
      const cat = await prisma.category.upsert({
        where: { name: t.category },
        update: { slug },
        create: { name: t.category, slug },
      });
      categoryMap.set(t.category, cat.id);
    }

    // ── 6. CLEAN products + orders (dependency order; safe on empty DB) ────────
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();

    // ── 7. Seed 100 products ──────────────────────────────────────────────────
    const gen = generateProducts();
    await prisma.product.createMany({
      // Mark a handful of IN-STOCK products as featured (demo) — every 6th with
      // stock, so they actually surface first in the catalog.
      data: gen.map((p, i) => ({
        name: p.name,
        description: p.description,
        longDescription: p.longDescription,
        price: new Prisma.Decimal(p.price.toFixed(2)),
        stock: p.stock,
        categoryId: categoryMap.get(p.categoryName) ?? null,
        imageUrl: p.imageUrl,
        images: p.images,
        isActive: true,
        isFeatured: p.stock > 0 && i % 6 === 0,
      })),
    });
    const products = await prisma.product.findMany({
      select: { id: true, price: true },
    });

    // ── 8. Seed 100 orders (1–4 items, computed totals, varied status/date) ────
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const statuses = [
      OrderStatus.pending,
      OrderStatus.confirmed,
      OrderStatus.completed,
      OrderStatus.cancelled,
    ];

    let npCount = 0;
    for (let i = 0; i < ORDER_COUNT; i++) {
      const status = statuses[i % statuses.length]; // even split, 25 each
      // createdAt by status: pending freshest → cancelled/completed oldest.
      let ageDays: number;
      if (status === OrderStatus.pending) ageDays = rng() * 2;
      else if (status === OrderStatus.confirmed) ageDays = 1 + rng() * 6;
      else ageDays = 7 + rng() * 83; // completed / cancelled: 7–90 days
      const createdAt = new Date(now - ageDays * DAY - Math.floor(rng() * DAY));

      const buyer = pick(buyers);
      const chosen = sample(products, int(1, 4));
      const items = chosen.map((p) => ({
        productId: p.id,
        quantity: int(1, 3),
        priceAtPurchase: p.price,
      }));
      const totalCents = items.reduce(
        (sum, it) => sum + Math.round(Number(it.priceAtPurchase) * 100) * it.quantity,
        0,
      );

      const isNp = i % 2 === 0;
      if (isNp) npCount++;

      await prisma.order.create({
        data: {
          status,
          deliveryMethod: isNp ? DeliveryMethod.nova_poshta : DeliveryMethod.pickup,
          contactName: buyer.name,
          contactPhone: buyer.phone,
          npCity: isNp ? pick(NP_CITIES) : null,
          npWarehouse: isNp ? `Відділення №${int(1, 75)}` : null,
          total: new Prisma.Decimal((totalCents / 100).toFixed(2)),
          userId: buyer.userId,
          createdAt,
          items: { create: items },
        },
      });
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    const [productTotal, orderTotal] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
    ]);
    const byCat = await prisma.product.groupBy({ by: ["categoryId"], _count: true });
    const byStatus = await prisma.order.groupBy({ by: ["status"], _count: true });
    const oos = await prisma.product.count({ where: { stock: 0 } });
    const idToCat = new Map([...categoryMap].map(([n, id]) => [id, n]));

    console.log(`\n✔ Seed complete. Test password for ALL accounts: ${TEST_PASSWORD}`);
    console.table([
      { role: "ADMIN", email: admin.email },
      { role: "STAFF", email: staff.email },
      { role: "DOCTOR", email: doctorUser.email, linked: `${doctor.name} · ${therapy.name}` },
      ...buyers.map((b) => ({ role: "PATIENT", email: b.email, linked: b.name })),
    ]);
    console.log(`Products: ${productTotal} (out of stock: ${oos})`);
    console.table(
      byCat.map((g) => ({ category: idToCat.get(g.categoryId ?? "") ?? "—", products: g._count })),
    );
    console.log(`Orders: ${orderTotal} · Nova Poshta: ${npCount} · pickup: ${orderTotal - npCount}`);
    console.table(byStatus.map((g) => ({ status: g.status, orders: g._count })));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
