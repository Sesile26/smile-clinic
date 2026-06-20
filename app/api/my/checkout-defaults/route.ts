import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, shopError } from "@/lib/shop-server";
import type { CheckoutDefaults } from "@/lib/shop-types";

/**
 * GET /api/my/checkout-defaults — prefill the checkout form from the CURRENT
 * user's order history, so a repeat purchase doesn't retype anything.
 *
 * The sources are SPLIT by data type, on purpose:
 *   - contact (name/phone) + deliveryMethod → the LATEST order of any type, so
 *     the form opens with the usual contact + the delivery just used;
 *   - Nova Poshta address (npCity/npWarehouse) → the latest order that actually
 *     used nova_poshta, even if a later pickup order came after. A pickup in
 *     between must NOT wipe the remembered branch.
 *
 * SECURITY: filtered server-side by the session's userId — only the caller's
 * own orders are considered. Guest orders (userId NULL) belong to nobody and
 * never match. Returns `null` when the user has no orders at all (first
 * purchase → empty form). No NP order yet → npCity/npWarehouse are null.
 *
 * This is a draft for the UI; the order POST still validates everything, so a
 * prefilled value is not trusted any more than a typed one.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");

  try {
    const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const [last, lastNp] = await Promise.all([
      // Contact + delivery method: newest order of any kind.
      prisma.order.findFirst({
        where: { userId: actor.userId },
        orderBy,
        select: {
          contactName: true,
          contactPhone: true,
          deliveryMethod: true,
        },
      }),
      // NP address: newest order that actually shipped Nova Poshta.
      prisma.order.findFirst({
        where: { userId: actor.userId, deliveryMethod: "nova_poshta" },
        orderBy,
        select: { npCity: true, npWarehouse: true },
      }),
    ]);

    return NextResponse.json<CheckoutDefaults | null>(
      last
        ? {
            contactName: last.contactName,
            contactPhone: last.contactPhone,
            deliveryMethod: last.deliveryMethod,
            npCity: lastNp?.npCity ?? null,
            npWarehouse: lastNp?.npWarehouse ?? null,
          }
        : null,
    );
  } catch (err) {
    console.error("GET /api/my/checkout-defaults failed", err);
    return shopError(500, "server", "Не вдалося завантажити дані для оформлення");
  }
}
