"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { btnBase, btnMint } from "@/lib/buttons";

/** Seconds before the automatic redirect home kicks in. Long enough that the
 *  visitor reads "page not found" and doesn't mistake the jump for a bug. */
const REDIRECT_DELAY_S = 5;

/**
 * Global 404 for genuinely unknown URLs (known routes are never affected —
 * Next renders this only when no route matches). Shows a short message with
 * a countdown, then redirects to "/"; the button lets you skip the wait.
 */
export default function NotFound() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY_S);

  useEffect(() => {
    const tick = window.setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) router.replace("/");
  }, [secondsLeft, router]);

  return (
    <main className="grid min-h-[70vh] place-items-center px-6 py-16">
      <div className="text-center">
        <p className="mb-3 font-serif text-[64px] leading-none tracking-[-0.03em] text-navy-900">
          4<em className="italic text-mint-600">0</em>4
        </p>
        <h1 className="mb-2 font-serif text-[26px] leading-tight tracking-[-0.015em] text-navy-900">
          Сторінку не знайдено
        </h1>
        <p className="mx-auto mb-7 max-w-[40ch] text-sm leading-[1.55] text-navy-400">
          Такої адреси не існує або її було переміщено. Повернемо вас на
          головну через{" "}
          <span aria-live="polite" className="font-medium text-navy-900">
            {secondsLeft} с
          </span>
          .
        </p>
        <Link href="/" className={cn(btnBase, btnMint)}>
          На головну зараз
        </Link>
      </div>
    </main>
  );
}
