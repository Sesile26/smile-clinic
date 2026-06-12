/**
 * Standard test-data seed for SmileClinic.
 *
 * Creates one account per role so you can sign in and exercise every flow:
 *   ADMIN, STAFF, DOCTOR (+ linked Doctor card), PATIENT ×2 (+ linked Patient).
 *
 * Run:  npx prisma db seed
 * (wired in prisma.config.ts → migrations.seed = "tsx prisma/seed.ts")
 *
 * Idempotent: every write is an upsert keyed by a unique field (User.email /
 * Patient.email / Doctor.userId), so re-running never duplicates rows or trips
 * a unique constraint.
 *
 * Stack: Prisma 7 client (lib/generated/prisma) + @prisma/adapter-pg, bcryptjs
 * for password hashing — the SAME hashing used by /api/register.
 */
import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// TEST DATA ONLY — never use in production. Every seeded account shares this
// one plaintext password; it is bcrypt-hashed (cost 12) before storage, never
// written raw. Meets the registration policy (≥8 chars incl. a digit).
const TEST_PASSWORD = "Password123";
const BCRYPT_COST = 12;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    // Hash once — identical password for all test accounts.
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_COST);

    // ── 1. ADMIN ─────────────────────────────────────────────────────────────
    const admin = await prisma.user.upsert({
      where: { email: "admin@smileclinic.test" },
      update: { name: "Адміністратор Клініки", passwordHash, role: Role.ADMIN },
      create: {
        email: "admin@smileclinic.test",
        name: "Адміністратор Клініки",
        passwordHash,
        role: Role.ADMIN,
      },
    });

    // ── 2. STAFF ─────────────────────────────────────────────────────────────
    const staff = await prisma.user.upsert({
      where: { email: "staff@smileclinic.test" },
      update: { name: "Реєстратор", passwordHash, role: Role.STAFF },
      create: {
        email: "staff@smileclinic.test",
        name: "Реєстратор",
        passwordHash,
        role: Role.STAFF,
      },
    });

    // ── 3. DOCTOR ────────────────────────────────────────────────────────────
    // Create the User first, then the linked Doctor card. The FK lives on
    // Doctor.userId (@unique), so we upsert the Doctor by userId — this is what
    // makes session.user.doctorId resolve (auth.ts reads user.doctor.id).
    const doctorUser = await prisma.user.upsert({
      where: { email: "doctor@smileclinic.test" },
      update: { name: "Наталія Лисенко", passwordHash, role: Role.DOCTOR },
      create: {
        email: "doctor@smileclinic.test",
        name: "Наталія Лисенко",
        passwordHash,
        role: Role.DOCTOR,
      },
    });
    // Спеціальність — окремий довідник Specialty; upsert за унікальним name.
    const therapy = await prisma.specialty.upsert({
      where: { name: "Терапевтична стоматологія" },
      update: {},
      create: { name: "Терапевтична стоматологія" },
    });
    const doctor = await prisma.doctor.upsert({
      where: { userId: doctorUser.id },
      update: { name: "Наталія Лисенко", specialtyId: therapy.id },
      create: {
        name: "Наталія Лисенко",
        specialtyId: therapy.id,
        userId: doctorUser.id,
      },
    });

    // ── 4. PATIENT ×2 ────────────────────────────────────────────────────────
    // Patient row first (name/email are NOT NULL, phone is unique-nullable),
    // then the User linked via User.patientId (@unique).
    const patientSeeds = [
      { email: "patient1@smileclinic.test", name: "Тарас Бондаренко", phone: "+380501110001" },
      { email: "patient2@smileclinic.test", name: "Ірина Шевченко", phone: "+380501110002" },
    ];
    const patientUsers: { email: string | null; name: string | null }[] = [];
    for (const p of patientSeeds) {
      const patient = await prisma.patient.upsert({
        where: { email: p.email },
        update: { name: p.name, phone: p.phone },
        create: { name: p.name, email: p.email, phone: p.phone },
      });
      const user = await prisma.user.upsert({
        where: { email: p.email },
        update: { name: p.name, passwordHash, role: Role.PATIENT, patientId: patient.id },
        create: {
          email: p.email,
          name: p.name,
          passwordHash,
          role: Role.PATIENT,
          patientId: patient.id,
        },
      });
      patientUsers.push({ email: user.email, name: user.name });
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log(`\n✔ Seed complete. Test password for ALL accounts: ${TEST_PASSWORD}\n`);
    console.table([
      { role: "ADMIN", email: admin.email, linked: "—" },
      { role: "STAFF", email: staff.email, linked: "—" },
      {
        role: "DOCTOR",
        email: doctorUser.email,
        linked: `${doctor.name} · ${therapy.name}`,
      },
      ...patientUsers.map((u) => ({ role: "PATIENT", email: u.email, linked: u.name })),
    ]);
  } finally {
    // Always release the pool, even if a write above throws.
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
