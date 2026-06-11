import Dexie, { type Table } from "dexie";

/**
 * Read-only mirror of the server's clinical data, scoped to the currently
 * signed-in user. Wiped on signOut (see Header.handleSignOut) so a shared
 * device never leaks one user's records to the next.
 *
 * Server (Postgres) is the source of truth. lib/mirror.ts pulls a role-aware
 * slice into here over the network; useLiveQuery reads it back offline.
 * There is NO reverse sync — registration and appointment booking remain
 * online-only.
 */

export type AppointmentStatus = "pending" | "confirmed" | "done" | "cancelled";

export interface LocalAppointment {
  /** Server cuid. */
  id: string;
  /** ISO date-time (combined). Use new Date(date) for display. */
  date: string;
  status: AppointmentStatus;
  notes: string | null;
  patientId: string;
  /** Denormalised for fast list rendering — refreshed on every mirror pull. */
  patientName: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  createdAt: string;
  /** Date.now() of the most recent pull that included this row. */
  lastMirroredAt: number;
}

export interface LocalPatient {
  id: string;
  name: string;
  email: string | null;
  /** Null for Google-only patients — that flow never collects a phone. */
  phone: string | null;
  lastMirroredAt: number;
}

export interface LocalDoctor {
  id: string;
  name: string;
  specialty: string;
  lastMirroredAt: number;
}

/**
 * Read-only mirror of an availability slot, for OFFLINE VIEWING only.
 * Booking and slot editing are online-only, so this is never written back.
 *   • DOCTOR  → own slots, working window (today..+N days).
 *   • STAFF/ADMIN → all slots, today..+7 days.
 *   • PATIENT → none (patients view their own appointments offline, not slots).
 */
export interface LocalSlot {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  /** UTC ISO. */
  startsAt: string;
  /** UTC ISO. */
  endsAt: string;
  status: "free" | "booked";
  lastMirroredAt: number;
}

/**
 * Read-only mirror of a catalog product, for OFFLINE VIEWING only. The catalog
 * is public (not user-scoped), so useProducts writes this on every online load
 * and reads it back when offline. Ordering stays online-only.
 */
export interface LocalProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  /** Only the availability boolean is mirrored — the exact stock count is
   *  staff-only and never written to the (patient-readable) offline store. */
  inStock: boolean;
  isActive: boolean;
  lastMirroredAt: number;
}

export interface LocalProfile {
  /** Always the literal "me" — singleton row for the current session. */
  userId: string;
  role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
  patientId: string | null;
  /** The Doctor row this user owns, if any — lets the offline manage view
   *  know whose slots to read from the mirror without hitting the network. */
  doctorId: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
  lastMirroredAt: number;
}

/**
 * A line in the persisted shopping cart. Only the id + quantity are stored —
 * product details (name, price, availability) are re-resolved from the live
 * catalog on hydration, so a stale snapshot can never be ordered. Wiped on
 * signOut with the rest of the DB (shared-device policy).
 */
export interface LocalCartItem {
  productId: string;
  quantity: number;
  /** Epoch ms when first added — preserves cart order across reloads. */
  addedAt: number;
}

export class ClinicDatabase extends Dexie {
  appointments!: Table<LocalAppointment, string>;
  patients!: Table<LocalPatient, string>;
  doctors!: Table<LocalDoctor, string>;
  slots!: Table<LocalSlot, string>;
  products!: Table<LocalProduct, string>;
  profile!: Table<LocalProfile, string>;
  cartItems!: Table<LocalCartItem, string>;

  constructor() {
    super("ClinicDatabase");

    // v1 was the legacy offline-write design (status: pending/synced/failed
    // + sync queue). It never shipped; the migration just drops its rows.
    this.version(1).stores({
      appointments: "id, status, date, serverId",
      patients: "id",
    });

    // v2: read-only mirror. Indexes chosen for the dashboard "next visits"
    // query (by date) and per-doctor / per-patient lookups.
    this.version(2)
      .stores({
        appointments: "id, date, status, doctorId, patientId",
        patients: "id, name",
        doctors: "id",
        profile: "userId",
      })
      .upgrade((tx) =>
        Promise.all([
          tx.table("appointments").clear(),
          tx.table("patients").clear(),
        ]).then(() => undefined),
      );

    // v3: adds the `slots` table for offline schedule viewing. Additive — the
    // existing tables keep their data; the new table starts empty and fills on
    // the next mirror pull. Indexed by doctorId + startsAt for the week query.
    this.version(3).stores({
      appointments: "id, date, status, doctorId, patientId",
      patients: "id, name",
      doctors: "id",
      slots: "id, doctorId, status, startsAt",
      profile: "userId",
    });

    // v4: adds the `products` table for the offline shop catalog. Additive;
    // fills on the next online catalog load (useProducts), read back offline.
    this.version(4).stores({
      appointments: "id, date, status, doctorId, patientId",
      patients: "id, name",
      doctors: "id",
      slots: "id, doctorId, status, startsAt",
      products: "id, isActive, category",
      profile: "userId",
    });

    // v5: product mirror now stores `inStock` (boolean) instead of the exact
    // `stock` count — exact stock is staff-only and must not be persisted to a
    // patient-readable store. Same index shape; clear products so stale rows
    // (with the old `stock` field) don't linger if the first load is offline.
    this.version(5)
      .stores({
        appointments: "id, date, status, doctorId, patientId",
        patients: "id, name",
        doctors: "id",
        slots: "id, doctorId, status, startsAt",
        products: "id, isActive, category",
        profile: "userId",
      })
      .upgrade((tx) => tx.table("products").clear().then(() => undefined));

    // v6: categories are a real model — the product mirror now stores
    // `categoryId` + `categoryName` instead of the old free-text `category`.
    // The index moves from `category` to `categoryId`; clear products so stale
    // rows (old shape) don't linger if the first post-upgrade load is offline.
    this.version(6)
      .stores({
        appointments: "id, date, status, doctorId, patientId",
        patients: "id, name",
        doctors: "id",
        slots: "id, doctorId, status, startsAt",
        products: "id, isActive, categoryId",
        profile: "userId",
      })
      .upgrade((tx) => tx.table("products").clear().then(() => undefined));

    // v7: adds the `cartItems` table so the shopping cart survives reload /
    // direct entry (hydrated on app start). Additive — keyed by productId,
    // also indexed by addedAt to restore the original cart order.
    this.version(7).stores({
      appointments: "id, date, status, doctorId, patientId",
      patients: "id, name",
      doctors: "id",
      slots: "id, doctorId, status, startsAt",
      products: "id, isActive, categoryId",
      profile: "userId",
      cartItems: "productId, addedAt",
    });
  }
}

export const db = new ClinicDatabase();

/**
 * Drops the entire IndexedDB. Called on signOut so the next user on a
 * shared device starts with an empty mirror. Idempotent: succeeds even if
 * the database has not been opened yet.
 */
export async function wipeDexie(): Promise<void> {
  try {
    await db.delete();
  } catch (err) {
    // Worst case: still-open connections in another tab. Swallow — we'd
    // rather let signOut proceed than block on a stale lock.
    console.warn("[wipeDexie] failed to drop database", err);
  }
}
