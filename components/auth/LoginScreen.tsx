"use client";

import { useRouter } from "next/navigation";
import { LoginModal } from "@/components/ui/LoginModal";

/**
 * Full-page /login: the shared LoginModal rendered open over a quiet page
 * background. Closing the dialog means "I don't want to sign in" → home.
 * After a successful sign-in the modal itself navigates to callbackUrl.
 */
export function LoginScreen({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  return (
    <>
      <div className="min-h-[60vh]" aria-hidden="true" />
      <LoginModal
        open
        onClose={() => router.push("/")}
        callbackUrl={callbackUrl}
      />
    </>
  );
}
