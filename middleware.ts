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
  matcher: [
    // Run on all paths except static assets, images, PWA assets, and auth API
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons|api/auth).*)",
  ],
};
