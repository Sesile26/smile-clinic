import { LoginScreen } from "@/components/auth/LoginScreen";

/**
 * Only same-origin relative paths are honoured — an absolute URL or a
 * protocol-relative "//host" would be an open redirect, so anything that
 * doesn't look like "/path" falls back to "/".
 */
function sanitizeCallbackUrl(raw: string | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/\\")
  ) {
    return "/";
  }
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return <LoginScreen callbackUrl={sanitizeCallbackUrl(callbackUrl)} />;
}
