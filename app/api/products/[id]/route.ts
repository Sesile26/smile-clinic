import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { ApiProduct } from "@/lib/shop-types";

/**
 * Single product mutations — STAFF/ADMIN only (re-checked server-side).
 *
 *  PATCH  → edit fields (name, description, price, stock, category, imageUrl).
 *  DELETE → SOFT delete (isActive=false). We never hard-delete: OrderItem rows
 *           reference products via a Restrict FK, so removing a product with
 *           order history would be blocked anyway. Soft delete keeps history
 *           intact and hides the item from the catalog.
 */

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Build a partial update, validating only the fields actually provided.
  const data: Prisma.ProductUpdateInput = {};

  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.trim().length < 2) {
      return shopError(400, "validation", "Невалідна назва");
    }
    data.name = b.name.trim();
  }
  if (b.description !== undefined) {
    data.description =
      typeof b.description === "string" && b.description.trim()
        ? b.description.trim()
        : null;
  }
  if (b.price !== undefined) {
    const priceNum = Number(b.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return shopError(400, "validation", "Невалідна ціна");
    }
    data.price = new Prisma.Decimal(priceNum.toFixed(2));
  }
  if (b.stock !== undefined) {
    const stockNum = Number(b.stock);
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      return shopError(400, "validation", "Невалідний залишок");
    }
    data.stock = stockNum;
  }
  if (b.category !== undefined) {
    data.category =
      typeof b.category === "string" && b.category.trim()
        ? b.category.trim()
        : null;
  }
  if (b.imageUrl !== undefined) {
    data.imageUrl =
      typeof b.imageUrl === "string" && b.imageUrl.trim()
        ? b.imageUrl.trim()
        : null;
  }
  if (typeof b.isActive === "boolean") {
    data.isActive = b.isActive;
  }

  try {
    const updated = await prisma.product.update({
      where: { id },
      data,
      select: SELECT,
    });
    return NextResponse.json<ApiProduct>(toApiProduct(updated));
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return shopError(404, "not_found", "Товар не знайдено");
    }
    console.error("PATCH /api/products/[id] failed", err);
    return shopError(500, "server", "Не вдалося оновити товар");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

  const { id } = await params;

  try {
    // Soft delete — keep the row, just hide it from the catalog.
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
      select: { id: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return shopError(404, "not_found", "Товар не знайдено");
    }
    console.error("DELETE /api/products/[id] failed", err);
    return shopError(500, "server", "Не вдалося видалити товар");
  }
}
