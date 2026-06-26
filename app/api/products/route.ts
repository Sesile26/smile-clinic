import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  isStaff,
  shopError,
  toApiProduct,
  PRODUCT_SELECT,
} from "@/lib/shop-server";
import type { ApiProduct, ProductsPage } from "@/lib/shop-types";
import { UNCATEGORIZED_VALUE } from "@/lib/shop-types";

/**
 * Products.
 *
 *  GET   → active products (isActive=true). Public — the catalog is open, BUT
 *          the exact stock count is sent only to STAFF/ADMIN; patients/guests
 *          receive just an `inStock` boolean (toApiProduct gates this).
 *
 *          Two response shapes by request:
 *           • NO `limit` param → the full ApiProduct[] (legacy: admin list, cart
 *             validation, offline mirror).
 *           • `limit` present  → cursor-paginated ProductsPage for the storefront
 *             feed. Supports `q` (name/description search), `category` filter, and
 *             a stock-first sort, with a composite cursor consistent with that
 *             sort so infinite scroll has no gaps/dupes.
 *
 *  POST  → create a product. STAFF/ADMIN only (re-checked server-side).
 *
 * Money: Product.price is a DB Decimal; we send a Number for display. Order
 * totals are computed server-side from the DB, never from these values.
 */

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

/** Escape LIKE/ILIKE wildcards so a user's "%"/"_" are matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Max gallery photos per product (variant A). */
const MAX_IMAGES = 8;

/**
 * Validate the gallery payload: an array of http(s) URL strings, trimmed,
 * de-duped (order preserved), capped at MAX_IMAGES. Returns the cleaned array,
 * or `null` when the shape is invalid (→ 400). `undefined` input → [].
 */
function parseImages(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s) continue;
    if (!/^https?:\/\//i.test(s) || s.length > 2048) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_IMAGES);
}

// Cursor = the last row's sort key (rank, createdAt, id), base64-encoded. `rank`
// is the primary sort group: 2 = featured & in-stock, 1 = in-stock, 0 =
// out-of-stock (featured doesn't lift a 0-stock product — it can't be bought).
type Rank = 0 | 1 | 2;
interface Cursor {
  r: Rank;
  t: string; // createdAt ISO
  id: string;
}
function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}
function decodeCursor(raw: string): Cursor | null {
  try {
    const o = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (
      (o.r === 0 || o.r === 1 || o.r === 2) &&
      typeof o.t === "string" &&
      typeof o.id === "string"
    ) {
      return o as Cursor;
    }
  } catch {
    /* malformed cursor */
  }
  return null;
}

/** Rank of a row: featured+in-stock (2) > in-stock (1) > out-of-stock (0). */
function rankOf(stock: number, isFeatured: boolean): Rank {
  if (stock <= 0) return 0;
  return isFeatured ? 2 : 1;
}

// SQL form of the same rank, used in both the keyset filter and ORDER BY.
const RANK_SQL = Prisma.sql`(CASE WHEN p.stock > 0 AND p."isFeatured" THEN 2 WHEN p.stock > 0 THEN 1 ELSE 0 END)`;

type RawRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  price: number;
  createdAt: Date;
};

function rawToApi(r: RawRow, includeStock: boolean): ApiProduct {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    price: Number(r.price),
    imageUrl: r.imageUrl,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    inStock: r.stock > 0,
    ...(includeStock ? { stock: r.stock } : {}),
    isActive: r.isActive,
    isFeatured: r.isFeatured,
  };
}

// ─── GET (public catalog; stock numbers gated by role) ───────────────────────

