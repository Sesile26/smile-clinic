import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/push/subscribe — store a browser's Web Push subscription for the
 * current user. UPSERT by endpoint so re-subscribing on the same device (or a
 * subscription that migrated to a new user on a shared device) updates in place
 * instead of duplicating. Login required — push is bound to userId.
 *
 * nodejs runtime: keeps the push stack on one runtime (Prisma + the later
 * web-push send share it); endpoint isn't edge-critical.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const sub = body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const authKey = sub.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    typeof authKey !== "string"
  ) {
    return NextResponse.json({ error: "Некоректна підписка" }, { status: 400 });
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: session.user.id, endpoint, p256dh, auth: authKey },
      // Re-bind to the current user (shared device) and refresh keys.
      update: { userId: session.user.id, p256dh, auth: authKey },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/push/subscribe failed", err);
    return NextResponse.json({ error: "Помилка" }, { status: 500 });
  }
}
