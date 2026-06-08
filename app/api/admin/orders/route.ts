import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { OrderStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { AdminOrder } from "@/lib/admin-orders";

/**
 * GET /api/admin/orders — order list for STAFF/ADMIN.
 *
 * Role is enforced HERE (not just in the UI / proxy) — a direct request from a
 * patient/guest is rejected. Optional ?status=<OrderStatus> and ?q=<search>
 * (name/phone) narrow the result; the UI also filters client-side for snappy
 * chips/counts.
 */

type Row = Prisma.OrderGetPayload<{
  include: {
    items: { select: { quantity: true; priceAtPurchase: true; product: { select: { name: true } } } };
  };
}>;

function toApi(o: Row): AdminOrder {
  return {
    id: o.id,
    number: o.id.slice(-6).toUpperCase(),
    createdAt: o.createdAt.toISOString(),
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    deliveryMethod: o.deliveryMethod,
    npCity: o.npCity,
    npWarehouse: o.npWarehouse,
    status: o.status,
    total: o.total.toNumber(),
    items: o.items.map((it) => ({
      name: it.product.name,
      quantity: it.quantity,
      price: it.priceAtPurchase.toNumber(),
    })),
  };
}

const VALID_STATUS = new Set<string>(Object.values(OrderStatus));

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) return shopError(403, "forbidden", "Лише для персоналу");

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const q = (searchParams.get("q") ?? "").trim();

  const where: Prisma.OrderWhereInput = {};
  if (status && VALID_STATUS.has(status)) {
    where.status = status as OrderStatus;
  }
  if (q) {
    where.OR = [
      { contactName: { contains: q, mode: "insensitive" } },
      { contactPhone: { contains: q } },
    ];
  }

  try {
    const rows = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          select: {
            quantity: true,
            priceAtPurchase: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    return NextResponse.json<AdminOrder[]>(rows.map(toApi));
  } catch (err) {
    console.error("GET /api/admin/orders failed", err);
    return shopError(500, "server", "Не вдалося завантажити замовлення");
  }
}
