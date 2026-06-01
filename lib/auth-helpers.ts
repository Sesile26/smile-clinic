import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * Server-side session guard. Redirects unauthenticated requests to /login.
 * If allowedRoles is provided, redirects unauthorised roles to /.
 *
 * Usage in a Server Component or Route Handler:
 *   const session = await requireAuth(["ADMIN", "STAFF"]);
 */
export async function requireAuth(allowedRoles?: Role[]) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    redirect("/");
  }

  return session;
}

export async function requireStaff() {
  return requireAuth([Role.ADMIN, Role.STAFF]);
}

export async function requireAdmin() {
  return requireAuth([Role.ADMIN]);
}

export async function requirePatient() {
  return requireAuth([Role.PATIENT, Role.ADMIN, Role.STAFF]);
}
