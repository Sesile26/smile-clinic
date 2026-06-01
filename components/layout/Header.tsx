"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { btnBase, btnMint } from "@/lib/buttons";
import { useLoginModal } from "@/components/ui/LoginModalProvider";
import { IcoArrow, IcoMenu, IcoTooth } from "@/components/icons";

const NAV_LINKS = [
  { href: "#services", label: "Послуги" },
  { href: "#doctors", label: "Лікарі" },
  { href: "#prices", label: "Ціни" },
  { href: "#contacts", label: "Контакти" },
];

function Logo() {
  return (
    <a href="#" className="flex items-center gap-2.5 font-serif text-2xl font-medium tracking-[-0.01em]">
      <span className="relative grid h-[30px] w-[30px] place-items-center rounded-full bg-navy-900">
        <IcoTooth size={16} className="text-white" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-mint" />
      </span>
      SmileClinic
    </a>
  );
}

export function Header() {
  const { open } = useLoginModal();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-[14px] backdrop-saturate-[1.6] transition-[border-color,background] duration-300 ease-smooth",
        scrolled
          ? "border-[color:var(--line)] bg-white/[0.88]"
          : "border-transparent bg-white/[0.72]",
      )}
    >
      <div className="mx-auto flex h-[78px] w-full max-w-[1280px] items-center justify-between px-8 max-[720px]:px-5">
        <Logo />

        <nav className="hidden gap-8 text-sm font-medium text-navy-700 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative py-1.5 transition-colors duration-200 hover:text-navy-900"
            >
              {link.label}
              <span className="absolute -bottom-0.5 left-0 right-0 h-px origin-left scale-x-0 bg-mint transition-transform duration-300 ease-smooth group-hover:scale-x-100" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={open}
            className="rounded-full px-4 py-2.5 text-sm font-medium text-navy-900 transition-colors duration-200 hover:bg-cream"
          >
            Увійти
          </button>
          <a href="#booking" className={cn(btnBase, btnMint, "hidden sm:inline-flex")}>
            Записатися
            <IcoArrow size={16} />
          </a>
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full text-navy-900 transition-colors hover:bg-cream md:hidden"
          >
            <IcoMenu size={22} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="border-t border-[color:var(--line)] bg-white/95 px-5 py-4 backdrop-blur-[14px] md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-navy-700 hover:bg-cream"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#booking"
              onClick={() => setMenuOpen(false)}
              className={cn(btnBase, btnMint, "mt-2 justify-center sm:hidden")}
            >
              Записатися
              <IcoArrow size={16} />
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
