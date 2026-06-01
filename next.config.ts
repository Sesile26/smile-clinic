import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // @ducanh2912/next-pwa does not cache /api/* routes by default.
  // Auth.js endpoints (/api/auth/*) are therefore always fetched from the
  // network — no extra configuration needed. The publicExcludes list below
  // prevents the SW from pre-caching any static files under /api/.
  publicExcludes: ["!api/**"],
});

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
