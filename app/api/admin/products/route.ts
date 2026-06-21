import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import { UNCATEGORIZED_VALUE, type ApiProduct } from "@/lib/shop-types";
import {
  PRODUCT_DEFAULT_PAGE_SIZE,
  PRODUCT_PAGE_SIZES,
  type AdminProductsPage,
} from "@/lib/admin-products";

/**
 * GET /api/admin/products — product list for the admin table (STAFF/ADMIN).
 *
 * Unlike the public storefront feed (/api/products, cursor-paginated, isActive
 * only): this is OFFSET pagination (page / pageSize 25|50|100), shows ALL
 * products including hidden (isActive=false) so they can be managed, and exposes
 * exact stock + isFeatured. Composition: category(slug) + name search → sort
 * (featured&in-stock → in-stock → out-of-stock, then name) → page slice. The
 * rank is a CASE expression, so this is raw SQL (Prisma can't orderBy it),
 * consistent with the feed / customers list.
 */

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

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
};

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) return shopError(403, "forbidden", "Немає доступу");

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = PRODUCT_PAGE_SIZES.includes(
    rawSize as (typeof PRODUCT_PAGE_SIZES)[number],
  )
    ? rawSize
    : PRODUCT_DEFAULT_PAGE_SIZE;
  const q = (searchParams.get("q") ?? "").trim();
  const category = searchParams.get("category"); // slug | "all" | uncategorized
  const offset = (page - 1) * pageSize;

  // Resolve the category SLUG (same param as /shop) to a filter.
  const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (category === UNCATEGORIZED_VALUE) {
    filters.push(Prisma.sql`p."categoryId" IS NULL`);
  } else if (category && category !== "all") {
    const cat = await prisma.category.findUnique({
      where: { slug: category },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json<AdminProductsPage>({
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
      });
    }
    filters.push(Prisma.sql`p."categoryId" = ${cat.id}`);
  }
  if (q) {
    const like = `%${escapeLike(q)}%`;
    filters.push(Prisma.sql`(p."name" ILIKE ${like} OR p."description" ILIKE ${like})`);
  }
  const where = Prisma.join(filters, " AND ");

  try {
    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT p.id, p.name, p.description, p."imageUrl", p."categoryId",
               c.name AS "categoryName", p.stock, p."isActive", p."isFeatured",
               p."price"::float8 AS price
        FROM "Product" p
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE ${where}
        ORDER BY ${RANK_SQL} DESC, p.name ASC, p.id ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM "Product" p WHERE ${where}
      `),
    ]);

    const total = totalRows[0]?.count ?? 0;
    const items: ApiProduct[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      price: Number(r.price),
      imageUrl: r.imageUrl,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      inStock: r.stock > 0,
      stock: r.stock, // admin sees the exact count
      isActive: r.isActive,
      isFeatured: r.isFeatured,
    }));

    return NextResponse.json<AdminProductsPage>({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/admin/products failed", err);
    return shopError(500, "server", "Не вдалося завантажити товари");
  }
}
