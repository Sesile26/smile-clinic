import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { DeliveryMethod } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isValidUaPhone, shopError } from "@/lib/shop-server";
import type { ApiOrder, OrderItemInput } from "@/lib/shop-types";

/**
 * Create an order. Payment is on delivery — there is NO online payment.
 *
 * SECURITY / CORRECTNESS:
 *  - Guests allowed: userId is optional. We capture contactName/contactPhone.
 *  - Prices and total are computed SERVER-SIDE from Product.price. The client
 *    sends only { productId, quantity }; any client price is ignored.
 *  - priceAtPurchase is snapshotted per line so history is independent of
 *    later price edits.
 *  - Stock is decremented race-free: updateMany WHERE stock >= quantity AND
 *    isActive — if it doesn't affect exactly 1 row, the whole transaction
 *    (order + items + decrements) rolls back. No overselling, no orphans.
 */

class OrderError extends Error {
  constructor(
    public httpStatus: number,
    public code: "validation" | "not_found" | "out_of_stock" | "inactive",
    message: string,
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  // Orders require an authenticated user — no guest checkout. This is the
  // authoritative gate; the UI block alone wouldn't stop a direct request.
  const actor = await getActor();
  if (!actor) {
    return shopError(401, "unauthorized", "Увійдіть, щоб оформити замовлення");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const rawItems = Array.isArray(b.items) ? (b.items as OrderItemInput[]) : [];
  const contactName = typeof b.contactName === "string" ? b.contactName.trim() : "";
  const contactPhone = typeof b.contactPhone === "string" ? b.contactPhone.trim() : "";
  const deliveryMethod = b.deliveryMethod;
  const npCity = typeof b.npCity === "string" ? b.npCity.trim() : "";
  const npWarehouse = typeof b.npWarehouse === "string" ? b.npWarehouse.trim() : "";

  // ── Validate request shape ──────────────────────────────────────────────
  if (rawItems.length === 0) {
    return shopError(400, "validation", "Кошик порожній");
  }
  // Collapse duplicate lines and validate quantities.
  const qtyById = new Map<string, number>();
  for (const it of rawItems) {
    const id = typeof it?.productId === "string" ? it.productId : "";
    const qty = Number(it?.quantity);
    if (!id || !Number.isInteger(qty) || qty <= 0) {
      return shopError(400, "validation", "Невалідна позиція кошика");
    }
    qtyById.set(id, (qtyById.get(id) ?? 0) + qty);
  }

  if (contactName.length < 2) {
    return shopError(400, "validation", "Вкажіть імʼя (мін. 2 символи)");
  }
  if (!isValidUaPhone(contactPhone)) {
    return shopError(400, "validation", "Формат телефону: +380XXXXXXXXX");
  }
  if (deliveryMethod !== "pickup" && deliveryMethod !== "nova_poshta") {
    return shopError(400, "validation", "Оберіть спосіб доставки");
  }
  if (deliveryMethod === "nova_poshta" && (!npCity || !npWarehouse)) {
    return shopError(400, "validation", "Вкажіть місто та відділення Нової Пошти");
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const ids = [...qtyById.keys()];
      const products = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, price: true, stock: true, isActive: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      // Resolve prices + validate availability (read side).
      let total = new Prisma.Decimal(0);
      const itemsData: {
        productId: string;
        quantity: number;
        priceAtPurchase: Prisma.Decimal;
      }[] = [];

      for (const [productId, quantity] of qtyById) {
        const p = byId.get(productId);
        if (!p) throw new OrderError(404, "not_found", "Товар не знайдено");
        if (!p.isActive) {
          throw new OrderError(409, "inactive", "Товар недоступний для покупки");
        }
        if (p.stock < quantity) {
          throw new OrderError(409, "out_of_stock", "Товару недостатньо в наявності");
        }
        total = total.add(p.price.mul(quantity));
        itemsData.push({ productId, quantity, priceAtPurchase: p.price });
      }

      // Create the order + its items.
      const created = await tx.order.create({
        data: {
          status: "pending",
          deliveryMethod: deliveryMethod as DeliveryMethod,
          contactName,
          contactPhone,
          npCity: deliveryMethod === "nova_poshta" ? npCity : null,
          npWarehouse: deliveryMethod === "nova_poshta" ? npWarehouse : null,
          total,
          userId: actor.userId, // always linked — guests are rejected above
          items: { create: itemsData },
        },
        select: { id: true, status: true, total: true },
      });

      // Atomic stock claim — only succeeds if still enough AND active. A
      // concurrent order that drained the stock makes count !== 1 → throw →
      // the whole transaction rolls back (no oversell, no orphan order).
      for (const [productId, quantity] of qtyById) {
        const claim = await tx.product.updateMany({
          where: { id: productId, isActive: true, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (claim.count !== 1) {
          throw new OrderError(409, "out_of_stock", "Товару недостатньо в наявності");
        }
      }

      return created;
    });

    return NextResponse.json<ApiOrder>(
      { id: order.id, status: order.status, total: order.total.toNumber() },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof OrderError) {
      return shopError(err.httpStatus, err.code, err.message);
    }
    console.error("POST /api/orders failed", err);
    return shopError(500, "server", "Не вдалося оформити замовлення");
  }
}
