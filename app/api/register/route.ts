import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@/lib/generated/prisma/client";
import { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/normalizePhone";
import { registerSchema } from "@/schemas/register";

const BCRYPT_COST = 12;
const PHONE_TAKEN = "Цей номер телефону вже використовується";

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

  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  // Re-normalise on the server even though the zod transform already did it:
  // never trust the client, and keep the canonical form a property of THIS
  // module rather than of the schema's transform order.
  const phone = normalizePhone(parsed.data.phone);

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

  // Phone uniqueness (canonical form). A match on a patient with a DIFFERENT
  // email is a genuine conflict → 409. A match on the SAME email is the
  // documented "self-register against an admin-created Patient" flow (the
  // upsert below attaches to it), so we must NOT block it. The DB unique
  // index + the P2002 catch below close the race for cross-patient dupes.
  const existingPhone = await prisma.patient.findUnique({ where: { phone } });
  if (existingPhone && existingPhone.email.toLowerCase() !== email) {
    return NextResponse.json(
      { error: PHONE_TAKEN, field: "phone" },
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
    // P2002 = unique violation, racing the pre-checks above.
    //   • Patient.phone  → "this phone is taken" (field: phone).
    //   • User.email / User.patientId / Patient.email → "this email is taken".
    // meta.target is a string[] of column names (or the constraint name) —
    // accept both shapes so we stay robust to the driver adapter.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = err.meta?.target;
      const onPhone = Array.isArray(target)
        ? target.includes("phone")
        : typeof target === "string" && target.includes("phone");
      if (onPhone) {
        return NextResponse.json(
          { error: PHONE_TAKEN, field: "phone" },
          { status: 409 },
        );
      }
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
