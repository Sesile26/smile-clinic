"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { IcoGoogle } from "@/components/icons";

export function GoogleSignInButton({
  className,
}: {
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => signIn("google")}
      className={
        className ??
        "inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-[color:var(--line-2)] bg-white px-3.5 py-3 text-sm font-medium text-navy-900 transition-colors hover:bg-cream"
      }
    >
      <IcoGoogle size={18} />
      Продовжити з Google
    </button>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={
        className ??
        "rounded-lg border border-[color:var(--line-2)] px-4 py-2 text-sm font-medium text-navy-900 transition-colors hover:bg-cream"
      }
    >
      Вийти
    </button>
  );
}

export function AuthStatus() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        {session.user.image && (
          <img
            src={session.user.image}
            alt={session.user.name ?? ""}
            className="h-8 w-8 rounded-full object-cover"
          />
        )}
        <span className="text-sm text-navy-700">
          {session.user.name ?? session.user.email}
        </span>
        <SignOutButton />
      </div>
    );
  }

  return (
    <GoogleSignInButton className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black" />
  );
}
