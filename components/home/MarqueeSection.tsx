import { Fragment } from "react";

const ITEMS = [
  "Безболісне лікування",
  "Цифрова діагностика 3D",
  "Європейські матеріали",
  "Гарантія до 10 років",
  "Сімейний підхід",
];

function MarqueeSet() {
  return (
    <div className="flex items-center gap-16">
      {ITEMS.map((item) => (
        <Fragment key={item}>
          <span>{item}</span>
          <span className="text-mint">✦</span>
        </Fragment>
      ))}
    </div>
  );
}

export function MarqueeSection() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden border-y border-white/5 bg-navy-900 py-[22px] text-white/70"
    >
      <div className="flex w-max animate-marq gap-16 whitespace-nowrap font-serif text-[22px] italic">
        <MarqueeSet />
        <MarqueeSet />
      </div>
    </div>
  );
}
