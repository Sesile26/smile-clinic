import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@/lib/generated/prisma/client";
import { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/schemas/register";

const BCRYPT_COST = 12;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate (server-side; never trust client-side rhf+zod).
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const { name, phone, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  // Fast-fail path before the expensive bcrypt.hash (~250ms at cost 12).
  // The DB-level P2002 catch below still covers the TOCTOU race between this
  // check and the actual INSERT.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      {
        error:
          "Цей email уже використовується. Спробуйте увійти існуючим методом.",
      },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const user = await prisma.$transaction(async (tx) => {
      // upsert(...) with empty `update` = idempotent find-or-create. If the
      // clinic admin already entered the Patient (e.g. for an in-person
      // appointment), we DO NOT overwrite name/phone with the values the user
      // typed at sign-up; we just attach the new User to the existing Patient.
      const patient = await tx.patient.upsert({
        where: { email },
        update: {},
        create: { name, email, phone },
      });

      return tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: Role.PATIENT,
          patientId: patient.id,
        },
        select: { id: true },
      });
    });

    // 201 Created. Body is intentionally minimal — never echo the user object
    // (it would include passwordHash via Prisma's default selection).
    return NextResponse.json({ ok: true, userId: user.id }, { status: 201 });
  } catch (err) {
    // P2002 = unique violation. Could be User.email (race) or User.patientId
    // (an existing User is already linked to this Patient). Both surfaces map
    // to the same UX message — "this email is taken, sign in instead".
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Цей email уже використовується. Спробуйте увійти існуючим методом.",
        },
        { status: 409 },
      );
    }
    console.error("POST /api/register failed", err);
    return NextResponse.json(
      { error: "Не вдалося створити акаунт" },
      { status: 500 },
    );
  }
}
