import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  IcoArrow,
  IcoBraces,
  IcoChild,
  IcoCrown,
  IcoEmergency,
  IcoImplant,
  IcoSparkle,
  type IconProps,
} from "@/components/icons";

interface Service {
  num: string;
  Icon: (props: IconProps) => React.JSX.Element;
  title: string;
  desc: string;
}

const SERVICES: Service[] = [
  {
    num: "01",
    Icon: IcoSparkle,
    title: "Відбілювання",
    desc: "Безпечне освітлення емалі до 8 тонів за один візит. Системи Philips Zoom та Opalescence — без чутливості після процедури.",
  },
  {
    num: "02",
    Icon: IcoImplant,
    title: "Імплантація",
    desc: "Швейцарські імпланти Straumann та Nobel Biocare. Цифрове 3D-планування й гарантія до 10 років на роботу хірурга.",
  },
  {
    num: "03",
    Icon: IcoBraces,
    title: "Ортодонтія",
    desc: "Прозорі капи Invisalign, лінгвальні та керамічні брекет-системи. Рівні зуби за 6–18 місяців під контролем сертифікованих фахівців.",
  },
  {
    num: "04",
    Icon: IcoChild,
    title: "Дитяча стоматологія",
    desc: "Окремий кабінет з ігровою зоною, лікування в кисневій сідації для діток від 1 року. Без сліз, без страху, без поспіху.",
  },
  {
    num: "05",
    Icon: IcoCrown,
    title: "Протезування",
    desc: "Цирконієві коронки, вініри E.max, повне естетичне моделювання посмішки. Виготовлення у власній цифровій лабораторії.",
  },
  {
    num: "06",
    Icon: IcoEmergency,
    title: "Невідкладна допомога",
    desc: "Гострий біль приймаємо без черги — щодня з 8:00 до 22:00. Виклик чергового лікаря на дім або у клініку протягом 40 хвилин.",
  },
];

export function ServicesSection() {
  return (
    <section id="services" className="scroll-mt-24 bg-cream py-[140px] max-[720px]:py-20">
      <Container>
        <SectionHeader
          eyebrow="Послуги"
          title={
            <>
              Шість напрямів,
              <br />
              <em className="italic text-mint-600">один рівень якості.</em>
            </>
          }
          lede="Від базової гігієни до складних хірургічних втручань — наша команда супроводжує пацієнта на кожному етапі. Жодного компромісу між технологіями та людським підходом."
        />

        <Reveal
          stagger
          className="grid grid-cols-1 overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-[color:var(--line)] sm:grid-cols-2 lg:grid-cols-3 [gap:1px]"
        >
          {SERVICES.map(({ num, Icon, title, desc }) => (
            <article
              key={num}
              className="group relative flex min-h-[320px] flex-col gap-[18px] bg-cream px-9 pb-10 pt-11 transition-[background,transform] duration-300 ease-smooth hover:z-[2] hover:-translate-y-0.5 hover:bg-white hover:shadow-s2"
            >
              <span className="absolute right-[26px] top-[22px] font-serif text-[18px] italic text-navy-400 opacity-50">
                {num}
              </span>
              <div className="grid h-[54px] w-[54px] place-items-center rounded-[14px] bg-navy-900 text-mint transition-colors duration-300 ease-smooth group-hover:bg-mint group-hover:text-navy-900">
                <Icon size={26} />
              </div>
              <h3 className="m-0 font-serif text-[26px] leading-[1.1] tracking-[-0.01em] text-navy-900">
                {title}
              </h3>
              <p className="m-0 flex-1 text-[15px] leading-[1.55] text-navy-400">
                {desc}
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.02em] text-navy-900"
              >
                Дізнатися більше
                <IcoArrow
                  size={14}
                  className={cn(
                    "transition-transform duration-300 ease-smooth group-hover:translate-x-1",
                  )}
                />
              </a>
            </article>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
