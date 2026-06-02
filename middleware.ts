import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Routes that require ADMIN or STAFF role
const STAFF_ROUTES = ["/dashboard", "/patients", "/appointments"];

// Routes that require any authenticated user
const AUTH_ROUTES = ["/cabinet"];

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

export const config = {
  // Node runtime — REQUIRED because middleware imports the full `auth.ts`,
  // which loads PrismaAdapter and the generated Prisma client (both pull in
  // `node:path`/`node:fs` that the Edge runtime cannot resolve).
  //
  // Critically, this also lets the middleware decode the database-strategy
  // session cookie properly. With the edge-only split config (auth.config),
  // middleware defaults to JWT decoding and falls over with
  // `JWEInvalid: Invalid Compact JWE` on every request after a Google sign-in,
  // because the cookie holds a session-token UUID, not a JWE — making the user
  // appear logged-out and the UI flicker back to anonymous (the symptom that
  // looked like "the Google button reloads the page").
  //
  // Supported natively in Next.js 16 (no experimental flag).
  runtime: "nodejs",
  matcher: [
    // Run on all paths except static assets, images, PWA assets, and auth API
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons|api/auth).*)",
  ],
};
