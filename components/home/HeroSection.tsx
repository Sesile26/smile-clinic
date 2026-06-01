import { cn } from "@/lib/cn";
import { btnBase, btnGhost, btnPrimary } from "@/lib/buttons";
import { displayXl } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { IcoArrow, IcoStar, IcoTooth } from "@/components/icons";

const TRUST = [
  { n: "18", l: "Років практики" },
  { n: "3", l: "Клініки у Києві" },
  { n: "24.5K+", l: "Щасливих пацієнтів" },
];

function Stars({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-0.5 text-mint", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <IcoStar key={i} size={14} />
      ))}
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pb-[120px] pt-[72px] max-[720px]:pb-20 max-[720px]:pt-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_600px_at_88%_10%,rgba(0,201,167,0.08),transparent_60%),radial-gradient(800px_500px_at_5%_80%,rgba(10,22,40,0.04),transparent_60%)]"
      />
      <Container className="relative grid grid-cols-1 items-center gap-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Copy */}
        <Reveal className="hero-copy">
          <Eyebrow className="mb-7">Бутік-стоматологія у центрі Києва</Eyebrow>
          <h1 className={cn(displayXl, "mb-7 text-navy-900")}>
            Естетика, що
            <br />
            <span className="italic text-mint-600">говорить</span> за вас.
          </h1>
          <p className="mb-10 max-w-[46ch] text-[clamp(16px,1.3vw,19px)] leading-[1.6] text-navy-400">
            Преміальна стоматологічна допомога з увагою до кожної деталі — від
            першої консультації до фінального відтінку емалі.
          </p>
          <div className="mb-14 flex flex-wrap items-center gap-3">
            <a href="#booking" className={cn(btnBase, btnPrimary)}>
              Записатися онлайн
              <IcoArrow size={16} />
            </a>
            <a href="#services" className={cn(btnBase, btnGhost)}>
              Дізнатися більше
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-9 border-t border-[color:var(--line)] pt-8 max-[720px]:gap-6">
            {TRUST.map((item, i) => (
              <div key={item.l} className="flex items-center gap-9 max-[720px]:gap-6">
                {i > 0 && (
                  <span className="h-9 w-px bg-[color:var(--line-2)] max-[720px]:hidden" />
                )}
                <div className="flex flex-col gap-1">
                  <span className="font-serif text-[32px] leading-none tracking-[-0.02em] text-navy-900">
                    {item.n}
                  </span>
                  <span className="text-xs uppercase tracking-[0.04em] text-navy-400">
                    {item.l}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Visual */}
        <Reveal
          className="relative mx-auto aspect-[4/5] w-full max-w-[520px] lg:mx-0 lg:max-w-none"
          style={{ transitionDelay: "0.15s" }}
        >
          <IcoTooth
            size={380}
            className="pointer-events-none absolute -right-20 -top-10 z-0 text-mint opacity-[0.12]"
          />
          <div className="relative h-full w-full overflow-hidden rounded-[20px] bg-[linear-gradient(160deg,#112340_0%,#0A1628_100%)] shadow-s3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=900&q=80"
              alt="Лікар оглядає зуби пацієнта"
              loading="lazy"
              className="h-full w-full object-cover [filter:saturate(.95)_contrast(1.02)]"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,22,40,0)_50%,rgba(10,22,40,0.35)_100%)]" />
          </div>

          {/* Rating card */}
          <div className="absolute left-[-36px] top-8 z-[3] flex animate-floaty items-center gap-3 rounded-[14px] bg-white px-[18px] py-4 shadow-s2 max-[1024px]:left-[-12px]">
            <div>
              <div className="font-serif text-[28px] leading-none">4.96</div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-navy-400">
                Google · 1 248 відгуків
              </div>
            </div>
            <Stars />
          </div>

          {/* Review card */}
          <div className="absolute bottom-[-28px] right-[-36px] z-[3] flex max-w-[280px] flex-col items-start gap-2 rounded-[14px] bg-white px-[18px] py-4 shadow-s2 [animation:floaty_7s_ease-in-out_infinite_-1.5s] max-[1024px]:right-[-12px]">
            <Stars />
            <p className="font-serif text-[17px] italic leading-[1.35] text-navy-900">
              Перша клініка, де я не нервувала.
            </p>
            <span className="text-xs text-navy-400">
              — Олена, постійна пацієнтка
            </span>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
