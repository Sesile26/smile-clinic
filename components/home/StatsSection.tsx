import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface Stat {
  n: React.ReactNode;
  l: string;
}

const STATS: Stat[] = [
  { n: <>18<em className="not-italic text-mint">+</em></>, l: "Років досвіду" },
  { n: <>24<em className="not-italic text-mint">.5K</em></>, l: "Пацієнтів" },
  { n: "12", l: "Лікарів у штаті" },
  { n: "3", l: "Клініки в Києві" },
];

export function StatsSection() {
  return (
    <section id="stats" className="bg-paper pb-[160px] pt-20">
      <Container className="relative">
        <SectionHeader
          className="mb-12 lg:mb-12"
          eyebrow="Чому SmileClinic"
          title={
            <>
              Цифри, на які
              <br />
              <em className="italic text-mint-600">приємно посміхатися.</em>
            </>
          }
          lede="За 18 років практики ми створили команду, яку рекомендують поколіннями. Сімейні портрети нашої пацієнтської бази — найкраще портфоліо."
        />

        <Reveal className="relative -mt-10 grid grid-cols-1 gap-8 overflow-hidden rounded-[4px] bg-navy-900 px-14 py-16 text-white shadow-s3 max-[720px]:px-9 max-[720px]:py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_90%_100%,rgba(0,201,167,0.18),transparent_60%),radial-gradient(400px_200px_at_10%_0%,rgba(0,201,167,0.06),transparent_70%)]"
          />
          {STATS.map((stat) => (
            <div
              key={stat.l}
              className="relative flex flex-col gap-2.5 border-white/[0.08] [&:not(:last-child)]:border-b [&:not(:last-child)]:pb-6 lg:pr-6 lg:[&:not(:last-child)]:border-b-0 lg:[&:not(:last-child)]:border-r lg:[&:not(:last-child)]:pb-0"
            >
              <div className="font-serif text-[clamp(54px,5.4vw,78px)] leading-none tracking-[-0.03em] text-white">
                {stat.n}
              </div>
              <div className="text-[13px] uppercase tracking-[0.12em] text-white/60">
                {stat.l}
              </div>
            </div>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
