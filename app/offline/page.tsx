import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { btnBase, btnPrimary } from "@/lib/buttons";
import { displayL } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { IcoTooth } from "@/components/icons";

export const metadata: Metadata = {
  title: "Немає звʼязку — SmileClinic",
};

/**
 * Static offline shell. Served by the service worker via
 * `fallbacks.document` when a navigation request fails the network check.
 *
 * MUST be statically prerenderable (no DB queries, no auth() calls) so that
 * Workbox can precache it at build time. No per-user data here.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center bg-paper py-24">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <span className="relative mb-8 inline-grid h-[60px] w-[60px] place-items-center rounded-full bg-navy-900">
            <IcoTooth size={28} className="text-white" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-mint" />
          </span>

          <Eyebrow className="justify-self-center">Офлайн</Eyebrow>
          <h1 className={cn(displayL, "mt-3.5 text-navy-900")}>
            Немає звʼязку <em className="italic text-mint-600">з мережею.</em>
          </h1>
          <p className="mt-5 text-[18px] leading-[1.55] text-navy-400">
            Перевірте зʼєднання й спробуйте ще раз. Якщо ви вже були в кабінеті
            — ваші останні записи доступні офлайн на головній.
          </p>

          <div className="mt-10">
            <Link href="/" className={cn(btnBase, btnPrimary)}>
              На головну
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
