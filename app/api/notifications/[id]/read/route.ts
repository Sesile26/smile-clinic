import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/notifications/[id]/read — mark ONE of the current user's
 * notifications read. The `userId` in the where-clause guarantees a user can
 * only touch their own (updateMany count 0 ⇒ not found / not theirs).
 */
export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const res = await prisma.notification.updateMany({
      where: { id, userId: session.user.id },
      data: { isRead: true },
    });
    if (res.count === 0) {
      return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/notifications/[id]/read failed", err);
    return NextResponse.json({ error: "Помилка" }, { status: 500 });
  }
}
