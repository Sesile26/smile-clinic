import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Next.js 16 renamed the "middleware" convention to "proxy". Same default-export
// + `config` shape; this file replaces the old middleware.ts.

// Routes that require ADMIN or STAFF role
const STAFF_ROUTES = ["/dashboard", "/patients", "/appointments", "/admin"];

// Routes that require any authenticated user (role-specific UI is decided in
// the page itself — /booking shows slot management to doctors/staff/admin and
// booking to patients; here we only require a session).
const AUTH_ROUTES = ["/cabinet", "/booking", "/my"];

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isLoggedIn = !!session;

  const isStaffRoute = STAFF_ROUTES.some((p) =>
    nextUrl.pathname.startsWith(p),
  );
  const isAuthRoute = AUTH_ROUTES.some((p) =>
    nextUrl.pathname.startsWith(p),
  );

  if (isStaffRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const role = session?.user?.role;
    if (role !== "ADMIN" && role !== "STAFF") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (isAuthRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

// Next.js 16 proxy ALWAYS runs on the Node.js runtime (no `runtime` key here,
// and none needed) — so importing the full `auth.ts` (PrismaAdapter + generated
// client, which pull in node:path/node:fs) works, and the session cookie is
// decoded with the same secret as the rest of the app.
export const config = {
  matcher: [
    // Run on all paths except static assets, images, PWA assets, and auth API
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons|api/auth).*)",
  ],
};
