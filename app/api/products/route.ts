import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { ApiProduct } from "@/lib/shop-types";

/**
 * Products.
 *
 *  GET   → active products (isActive=true). Public — the catalog is open.
 *  POST  → create a product. STAFF/ADMIN only (re-checked server-side).
 *
 * Money: Product.price is a DB Decimal; we send a Number for display. Order
 * totals are computed server-side from the DB, never from these values.
 */

function toApiProduct(p: {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  imageUrl: string | null;
  category: string | null;
  stock: number;
  isActive: boolean;
}): ApiProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price.toNumber(),
    imageUrl: p.imageUrl,
    category: p.category,
    stock: p.stock,
    isActive: p.isActive,
  };
}

const SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  imageUrl: true,
  category: true,
  stock: true,
  isActive: true,
} as const;

// ─── GET (public catalog) ────────────────────────────────────────────────────

export async function GET() {
  try {
    const rows = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    });
    return NextResponse.json<ApiProduct[]>(rows.map(toApiProduct));
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
    category,
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
        category:
          typeof category === "string" && category.trim()
            ? category.trim()
            : null,
        imageUrl:
          typeof imageUrl === "string" && imageUrl.trim()
            ? imageUrl.trim()
            : null,
      },
      select: SELECT,
    });
    return NextResponse.json<ApiProduct>(toApiProduct(created), { status: 201 });
  } catch (err) {
    console.error("POST /api/products failed", err);
    return shopError(500, "server", "Не вдалося створити товар");
  }
}
