import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { OrderStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { AdminOrder } from "@/lib/admin-orders";

/**
 * PATCH /api/admin/orders/[id] — change order status. STAFF/ADMIN only.
 *
 * Cancelling restores stock: when status moves INTO `cancelled` (from any
 * non-cancelled state), each item's quantity is returned to Product.stock — all
 * in one transaction with the status update. Guarded on the previous status so a
 * repeated PATCH can't double-restore. (Re-opening a cancelled order does NOT
 * re-decrement — an accepted edge for v1.)
 */

const VALID_STATUS = new Set<string>(Object.values(OrderStatus));

function toApi(
  o: Prisma.OrderGetPayload<{
    include: {
      items: {
        select: {
          quantity: true;
          priceAtPurchase: true;
          product: { select: { name: true } };
        };
      };
    };
  }>,
): AdminOrder {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) return shopError(403, "forbidden", "Лише для персоналу");

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }
  const status = (body as { status?: string })?.status;
  if (!status || !VALID_STATUS.has(status)) {
    return shopError(400, "validation", "Невалідний статус");
  }
  const nextStatus = status as OrderStatus;

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id },
        select: { status: true, items: { select: { productId: true, quantity: true } } },
      });
      if (!current) {
        throw new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "x",
        });
      }

      // Restore stock only when entering "cancelled" from a non-cancelled state.
      if (
        nextStatus === OrderStatus.cancelled &&
        current.status !== OrderStatus.cancelled
      ) {
        for (const it of current.items) {
          await tx.product.update({
            where: { id: it.productId },
            data: { stock: { increment: it.quantity } },
          });
        }
      }

      await tx.order.update({ where: { id }, data: { status: nextStatus } });
    });

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id },
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
    return NextResponse.json<AdminOrder>(toApi(updated));
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return shopError(404, "not_found", "Замовлення не знайдено");
    }
    console.error("PATCH /api/admin/orders/[id] failed", err);
    return shopError(500, "server", "Не вдалося оновити статус");
  }
}
