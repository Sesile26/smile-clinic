import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IcoStar } from "@/components/icons";

interface Testimonial {
  initials: string;
  name: string;
  meta: string;
  quote: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    initials: "ОК",
    name: "Олена Кравець",
    meta: "Пацієнтка з 2022 року · Поділ",
    quote:
      "Поставила вініри у Михайла Олександровича — результат перевершив очікування. Жодного дискомфорту під час процедури, прозора комунікація на кожному етапі.",
  },
  {
    initials: "ІМ",
    name: "Ірина Мельник",
    meta: "Мама пацієнта · Печерськ",
    quote:
      "Дитина три роки боялась стоматолога. Софія Олегівна знайшла підхід за п’ять хвилин — тепер просимось у клініку самі. Окремо вдячна за чесну ціну.",
  },
  {
    initials: "АГ",
    name: "Андрій Гончар",
    meta: "Пацієнт з 2024 року · Оболонь",
    quote:
      "Робив імплантацію всієї нижньої щелепи. Зробили 3D-план, показали, як виглядатиме результат — і через три місяці я знову їм стейк. Без перебільшення, життя до і після.",
  },
];

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="bg-cream py-[140px] max-[720px]:py-20"
    >
      <Container>
        <SectionHeader
          eyebrow="Відгуки"
          title={
            <>
              Голоси, що варті
              <br />
              <em className="italic text-mint-600">тисячі реклам.</em>
            </>
          }
          lede="Понад 98% пацієнтів повертаються до нас знову — і приводять родину. Ось декілька історій з 1 200+ публічних відгуків."
        />

        <Reveal
          stagger
          className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3"
        >
          {TESTIMONIALS.map((t) => (
            <article
              key={t.name}
              className="flex flex-col gap-5 rounded-[6px] border border-[color:var(--line)] bg-white px-9 py-10 transition-[transform,box-shadow] duration-300 ease-smooth hover:-translate-y-1 hover:shadow-s2"
            >
              <div className="flex gap-0.5 text-mint">
                {Array.from({ length: 5 }).map((_, i) => (
                  <IcoStar key={i} size={16} />
                ))}
              </div>
              <p className="m-0 font-serif text-[22px] leading-[1.35] text-navy-900 [text-wrap:pretty]">
                <span className="mr-0.5 text-mint">“</span>
                {t.quote}
                <span className="ml-0.5 text-mint">”</span>
              </p>
              <div className="mt-auto flex items-center gap-3 border-t border-[color:var(--line)] pt-4">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(135deg,#0A1628,#1A2B45)] font-serif text-[16px] font-medium text-mint">
                  {t.initials}
                </div>
                <div>
                  <div className="text-[14px] font-medium text-navy-900">
                    {t.name}
                  </div>
                  <div className="text-[12px] text-navy-400">{t.meta}</div>
                </div>
              </div>
            </article>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
