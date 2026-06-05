import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import { loginSchema } from "@/schemas/login";
import authConfig from "./auth.config";

// ─── Type augmentation ───────────────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      patientId?: string;
      // Set only for DOCTOR users that are linked to a Doctor row
      // (Doctor.userId). The server still re-verifies ownership — never trust
      // this client-visible claim for authorization.
      doctorId?: string;
    } & DefaultSession["user"];
  }
}

// Auth.js v5 re-exports JWT from @auth/core/jwt. Augmenting the original
// module (rather than the next-auth re-export) avoids the TS2664
// "module not found" error when moduleResolution: "bundler" is in effect.
declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    patientId?: string;
    doctorId?: string;
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
//                      and the [...nextauth] handler. Adds the Prisma adapter,
//                      Credentials provider (requires JWT), and the
//                      jwt/session callbacks that carry role + patientId.

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  // @auth/prisma-adapter expects @prisma/client types; we use a custom output
  // path (lib/generated/prisma), so a cast is required — runtime is unaffected.
  adapter: PrismaAdapter(prisma as Parameters<typeof PrismaAdapter>[0]),

  // JWT sessions are REQUIRED by the Credentials provider — Auth.js v5 does
  // not persist Credentials sign-ins to the Session table (by design). With
  // PrismaAdapter still attached, Google sign-in continues to write User and
  // Account rows; only the session cookie is a JWE instead of a DB lookup.
  session: { strategy: "jwt" },

  providers: [
    // IMPORTANT: must explicitly spread `authConfig.providers` here. Just
    // saying `providers: [Credentials(...)]` next to `...authConfig` would
    // override (not merge) the array, dropping Google entirely.
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const parsed = loginSchema.safeParse(creds);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        // Nullable email guard (User.email is String?): if the matched user
        // somehow has no email or no passwordHash (e.g. Google-only account),
        // refuse — same generic error path as wrong password.
        if (!user?.email || !user.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        // Never include passwordHash in the returned object.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    // jwt() runs on every request, but `user` is only defined right after a
    // successful sign-in. That's the cheapest moment to look up the role and
    // patientId once and bake them into the token, so subsequent requests
    // don't touch the DB.
    async jwt({ token, user }) {
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            role: true,
            patientId: true,
            // Linked Doctor row, if this account is a doctor.
            doctor: { select: { id: true } },
          },
        });
        token.role = dbUser?.role ?? Role.PATIENT;
        token.patientId = dbUser?.patientId ?? undefined;
        token.doctorId = dbUser?.doctor?.id ?? undefined;
      }
      return token;
    },

    // In JWT mode, session() receives `token` (not `user`). Move the custom
    // fields off the token onto the public session.user shape.
    async session({ session, token }) {
      if (session.user) {
        // `token.sub` is the user id (Auth.js sets it automatically).
        session.user.id = token.sub ?? session.user.id;
        session.user.role = token.role ?? Role.PATIENT;
        session.user.patientId = token.patientId;
        session.user.doctorId = token.doctorId;
      }
      return session;
    },
  },

  events: {
    // Fires once when the user record is first created in the DB.
    // (Adapter writes the User row on Google sign-in; this hook then sets the
    // role and links to an existing Patient by email. Credentials registration
    // creates User + Patient atomically in /api/register, so this event does
    // not fire for that path.)
    async createUser({ user }) {
      if (!user.email || !user.id) return;

      const email = user.email.toLowerCase();
      const adminEmails = parseEmailList(process.env.AUTH_ADMIN_EMAILS);
      const staffEmails = parseEmailList(process.env.AUTH_STAFF_EMAILS);
      // DOCTOR is assigned in a CONTROLLED way only — via this allowlist (or
      // by an admin manually). Never automatically from a self-service signup.
      // NOTE: this only sets the role; linking the User to a Doctor row
      // (Doctor.userId) is a separate, deliberate step (seed / admin action),
      // so the session's doctorId stays empty until that link exists.
      const doctorEmails = parseEmailList(process.env.AUTH_DOCTOR_EMAILS);

      let role: Role = Role.PATIENT;
      let patientId: string | undefined;

      if (adminEmails.includes(email)) {
        role = Role.ADMIN;
      } else if (staffEmails.includes(email)) {
        role = Role.STAFF;
      } else if (doctorEmails.includes(email)) {
        role = Role.DOCTOR;
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
