import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { OrderStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { AdminOrder, AdminOrdersPage } from "@/lib/admin-orders";

/**
 * GET /api/admin/orders — paginated order list for STAFF/ADMIN.
 *
 * Role is enforced HERE (not just in the UI / proxy) — a direct request from a
 * patient/guest is rejected.
 *
 * Built for 1000+ orders: the client NEVER receives the whole table.
 *  - OFFSET pagination: ?page=<1..>&pageSize=<25|50|100> → skip/take. Numbered
 *    pages allow jumping to an arbitrary page (the composite
 *    (status, createdAt DESC, id DESC) / (createdAt DESC, id DESC) indexes
 *    keep the ordered scan cheap at these volumes).
 *  - ALL filtering happens in the DB `where`, so filters/search cover the
 *    whole dataset, not just the loaded page:
 *      ?status=<OrderStatus>      exact status
 *      ?q=<text>                  name (ILIKE) / phone (by digits) / order №
 *      ?from=YYYY-MM-DD&to=...    createdAt range, UTC day bounds — the UI
 *                                 also renders dates in UTC, so what the
 *                                 admin sees matches what the filter does.
 * Response: { items, total, page, pageSize, totalPages }.
 */

// Allowed page sizes — anything else from the query string falls back to 25.
const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Validate pagination params: page is a positive int (else 1), pageSize must
  // be one of the allowed sizes (else the default).
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;

  const where: Prisma.OrderWhereInput = {};
  if (status && VALID_STATUS.has(status)) {
    where.status = status as OrderStatus;
  }
  if (q) {
    const or: Prisma.OrderWhereInput[] = [
      { contactName: { contains: q, mode: "insensitive" } },
    ];
    // Phone matches by digits only, so "+380 50 111" finds "+380501110001".
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) {
      or.push({ contactPhone: { contains: digits } });
    }
    // Order "number" is the id tail (uppercased in the UI) — match it too.
    if (/^[a-z0-9]{3,}$/i.test(q)) {
      or.push({ id: { endsWith: q.toLowerCase() } });
    }
    where.OR = or;
  }
  if ((from && DATE_RE.test(from)) || (to && DATE_RE.test(to))) {
    where.createdAt = {
      ...(from && DATE_RE.test(from)
        ? { gte: new Date(`${from}T00:00:00.000Z`) }
        : {}),
      ...(to && DATE_RE.test(to)
        ? { lte: new Date(`${to}T23:59:59.999Z`) }
        : {}),
    };
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        // Newest first; id is the unique tie-breaker for equal createdAt.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: {
            select: {
              quantity: true,
              priceAtPurchase: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);
    return NextResponse.json<AdminOrdersPage>({
      items: rows.map(toApi),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/admin/orders failed", err);
    return shopError(500, "server", "Не вдалося завантажити замовлення");
  }
}
