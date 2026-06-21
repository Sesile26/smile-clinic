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
import type { ApiProduct, ApiProductDetail } from "@/lib/shop-types";

/**
 *  GET    → public product detail (with category + a few same-category items).
 *           Role-gated stock: STAFF/ADMIN get the exact `stock`, buyers/guests
 *           only `inStock` (same rule as the catalog). 404 when missing or
 *           soft-deleted (isActive=false).
 *  PATCH  → edit fields. STAFF/ADMIN only (re-checked server-side).
 *  DELETE → SOFT delete (isActive=false). We never hard-delete: OrderItem rows
 *           reference products via a Restrict FK, so removing a product with
 *           order history would be blocked anyway. Soft delete keeps history
 *           intact and hides the item from the catalog.
 */

// Detail select = the card columns + the page-only rich fields (+ category slug).
const DETAIL_SELECT = {
  ...PRODUCT_SELECT,
  category: { select: { name: true, slug: true } },
  longDescription: true,
  images: true,
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Role decides ONLY whether the exact stock is exposed — the page is public.
  const actor = await getActor();
  const includeStock = !!actor && isStaff(actor.role);

  try {
    const p = await prisma.product.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    // Soft-deleted or unknown → 404 (a buyer must not reach an inactive item).
    if (!p || !p.isActive) {
      return shopError(404, "not_found", "Товар не знайдено");
    }

    // A few other active products in the same category (in-stock first).
    const similar = p.categoryId
      ? await prisma.product.findMany({
          where: { isActive: true, categoryId: p.categoryId, id: { not: id } },
          orderBy: [{ stock: "desc" }, { createdAt: "desc" }],
          take: 4,
          select: PRODUCT_SELECT,
        })
      : [];

    const detail: ApiProductDetail = {
      ...toApiProduct(p, includeStock),
      longDescription: p.longDescription,
      categorySlug: p.category?.slug ?? null,
      images: p.images,
      similar: similar.map((s) => toApiProduct(s, includeStock)),
    };
    return NextResponse.json<ApiProductDetail>(detail);
  } catch (err) {
    console.error("GET /api/products/[id] failed", err);
    return shopError(500, "server", "Не вдалося завантажити товар");
  }
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
  // Unchecked input so the categoryId FK scalar can be set directly.
  const data: Prisma.ProductUncheckedUpdateInput = {};

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
  if (b.categoryId !== undefined) {
    if (
      b.categoryId != null &&
      (typeof b.categoryId !== "string" || b.categoryId.trim() === "")
    ) {
      return shopError(400, "validation", "Невалідна категорія");
    }
    // Set the FK scalar directly (null → "Без категорії").
    data.categoryId = (b.categoryId as string | null) ?? null;
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
  if (typeof b.isFeatured === "boolean") {
    data.isFeatured = b.isFeatured;
  }

  try {
    const updated = await prisma.product.update({
      where: { id },
      data,
      select: PRODUCT_SELECT,
    });
    return NextResponse.json<ApiProduct>(toApiProduct(updated, true));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return shopError(404, "not_found", "Товар не знайдено");
      }
      if (err.code === "P2003") {
        return shopError(400, "validation", "Категорію не знайдено");
      }
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
