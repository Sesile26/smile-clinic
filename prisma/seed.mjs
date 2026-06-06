/**
 * Idempotent dev seed for the booking feature.
 *
 * Uses the raw `pg` driver (not the Prisma client) so it runs as plain ESM
 * without a TS loader, and computes slot times with LOCAL `new Date(...)` so
 * the stored UTC instants line up with the /booking grid (which also converts
 * local↔UTC). Re-runnable: every write is ON CONFLICT / idempotent.
 *
 *   node prisma/seed.mjs
 *
 * Seeded logins (dev only):
 *   doctor@smileclinic.ua  / Doctor123!   (role DOCTOR, linked to Doc #1)
 *   patient@smileclinic.ua / Patient123!  (role PATIENT)
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const DOCTORS = [
  { id: "seed-doc-1", name: "Олена Коваль", specialty: "Естетична стоматологія" },
  { id: "seed-doc-2", name: "Андрій Левченко", specialty: "Імплантація" },
  { id: "seed-doc-3", name: "Марія Гончар", specialty: "Ортодонтія" },
  { id: "seed-doc-4", name: "Ігор Дідух", specialty: "Дитяча стоматологія" },
  { id: "seed-doc-5", name: "Софія Тарасенко", specialty: "Невідкладна допомога" },
];

// Booking is hour-only: hourly starts across the working window (13:00 lunch
// skipped). Matches the /booking grid and the /api/slots 60-min validation.
const WORK_TIMES = [
  "09:00", "10:00", "11:00", "12:00",
  // 13:00 lunch
  "14:00", "15:00", "16:00", "17:00",
];
const DAYS_AHEAD = 10;
const DURATION_MIN = 60;

// Small stable hash so the same cell always gets the same gap decision.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function compact(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(
    date.getUTCDate(),
  )}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}`;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = (text, params) => client.query(text, params);

  try {
    // ── Doctors ────────────────────────────────────────────────────────────
    for (const d of DOCTORS) {
      await q(
        `INSERT INTO "Doctor" (id, name, specialty, "createdAt")
         VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, specialty = EXCLUDED.specialty`,
        [d.id, d.name, d.specialty],
      );
    }

    // ── Accounts: a doctor and a patient ────────────────────────────────────
    const doctorHash = await bcrypt.hash("Doctor123!", 12);
    const patientHash = await bcrypt.hash("Patient123!", 12);

    // Patient record + user
    await q(
      `INSERT INTO "Patient" (id, name, email, phone, "createdAt")
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO NOTHING`,
      ["seed-patient-1", "Тарас Бочка", "patient@smileclinic.ua", "+380501112233"],
    );
    await q(
      `INSERT INTO "User" (id, name, email, "passwordHash", role, "patientId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"Role", $6, now(), now())
       ON CONFLICT (id) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = EXCLUDED.role, "patientId" = EXCLUDED."patientId"`,
      ["seed-user-patient", "Тарас Бочка", "patient@smileclinic.ua", patientHash, "PATIENT", "seed-patient-1"],
    );

    // Doctor user, linked to Doctor #1
    await q(
      `INSERT INTO "User" (id, name, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"Role", now(), now())
       ON CONFLICT (id) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = EXCLUDED.role`,
      ["seed-user-doctor", "Олена Коваль", "doctor@smileclinic.ua", doctorHash, "DOCTOR"],
    );
    await q(`UPDATE "Doctor" SET "userId" = $1 WHERE id = $2`, [
      "seed-user-doctor",
      "seed-doc-1",
    ]);

    // ── Availability slots (local working hours → UTC instants) ──────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let slotCount = 0;

    for (const d of DOCTORS) {
      for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
        const day = new Date(today);
        day.setDate(day.getDate() + dayOffset);
        const dow = day.getDay(); // 0 = Sun, 6 = Sat
        if (dow === 0) continue; // clinic closed Sundays
        const isSat = dow === 6;

        for (const time of WORK_TIMES) {
          // Deterministic gaps so availability looks natural; Saturdays sparse.
          const h = hash(`${d.id}|${dayOffset}|${time}`);
          const keep = isSat ? h % 100 < 25 : h % 3 !== 0;
          if (!keep) continue;

          const [hh, mm] = time.split(":").map(Number);
          const start = new Date(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
            hh,
            mm,
          );
          const end = new Date(start.getTime() + DURATION_MIN * 60000);
          const id = `seed-slot-${d.id}-${compact(start)}`;
          await q(
            `INSERT INTO "AvailabilitySlot"
               (id, "doctorId", "startsAt", "endsAt", status, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'free'::"SlotStatus", now(), now())
             ON CONFLICT (id) DO NOTHING`,
            [id, d.id, start.toISOString(), end.toISOString()],
          );
          slotCount++;
        }
      }
    }

    // ── A couple of booked slots (so "зайнято" shows up) ─────────────────────
    // Pick the first non-Sunday day from tomorrow; book 10:00 and 14:00 of Doc #1.
    let bookDay = new Date(today);
    do {
      bookDay.setDate(bookDay.getDate() + 1);
    } while (bookDay.getDay() === 0);

    let bookedCount = 0;
    for (const [idx, time] of ["10:00", "14:00"].entries()) {
      const [hh, mm] = time.split(":").map(Number);
      const start = new Date(
        bookDay.getFullYear(),
        bookDay.getMonth(),
        bookDay.getDate(),
        hh,
        mm,
      );
      const end = new Date(start.getTime() + DURATION_MIN * 60000);
      const slotId = `seed-slot-seed-doc-1-${compact(start)}`;
      const apptId = `seed-appt-${idx + 1}`;

      // Ensure the slot exists (might have been gapped out above).
      await q(
        `INSERT INTO "AvailabilitySlot"
           (id, "doctorId", "startsAt", "endsAt", status, "createdAt", "updatedAt")
         VALUES ($1, 'seed-doc-1', $2, $3, 'free'::"SlotStatus", now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [slotId, start.toISOString(), end.toISOString()],
      );
      await q(
        `INSERT INTO "Appointment" (id, date, status, "patientId", "doctorId", "createdAt")
         VALUES ($1, $2, 'confirmed'::"AppointmentStatus", 'seed-patient-1', 'seed-doc-1', now())
         ON CONFLICT (id) DO NOTHING`,
        [apptId, start.toISOString()],
      );
      await q(
        `UPDATE "AvailabilitySlot"
           SET status = 'booked'::"SlotStatus", "appointmentId" = $1, "updatedAt" = now()
         WHERE id = $2 AND "appointmentId" IS NULL`,
        [apptId, slotId],
      );
      bookedCount++;
    }

    console.log(
      `Seed OK · doctors=${DOCTORS.length} slots≈${slotCount} booked=${bookedCount}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
