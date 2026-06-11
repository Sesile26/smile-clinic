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
import type { ApiProduct } from "@/lib/shop-types";

/**
 * Products.
 *
 *  GET   → active products (isActive=true). Public — the catalog is open, BUT
 *          the exact stock count is sent only to STAFF/ADMIN; patients/guests
 *          receive just an `inStock` boolean (toApiProduct gates this).
 *  POST  → create a product. STAFF/ADMIN only (re-checked server-side).
 *
 * Money: Product.price is a DB Decimal; we send a Number for display. Order
 * totals are computed server-side from the DB, never from these values.
 */

// ─── GET (public catalog; stock numbers gated by role) ───────────────────────

export async function GET() {
  // Role decides ONLY whether exact stock is exposed — the catalog itself is
  // public, so a missing/expired session just means "no stock numbers".
  const actor = await getActor();
  const includeStock = !!actor && isStaff(actor.role);
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
