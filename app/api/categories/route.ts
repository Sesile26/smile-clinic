import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { ApiCategory } from "@/lib/shop-types";

/**
 * Categories.
 *
 *  GET  → list with product counts. Public — the catalog filter and the form
 *         select read it; no stock or private data is exposed.
 *  POST → create. STAFF/ADMIN only (re-checked server-side). Name must be
 *         non-empty and unique (P2002 → friendly "вже існує").
 */

function toApiCategory(c: {
  id: string;
  name: string;
  _count: { products: number };
}): ApiCategory {
  return { id: c.id, name: c.name, productCount: c._count.products };
}

export async function GET() {
  try {
    const rows = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { products: true } } },
    });
    return NextResponse.json<ApiCategory[]>(rows.map(toApiCategory));
  } catch (err) {
    console.error("GET /api/categories failed", err);
    return shopError(500, "server", "Не вдалося завантажити категорії");
  }
}

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
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string" || name.trim() === "") {
    return shopError(400, "validation", "Вкажіть назву категорії");
  }

  try {
    const created = await prisma.category.create({
      data: { name: name.trim() },
      select: { id: true, name: true, _count: { select: { products: true } } },
    });
    return NextResponse.json<ApiCategory>(toApiCategory(created), {
      status: 201,
    });
  } catch (err) {
    // Unique violation on `name`.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return shopError(409, "conflict", "Така категорія вже існує");
    }
    console.error("POST /api/categories failed", err);
    return shopError(500, "server", "Не вдалося створити категорію");
  }
}
