import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import authConfig from "./auth.config";

// ─── Type augmentation ───────────────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      patientId?: string;
    } & DefaultSession["user"];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// ─── Auth config (full, Node-runtime only) ───────────────────────────────────
//
// Auth.js v5 split-config pattern:
//   • auth.config.ts → edge-safe (providers, pages) — used by middleware.
//   • auth.ts        → full config — used by server components, route handlers,
//                      and the [...nextauth] handler. Adds the Prisma adapter
//                      and DB-touching callbacks/events that cannot run on Edge.

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  // @auth/prisma-adapter expects @prisma/client types; we use a custom output
  // path (lib/generated/prisma), so a cast is required — runtime is unaffected.
  adapter: PrismaAdapter(prisma as Parameters<typeof PrismaAdapter>[0]),

  // Database sessions: roles are always current (no stale JWT), sessions can
  // be revoked server-side — important for healthcare role management.
  session: { strategy: "database" },

  callbacks: {
    async session({ session, user }) {
      // Fetch role and patientId from DB on each session access.
      // One extra query, but roles are always fresh — correct for healthcare.
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, patientId: true },
      });

      session.user.id = user.id;
      session.user.role = dbUser?.role ?? Role.PATIENT;
      session.user.patientId = dbUser?.patientId ?? undefined;

      return session;
    },
  },

  events: {
    // Fires once when the user record is first created in the DB.
    // Assigns role from allowlist or links to an existing Patient by email.
    async createUser({ user }) {
      if (!user.email || !user.id) return;

      const email = user.email.toLowerCase();
      const adminEmails = parseEmailList(process.env.AUTH_ADMIN_EMAILS);
      const staffEmails = parseEmailList(process.env.AUTH_STAFF_EMAILS);

      let role: Role = Role.PATIENT;
      let patientId: string | undefined;

      if (adminEmails.includes(email)) {
        role = Role.ADMIN;
      } else if (staffEmails.includes(email)) {
        role = Role.STAFF;
      } else {
        // Link to an existing Patient record if email matches (no duplicate).
        const patient = await prisma.patient.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (patient) {
          patientId = patient.id;
        }
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          role,
          ...(patientId ? { patientId } : {}),
        },
      });
    },
  },
});
