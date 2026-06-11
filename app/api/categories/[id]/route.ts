import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { ApiCategory } from "@/lib/shop-types";

/**
 * Single category mutations — STAFF/ADMIN only (re-checked server-side).
 *
 *  PATCH  → rename. Same uniqueness rule as create (P2002 → "вже існує").
 *           Products keep pointing at the category by id, so the new name is
 *           reflected everywhere automatically.
 *  DELETE → deletion policy:
 *           • no products            → delete immediately;
 *           • products + ?reassign=null → move them to "Без категорії"
 *             (categoryId = null) AND delete, in ONE transaction;
 *           • products + no param    → 409 with the product count, so the UI
 *             can ask the user to confirm the reassignment first.
 *           (The schema FK is onDelete: SetNull, so a bare delete would also
 *           null the products — but we require the explicit param as a guard
 *           against accidental data loss, and do the move in a transaction.)
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
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
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string" || name.trim() === "") {
    return shopError(400, "validation", "Вкажіть назву категорії");
  }

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: { name: name.trim() },
      select: { id: true, name: true, _count: { select: { products: true } } },
    });
    return NextResponse.json<ApiCategory>({
      id: updated.id,
      name: updated.name,
      productCount: updated._count.products,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return shopError(409, "conflict", "Така категорія вже існує");
      }
      if (err.code === "P2025") {
        return shopError(404, "not_found", "Категорію не знайдено");
      }
    }
    console.error("PATCH /api/categories/[id] failed", err);
    return shopError(500, "server", "Не вдалося перейменувати категорію");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  // Explicit opt-in to move products to "Без категорії" before deleting.
  const reassign = searchParams.get("reassign") === "null";

  try {
    const category = await prisma.category.findUnique({
      where: { id },
      select: { id: true, _count: { select: { products: true } } },
    });
    if (!category) {
      return shopError(404, "not_found", "Категорію не знайдено");
    }

    const productCount = category._count.products;

    if (productCount > 0 && !reassign) {
      // Block accidental deletion — the UI confirms and retries with reassign.
      return NextResponse.json(
        {
          error: `У категорії ${productCount} товар(ів)`,
          code: "conflict",
          productCount,
        },
        { status: 409 },
      );
    }

    if (productCount > 0) {
      // Move products to "Без категорії" and delete, atomically.
      await prisma.$transaction([
        prisma.product.updateMany({
          where: { categoryId: id },
          data: { categoryId: null },
        }),
        prisma.category.delete({ where: { id } }),
      ]);
    } else {
      await prisma.category.delete({ where: { id } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return shopError(404, "not_found", "Категорію не знайдено");
    }
    console.error("DELETE /api/categories/[id] failed", err);
    return shopError(500, "server", "Не вдалося видалити категорію");
  }
}
