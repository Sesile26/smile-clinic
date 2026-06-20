import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, shopError } from "@/lib/shop-server";
import {
  ORDERS_PAGE_SIZE,
  type ItemAvailability,
  type MyOrder,
  type MyOrderItem,
  type MyOrdersPage,
} from "@/lib/my-orders";

/**
 * GET /api/my/orders?page&pageSize — the CURRENT user's purchase history.
 *
 * SECURITY: filtered server-side by the session's userId — a user sees ONLY
 * their own orders (there's no per-order endpoint, so another user's order is
 * unreachable). Guest orders (userId NULL) belong to nobody and never appear.
 *
 * Each item returns the HISTORICAL price (priceAtPurchase, for display) AND the
 * product's CURRENT state (availability + currentPrice, for the reorder button).
 * Availability is derived from isActive + stock; the exact stock count is NOT
 * exposed (role-gated like the catalog).
 */

const PRODUCT_SELECT = {
  id: true,
  name: true,
  imageUrl: true,
  isActive: true,
  stock: true,
  price: true,
  category: { select: { name: true } },
} as const;

type ItemRow = {
  quantity: number;
  priceAtPurchase: { toNumber: () => number };
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    isActive: boolean;
    stock: number;
    price: { toNumber: () => number };
    category: { name: string } | null;
  };
};

function toItem(oi: ItemRow): MyOrderItem {
  const p = oi.product;
  const availability: ItemAvailability = !p.isActive
    ? "removed"
    : p.stock > 0
      ? "available"
      : "out_of_stock";
  return {
    productId: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    categoryName: p.category?.name ?? null,
    quantity: oi.quantity,
    priceAtPurchase: oi.priceAtPurchase.toNumber(),
    currentPrice: p.price.toNumber(),
    availability,
  };
}

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize =
    Number.isInteger(rawSize) && rawSize >= 1 && rawSize <= 50 ? rawSize : ORDERS_PAGE_SIZE;

  const where = { userId: actor.userId };

  try {
    const [rows, total] = await Promise.all([
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
          items: {
            select: { quantity: true, priceAtPurchase: true, product: { select: PRODUCT_SELECT } },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const items: MyOrder[] = rows.map((o) => ({
      id: o.id,
      date: o.createdAt.toISOString(),
      status: o.status,
      deliveryMethod: o.deliveryMethod,
      total: o.total.toNumber(),
      items: o.items.map(toItem),
    }));

    return NextResponse.json<MyOrdersPage>({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/my/orders failed", err);
    return shopError(500, "server", "Не вдалося завантажити історію покупок");
  }
}
