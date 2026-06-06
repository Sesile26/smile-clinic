import { cn } from "@/lib/cn";
import { btnLink } from "@/lib/buttons";
import { displayL } from "@/lib/typography";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { IcoArrow, IcoStar } from "@/components/icons";

interface Doctor {
  name: string;
  spec: string;
  rating: string;
  bio: string;
  metaCases: string;
  metaLangs: string;
  img: string;
}

const DOCTORS: Doctor[] = [
  {
    name: "Анна Петренко",
    spec: "Ортодонт · 12 років",
    rating: "4.9",
    bio: "Сертифікований провайдер Invisalign Diamond. Спеціалізується на естетичній корекції прикусу у дорослих.",
    metaCases: "820+",
    metaLangs: "UA · EN · DE",
    img: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Михайло Коваленко",
    spec: "Хірург-імплантолог · 16 років",
    rating: "5.0",
    bio: "Випускник ITI Швейцарія. Виконує імплантацію All-on-4 та кісткові аугментації будь-якої складності.",
    metaCases: "1 400+",
    metaLangs: "UA · EN",
    img: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Софія Шевченко",
    spec: "Дитячий стоматолог · 9 років",
    rating: "4.9",
    bio: "Магістр дитячої стоматології (Гетеборг). Працює з дітьми від року, у тому числі з особливими потребами.",
    metaCases: "3 200+",
    metaLangs: "UA · EN · PL",
    img: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=700&q=80",
  },
];

export function DoctorsSection() {
  return (
    <section
      id="doctors"
      className="scroll-mt-24 bg-paper pb-[140px] pt-20 max-[720px]:py-20"
    >
      <Container>
        <Reveal className="mb-12 grid grid-cols-1 items-start gap-6 lg:mb-[72px] lg:grid-cols-2 lg:items-end lg:gap-16">
          <div>
            <Eyebrow>Команда</Eyebrow>
            <h2 className={cn(displayL, "mt-3.5 text-navy-900")}>
              Лікарі, які
              <br />
              <em className="italic text-mint-600">пам’ятають імена.</em>
            </h2>
          </div>
          <div className="flex flex-col items-start gap-4">
            <p className="text-[18px] leading-[1.55] text-navy-400">
              Кожен наш фахівець проходить мінімум 80 годин додаткового навчання
              щороку у клініках Швейцарії, Німеччини та США.
            </p>
            <a href="#" className={cn(btnLink, "self-start")}>
              Переглянути всю команду
              <IcoArrow size={14} />
            </a>
          </div>
        </Reveal>

        <Reveal
          stagger
          className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3"
        >
          {DOCTORS.map((doc) => (
            <article key={doc.name} className="group flex flex-col">
              <div className="relative mb-6 aspect-[4/5] overflow-hidden rounded-[4px] bg-cream">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={doc.img}
                  alt={doc.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[600ms] ease-smooth group-hover:scale-[1.03]"
                />
                <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/[0.94] px-3 py-1.5 text-[13px] font-semibold backdrop-blur-[6px]">
                  <IcoStar size={12} className="text-mint" />
                  {doc.rating}
                </div>
              </div>
              <div className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-mint-600">
                {doc.spec}
              </div>
              <h3 className="m-0 mb-3 font-serif text-[30px] leading-[1.1] tracking-[-0.01em] text-navy-900">
                {doc.name}
              </h3>
              <p className="m-0 mb-[18px] text-[14px] leading-[1.55] text-navy-400">
                {doc.bio}
              </p>
              <div className="mt-auto flex gap-[18px] border-t border-[color:var(--line)] pt-[18px] text-[13px] text-navy-400">
                <span>
                  <b className="font-medium text-navy-900">{doc.metaCases}</b>{" "}
                  завершених кейсів
                </span>
                <span>
                  <b className="font-medium text-navy-900">{doc.metaLangs}</b>
                </span>
              </div>
            </article>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
