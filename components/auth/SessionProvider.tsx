"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { useMirror } from "@/hooks/useMirror";

/**
 * Invisible orchestrator. Sits inside NextAuthSessionProvider so it can
 * call useSession via useMirror. Renders children unchanged.
 *
 * Lifted out into its own component so the public SessionProvider stays
 * the lone JSX boundary and we don't need to add a second client wrapper
 * in app/layout.tsx.
 */
function MirrorOrchestrator({ children }: { children: ReactNode }) {
  useMirror();
  return <>{children}</>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <MirrorOrchestrator>{children}</MirrorOrchestrator>
    </NextAuthSessionProvider>
  );
}
