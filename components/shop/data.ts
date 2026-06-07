/**
 * Mock data + pure helpers for the /shop UI.
 *
 * FRONTEND-ONLY: no API, no DB, no fetch. Everything here is a hardcoded mock
 * so the storefront, cart, and checkout can be exercised end-to-end visually.
 * Prices are in UAH (грн).
 */

export type Category = "Догляд" | "Відбілювання" | "Дитячі" | "Аксесуари";

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Price in UAH (грн), integer. */
  price: number;
  category: Category;
}

/** Demo-only switch to preview async UI states without a server. */
export type DemoState = "ready" | "loading" | "empty" | "error";

export type DeliveryMethod = "pickup" | "nova";

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const CATEGORIES: Category[] = [
  "Догляд",
  "Відбілювання",
  "Дитячі",
  "Аксесуари",
];

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Зубна паста Mint Fresh",
    description: "Щоденний захист емалі з фтором і м’ятою. 75 мл.",
    price: 189,
    category: "Догляд",
  },
  {
    id: "p2",
    name: "Електрична щітка SonicPro",
    description: "Звукова технологія, 3 режими, таймер 2 хв.",
    price: 1499,
    category: "Аксесуари",
  },
  {
    id: "p3",
    name: "Набір для відбілювання White+",
    description: "Гель + капа. Освітлення до 4 тонів удома.",
    price: 899,
    category: "Відбілювання",
  },
  {
    id: "p4",
    name: "Зубна нитка Silk Floss",
    description: "Вощена нитка з ароматом м’яти. 50 м.",
    price: 99,
    category: "Догляд",
  },
  {
    id: "p5",
    name: "Ополіскувач Mint Care",
    description: "Антибактеріальний, без спирту. 500 мл.",
    price: 149,
    category: "Догляд",
  },
  {
    id: "p6",
    name: "Дитяча паста Smile Kids",
    description: "Безпечна формула від 1 року, смак банана. 50 мл.",
    price: 129,
    category: "Дитячі",
  },
  {
    id: "p7",
    name: "Іригатор AquaJet",
    description: "Портативний, 4 насадки, 3 режими тиску.",
    price: 1990,
    category: "Аксесуари",
  },
  {
    id: "p8",
    name: "Відбілювальні смужки Bright",
    description: "14 пар смужок на 2 тижні курсу.",
    price: 649,
    category: "Відбілювання",
  },
  {
    id: "p9",
    name: "Дитяча щітка Tooth Friends",
    description: "М’яка щетина, нековзка ручка. Від 3 років.",
    price: 159,
    category: "Дитячі",
  },
];

// ─── Delivery (mock Nova Poshta data — NOT integrated) ───────────────────────

export const CLINIC_ADDRESS =
  "вул. Хорива, 24, Київ · Пн–Сб 8:00–22:00";

export interface City {
  name: string;
  branches: string[];
}

/** Static city → branch lists. The branch select depends on the chosen city. */
export const CITIES: City[] = [
  {
    name: "Київ",
    branches: [
      "Відділення №1 — вул. Хрещатик, 22",
      "Відділення №12 — вул. Хорива, 24",
      "Поштомат №20124 — ТРЦ Gulliver",
    ],
  },
  {
    name: "Львів",
    branches: [
      "Відділення №3 — пр. Свободи, 5",
      "Відділення №8 — вул. Городоцька, 100",
    ],
  },
  {
    name: "Одеса",
    branches: [
      "Відділення №2 — вул. Дерибасівська, 1",
      "Відділення №15 — вул. Грецька, 30",
    ],
  },
  {
    name: "Харків",
    branches: [
      "Відділення №5 — пл. Свободи, 7",
      "Відділення №9 — вул. Сумська, 40",
    ],
  },
  {
    name: "Дніпро",
    branches: [
      "Відділення №4 — пр. Яворницького, 50",
      "Відділення №11 — вул. Глинки, 2",
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format an integer UAH amount as "1 499 ₴" (uk grouping). */
export function formatUAH(amount: number): string {
  return `${amount.toLocaleString("uk-UA")} ₴`;
}

/** Canonical UA phone check (matches schemas/register). */
export function isValidUaPhone(value: string): boolean {
  return /^\+380\d{9}$/.test(value.replace(/\s/g, ""));
}
