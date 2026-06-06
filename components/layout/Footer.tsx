import { cn } from "@/lib/cn";
import {
  IcoFacebook,
  IcoInstagram,
  IcoTelegram,
  IcoTooth,
  IcoYoutube,
} from "@/components/icons";

const SERVICES = [
  "Естетична стоматологія",
  "Імплантація",
  "Ортодонтія",
  "Дитяча стоматологія",
  "Невідкладна допомога",
];

const COMPANY = ["Про нас", "Лікарі", "Ціни", "Кейси та фото", "Кар’єра"];

const SOCIALS = [
  { label: "Instagram", Icon: IcoInstagram },
  { label: "Facebook", Icon: IcoFacebook },
  { label: "Telegram", Icon: IcoTelegram },
  { label: "YouTube", Icon: IcoYoutube },
];

function FootColumn({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <div className="mb-5 text-[13px] font-medium uppercase tracking-[0.12em] text-white">
        {heading}
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
        {items.map((item) => (
          <li key={item}>
            <a
              href="#"
              className="text-white/60 transition-colors duration-200 hover:text-mint"
            >
              {item}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer id="contacts" className="scroll-mt-24 bg-navy-900 pb-10 pt-24 text-white/70">
      <div className="mx-auto w-full max-w-[1280px] px-8 max-[720px]:px-5">
        <div className="mb-16 grid grid-cols-1 gap-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-5 flex items-center gap-2.5 font-serif text-2xl text-white">
              <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-white">
                <IcoTooth size={16} className="text-navy-900" />
              </span>
              SmileClinic
            </div>
            <p className="m-0 mb-6 max-w-[36ch] text-sm leading-[1.6] text-white/55">
              Бутік-мережа стоматологічних клінік у Києві. Поєднуємо швейцарські
              протоколи лікування з українською гостинністю.
            </p>
            <div className="flex gap-2.5">
              {SOCIALS.map(({ label, Icon }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 transition-all duration-200 hover:border-mint hover:bg-mint hover:text-navy-900"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          <FootColumn heading="Послуги" items={SERVICES} />
          <FootColumn heading="Компанія" items={COMPANY} />

          <div>
            <div className="mb-5 text-[13px] font-medium uppercase tracking-[0.12em] text-white">
              Контакти
            </div>
            <div className="text-sm leading-[1.7] text-white/60">
              <b className="font-medium text-white">Клініка Поділ</b>
              <br />
              вул. Хорива, 24, Київ
              <br />
              <br />
              <b className="font-medium text-white">+38 (044) 222 18 00</b>
              <br />
              <a href="mailto:info@smileclinic.ua" className="hover:text-mint">
                info@smileclinic.ua
              </a>
              <br />
              <br />
              Пн–Сб · 8:00 — 22:00
              <br />
              Нд · 10:00 — 19:00
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col items-start gap-4 border-t border-white/[0.08] pt-8 text-[13px] text-white/45",
            "md:flex-row md:items-center md:justify-between",
          )}
        >
          <div>
            © 2026 SmileClinic. Усі права захищено. Ліцензія МОЗ України №АЕ
            460237.
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white/70">
              Політика конфіденційності
            </a>
            <a href="#" className="hover:text-white/70">
              Публічна оферта
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
