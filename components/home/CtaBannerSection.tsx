import { cn } from "@/lib/cn";
import { btnBase, btnMint } from "@/lib/buttons";
import { displayL } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { IcoArrow, IcoTooth } from "@/components/icons";

export function CtaBannerSection() {
  return (
    <section id="booking" className="bg-paper pb-[140px]">
      <Container>
        <Reveal className="relative grid grid-cols-1 items-center gap-16 overflow-hidden rounded-[4px] bg-[linear-gradient(135deg,#0F1E36_0%,#0A1628_60%,#050d1b_100%)] px-20 py-24 text-white max-[1024px]:gap-9 max-[1024px]:px-12 max-[1024px]:py-16 max-[720px]:px-7 lg:grid-cols-[1.4fr_1fr]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_360px_at_100%_100%,rgba(0,201,167,0.28),transparent_60%),radial-gradient(500px_280px_at_0%_0%,rgba(0,201,167,0.10),transparent_60%)]"
          />
          <IcoTooth
            size={400}
            className="pointer-events-none absolute -right-[60px] -top-[60px] text-mint opacity-[0.07]"
          />

          <div className="relative">
            <Eyebrow className="text-white/55">Запис на 2026</Eyebrow>
            <h2 className={cn(displayL, "mt-[18px] text-white")}>
              Готові до посмішки,
              <br />
              про яку <em className="italic text-mint">мріяли роками?</em>
            </h2>
            <p className="mt-5 max-w-[48ch] text-[18px] leading-[1.55] text-white/65">
              Перша консультація з планом лікування — безкоштовна. Запишіться у
              зручний час, ми передзвонимо протягом 15 хвилин.
            </p>
          </div>

          <div className="relative flex flex-col gap-5 text-right max-[1024px]:text-left lg:justify-self-end">
            <a
              href="#"
              className={cn(btnBase, btnMint, "justify-center px-7 py-[18px] text-base")}
            >
              Записатися на безкоштовну консультацію
              <IcoArrow size={16} />
            </a>
            <div className="text-[14px] text-white/60">
              або зателефонуйте прямо зараз
            </div>
            <div className="font-serif text-[36px] tracking-[-0.01em] text-white">
              +38 <em className="not-italic text-mint">(044)</em> 222 18 00
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
