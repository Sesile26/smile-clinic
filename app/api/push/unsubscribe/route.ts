import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/push/unsubscribe — drop a browser's Web Push subscription by
 * endpoint. Scoped to the session user so you can only delete your own. Login
 * required. deleteMany (not delete) so an already-gone row is a no-op, not a
 * 500.
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

  const endpoint = (body as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "Некоректна підписка" }, { status: 400 });
  }

  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: session.user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/push/unsubscribe failed", err);
    return NextResponse.json({ error: "Помилка" }, { status: 500 });
  }
}
