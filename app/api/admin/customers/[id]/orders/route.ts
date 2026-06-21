import { NextResponse } from "next/server";
import { OrderStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import {
  CUSTOMER_ORDERS_PAGE_SIZE,
  type AdminCustomerRow,
  type CustomerHistory,
  type CustomerOrder,
} from "@/lib/admin-customers";

/**
 * GET /api/admin/customers/[id]/orders?page&pageSize — a customer's summary
 * (name/email/phone + aggregates) plus ONE offset page of their orders
 * (OrderItems + products), newest first. STAFF/ADMIN only — no own/other split.
 *
 * priceAtPurchase is the historical price frozen on the OrderItem (same as
 * /my/orders), so the figures don't drift with the current catalog price.
 * 404 when the user has no orders (i.e. not a customer) — nothing to show.
 */

const ITEM_SELECT = {
  quantity: true,
  priceAtPurchase: true,
  product: { select: { name: true, imageUrl: true } },
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) return shopError(403, "forbidden", "Немає доступу");

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize =
    Number.isInteger(rawSize) && rawSize >= 1 && rawSize <= 50
      ? rawSize
      : CUSTOMER_ORDERS_PAGE_SIZE;

  const where = { userId: id };

  try {
    const [user, agg, completedAgg, latest, rows, total] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { name: true, email: true } }),
      prisma.order.aggregate({
        where,
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      // "Сума" — only completed orders (matches the list aggregate).
      prisma.order.aggregate({
        where: { ...where, status: OrderStatus.completed },
        _sum: { total: true },
      }),
      prisma.order.findFirst({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { contactPhone: true },
      }),
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          status: true,
          deliveryMethod: true,
          total: true,
          items: { select: ITEM_SELECT },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // No orders → not a customer (or unknown id). Don't leak a bare User.
    if (total === 0) return shopError(404, "not_found", "Покупця не знайдено");

    const customer: AdminCustomerRow = {
      id,
      name: user?.name ?? "Без імені",
      email: user?.email ?? "—",
      phone: latest?.contactPhone ?? null,
      orderCount: agg._count._all,
      totalSpent: completedAgg._sum.total ? completedAgg._sum.total.toNumber() : 0,
      lastOrderAt: agg._max.createdAt ? agg._max.createdAt.toISOString() : null,
    };

    const items: CustomerOrder[] = rows.map((o) => ({
      id: o.id,
      date: o.createdAt.toISOString(),
      status: o.status,
      deliveryMethod: o.deliveryMethod,
      total: o.total.toNumber(),
      items: o.items.map((it) => ({
        name: it.product.name,
        imageUrl: it.product.imageUrl,
        quantity: it.quantity,
        priceAtPurchase: it.priceAtPurchase.toNumber(),
      })),
    }));

    return NextResponse.json<CustomerHistory>({
      customer,
      orders: {
        items,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    console.error("GET /api/admin/customers/[id]/orders failed", err);
    return shopError(500, "server", "Не вдалося завантажити замовлення покупця");
  }
}