export async function GET(request: Request) {
  // Role decides ONLY whether exact stock is exposed — the catalog itself is
  // public, so a missing/expired session just means "no stock numbers".
  const actor = await getActor();
  const includeStock = !!actor && isStaff(actor.role);

  const { searchParams } = new URL(request.url);

  // ── Legacy mode: no `limit` → full array (admin/cart/categories/mirror). ──
  if (!searchParams.has("limit")) {
    try {
      const rows = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: PRODUCT_SELECT,
      });
      return NextResponse.json<ApiProduct[]>(
        rows.map((p) => toApiProduct(p, includeStock)),
      );
    } catch (err) {
      console.error("GET /api/products failed", err);
      return shopError(500, "server", "Не вдалося завантажити товари");
    }
  }

  // ── Paginated storefront feed ────────────────────────────────────────────
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : DEFAULT_LIMIT;
  const q = (searchParams.get("q") ?? "").trim();
  const category = searchParams.get("category");
  const cursor = searchParams.get("cursor")
    ? decodeCursor(searchParams.get("cursor")!)
    : null;

  // The URL carries a category SLUG — resolve it to an id (or null for
  // "Без категорії"). An unknown slug (removed / bad shared link) → empty.
  let categoryId: string | null | undefined; // undefined → no category filter
  if (category === UNCATEGORIZED_VALUE) {
    categoryId = null;
  } else if (category && category !== "all") {
    const cat = await prisma.category.findUnique({
      where: { slug: category },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json<ProductsPage>({
        items: [],
        nextCursor: null,
        hasMore: false,
        total: 0,
      });
    }
    categoryId = cat.id;
  }

  // Filters shared by the page query and the total count.
  const filters: Prisma.Sql[] = [Prisma.sql`p."isActive" = true`];
  if (categoryId === null) {
    filters.push(Prisma.sql`p."categoryId" IS NULL`);
  } else if (typeof categoryId === "string") {
    filters.push(Prisma.sql`p."categoryId" = ${categoryId}`);
  }
  if (q) {
    const like = `%${escapeLike(q)}%`;
    filters.push(Prisma.sql`(p."name" ILIKE ${like} OR p."description" ILIKE ${like})`);
  }

  // Keyset: rows strictly AFTER the cursor in (rank DESC, createdAt DESC, id DESC).
  const pageFilters = [...filters];
  if (cursor) {
    const t = new Date(cursor.t);
    pageFilters.push(Prisma.sql`(
      ${RANK_SQL} < ${cursor.r}
      OR (${RANK_SQL} = ${cursor.r} AND p."createdAt" < ${t})
      OR (${RANK_SQL} = ${cursor.r} AND p."createdAt" = ${t} AND p.id < ${cursor.id})
    )`);
  }

  try {
    const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT p.id, p.name, p.description, p."imageUrl", p."categoryId",
             c.name AS "categoryName", p.stock, p."isActive", p."isFeatured",
             p."price"::float8 AS price, p."createdAt"
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE ${Prisma.join(pageFilters, " AND ")}
      ORDER BY ${RANK_SQL} DESC, p."createdAt" DESC, p.id DESC
      LIMIT ${limit + 1}
    `);

    const [{ count }] = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT count(*)::int AS count
      FROM "Product" p
      WHERE ${Prisma.join(filters, " AND ")}
    `);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            r: rankOf(last.stock, last.isFeatured),
            t: last.createdAt.toISOString(),
            id: last.id,
          })
        : null;

    return NextResponse.json<ProductsPage>({
      items: pageRows.map((r) => rawToApi(r, includeStock)),
      nextCursor,
      hasMore,
      total: count,
    });
  } catch (err) {
    console.error("GET /api/products (feed) failed", err);
    return shopError(500, "server", "Не вдалося завантажити товари");
  }
}

// ─── POST (create) — STAFF/ADMIN ─────────────────────────────────────────────

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }

  const {
    name,
    description,
    price,
    stock,
    categoryId,
    imageUrl,
    images,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 2) {
    return shopError(400, "validation", "Вкажіть назву (мін. 2 символи)");
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return shopError(400, "validation", "Невалідна ціна");
  }
  const stockNum = Number(stock);
  if (!Number.isInteger(stockNum) || stockNum < 0) {
    return shopError(400, "validation", "Невалідний залишок");
  }
  // categoryId: a non-empty string (existing category) or null ("Без категорії").
  if (
    categoryId != null &&
    (typeof categoryId !== "string" || categoryId.trim() === "")
  ) {
    return shopError(400, "validation", "Невалідна категорія");
  }
  const imagesArr = parseImages(images);
  if (imagesArr === null) {
    return shopError(400, "validation", "Невалідний список зображень");
  }

  try {
    const created = await prisma.product.create({
      data: {
        name: name.trim(),
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
        price: new Prisma.Decimal(priceNum.toFixed(2)),
        stock: stockNum,
        categoryId: (categoryId as string | null) ?? null,
        imageUrl:
          typeof imageUrl === "string" && imageUrl.trim()
            ? imageUrl.trim()
            : null,
        images: imagesArr,
      },
      select: PRODUCT_SELECT,
    });
    // Creator is STAFF/ADMIN → return the exact stock.
    return NextResponse.json<ApiProduct>(toApiProduct(created, true), {
      status: 201,
    });
  } catch (err) {
    // FK violation → the categoryId doesn't reference a real category.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return shopError(400, "validation", "Категорію не знайдено");
    }
    console.error("POST /api/products failed", err);
    return shopError(500, "server", "Не вдалося створити товар");
  }
}
