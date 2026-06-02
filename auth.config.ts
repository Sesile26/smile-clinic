import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config. Contains ONLY what is allowed to run in the Edge
 * runtime (no Prisma, no Node built-ins). Imported by middleware.ts and
 * spread into the full config in auth.ts.
 *
 * Do NOT add:
 *   - PrismaAdapter or any `@/lib/prisma` import
 *   - Anything from `@/lib/generated/prisma`
 *   - Callbacks/events that touch the database
 *   - Node built-ins (fs, path, crypto from "node:*", etc.)
 */
const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  trustHost: true,
} satisfies NextAuthConfig;

export default authConfig;
