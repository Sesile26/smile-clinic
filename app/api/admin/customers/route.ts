import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import {
  CUSTOMERS_DEFAULT_PAGE_SIZE,
  CUSTOMERS_PAGE_SIZES,
  type AdminCustomerRow,
  type AdminCustomersPage,
} from "@/lib/admin-customers";

/**
 * GET /api/admin/customers — shop customers (Users with ≥1 Order), for
 * STAFF/ADMIN only. Unlike clinical patients there is NO own/other split —
 * staff/admin see ALL customers (DOCTOR/PATIENT are rejected; the Магазин tab
 * group is hidden for a doctor too, and proxy.ts bounces them from /admin/*).
 *
 * Aggregates are computed in ONE grouped query (COUNT / SUM(total) / MAX(created)
 * per user) — no per-user loop. Phone comes from the most recent order's
 * contactPhone (User has no phone column). Search hits name/email and (≥3 digits)
 * any order's contactPhone. Sorted by last order desc, offset pagination.
 * Sorting by an aggregate needs GROUP BY → raw SQL (Prisma can't orderBy it);
 * the @@index([userId]) on Order backs the join/group.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) return shopError(403, "forbidden", "Немає доступу");

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = CUSTOMERS_PAGE_SIZES.includes(
    rawSize as (typeof CUSTOMERS_PAGE_SIZES)[number],
  )
    ? rawSize
    : CUSTOMERS_DEFAULT_PAGE_SIZE;
  const q = (searchParams.get("q") ?? "").trim();
  const offset = (page - 1) * pageSize;

  let searchFilter = Prisma.empty;
  if (q) {
    const pat = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const phoneClause =
      digits.length >= 3
        ? Prisma.sql` OR EXISTS (SELECT 1 FROM "Order" op WHERE op."userId" = u.id AND op."contactPhone" ILIKE ${`%${digits}%`})`
        : Prisma.empty;
    searchFilter = Prisma.sql`AND (u.name ILIKE ${pat} OR u.email ILIKE ${pat}${phoneClause})`;
  }

  try {
    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          id: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          order_count: number;
          total_spent: number;
          last_order: Date | null;
        }>
      >(Prisma.sql`
        SELECT u.id, u.name, u.email,
               COUNT(o.id)::int AS order_count,
               -- "Сума" counts ONLY completed orders (actual sales); pending /
               -- confirmed / cancelled don't add up. Count/last cover all orders.
               COALESCE(SUM(o.total) FILTER (WHERE o.status::text = 'completed'), 0)::float8 AS total_spent,
               MAX(o."createdAt") AS last_order,
               (SELECT o2."contactPhone" FROM "Order" o2
                 WHERE o2."userId" = u.id
                 ORDER BY o2."createdAt" DESC, o2.id DESC LIMIT 1) AS phone
        FROM "User" u
        JOIN "Order" o ON o."userId" = u.id
        WHERE TRUE ${searchFilter}
        GROUP BY u.id
        ORDER BY MAX(o."createdAt") DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT u.id
          FROM "User" u
          JOIN "Order" o ON o."userId" = u.id
          WHERE TRUE ${searchFilter}
          GROUP BY u.id
        ) sub
      `),
    ]);

    const total = totalRows[0]?.count ?? 0;
    const items: AdminCustomerRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name ?? "Без імені",
      email: r.email ?? "—",
      phone: r.phone,
      orderCount: r.order_count,
      totalSpent: r.total_spent,
      lastOrderAt: r.last_order ? new Date(r.last_order).toISOString() : null,
    }));

    return NextResponse.json<AdminCustomersPage>({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/admin/customers failed", err);
    return shopError(500, "server", "Не вдалося завантажити покупців");
  }
}
