"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/cn";
import { wipeDexie } from "@/lib/db";
import { btnBase, btnMint } from "@/lib/buttons";
import { useLoginModal } from "@/components/ui/LoginModalProvider";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { IcoArrow, IcoMenu, IcoTooth } from "@/components/icons";

// Section anchors on the home page. Always prefixed with "/" so a click from
// another route (e.g. /booking) navigates home first, then scrolls — the
// HashScrollHandler on the home page handles the post-mount scroll.
const NAV_LINKS = [
  { href: "/#services", label: "Послуги" },
  { href: "/#doctors", label: "Лікарі" },
  { href: "/#prices", label: "Ціни" },
  { href: "/#contacts", label: "Контакти" },
];

function Logo() {
  return (
    <Link
      href="/"
      aria-label="SmileClinic — на головну"
      className="flex items-center gap-2.5 rounded-md font-serif text-2xl font-medium tracking-[-0.01em] focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2"
    >
      <span className="relative grid h-[30px] w-[30px] place-items-center rounded-full bg-navy-900">
        <IcoTooth size={16} className="text-white" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-mint" />
      </span>
      SmileClinic
    </Link>
  );
}

interface AvatarMenuProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  /** Session role — gates the staff-only menu items. */
  role?: string;
}

/**
 * Trigger-button + dropdown with name/email and a "Вийти" action.
 *
 * Avatar image: plain <img> with referrerPolicy="no-referrer" instead of
 * next/image. Why:
 *   - sidesteps next.config images.remotePatterns (no infra touched);
 *   - Google sometimes refuses to serve avatar URLs when the Referer header
 *     points at localhost/private hosts — `no-referrer` makes that reliable;
 *   - the file is 40×40 px, next/image optimisation gain is negligible here.
 */
function AvatarMenu({ user, role }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // STAFF/ADMIN/DOCTOR see the admin panel. A DOCTOR goes straight to their
  // only tab (/admin/patients) — bare /admin is staff-only in proxy.ts.
  const isManager = role === "STAFF" || role === "ADMIN" || role === "DOCTOR";
  const adminHref = role === "DOCTOR" ? "/admin/patients" : "/admin";

  // Click-outside + Escape close. Listeners are only attached while open
  // to avoid the "clicked trigger to open immediately closes" race.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Move focus to the first menu item on open (the orders link for staff,
  // otherwise "Вийти").
  useEffect(() => {
    if (open) {
      containerRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus();
    }
  }, [open]);

  const fallbackLetter = (user.name ?? user.email ?? "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    // SECURITY: drop the Dexie mirror BEFORE the session cookie is cleared.
    // On a shared device this is what prevents the next user from seeing
    // the previous user's appointments via useLiveQuery (the SW caches only
    // public assets; user data lives in IndexedDB).
    await wipeDexie();
    void signOut({ callbackUrl: "/" });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          user.name ?? user.email ?? "Меню користувача"
        }
        onClick={() => setOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-[color:var(--line-2)] bg-cream text-sm font-medium text-navy-900 transition-colors duration-200 hover:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{fallbackLetter}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Користувач"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-[color:var(--line)] bg-white shadow-s2"
        >
          <div className="border-b border-[color:var(--line)] px-4 py-3">
            {user.name && (
              <div className="truncate text-sm font-medium text-navy-900">
                {user.name}
              </div>
            )}
            {user.email && (
              <div className="truncate text-xs text-navy-400">{user.email}</div>
            )}
          </div>
          {/* Any signed-in user can see their own appointment history. */}
          <Link
            href="/my/appointments"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full border-b border-[color:var(--line)] px-4 py-2.5 text-left text-sm font-medium text-navy-900 transition-colors duration-150 hover:bg-cream focus:bg-cream focus:outline-none"
          >
            Мої записи
          </Link>
          {/* Purchase history — own orders only (owner-scoped server-side). */}
          <Link
            href="/my/orders"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full border-b border-[color:var(--line)] px-4 py-2.5 text-left text-sm font-medium text-navy-900 transition-colors duration-150 hover:bg-cream focus:bg-cream focus:outline-none"
          >
            Мої замовлення
          </Link>
          {isManager && (
            <Link
              href={adminHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block w-full border-b border-[color:var(--line)] px-4 py-2.5 text-left text-sm font-medium text-navy-900 transition-colors duration-150 hover:bg-cream focus:bg-cream focus:outline-none"
            >
              Адмін-панель
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-navy-900 transition-colors duration-150 hover:bg-cream focus:bg-cream focus:outline-none"
          >
            Вийти
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { open } = useLoginModal();
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const onBooking = pathname === "/booking";
  const onShop = pathname === "/shop";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Section nav. When NOT on home, let <Link href="/#id"> navigate home — the
  // HashScrollHandler scrolls after mount. When ALREADY on home, intercept and
  // smooth-scroll ourselves, then update the hash without a reload. (Doing this
  // manually avoids App Router appending a second hash like "#prices#services"
  // and guarantees a smooth, header-offset scroll.) Modifier/middle clicks are
  // left alone so Ctrl/⌘/middle-click still open a new tab.
  const handleSectionNav = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (
      pathname !== "/" ||
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    const id = href.split("#")[1];
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${id}`);
  };

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
            <Link
              key={link.href}
              href={link.href}
              onClick={(e) => handleSectionNav(e, link.href)}
              className="group relative py-1.5 transition-colors duration-200 hover:text-navy-900"
            >
              {link.label}
              <span className="absolute -bottom-0.5 left-0 right-0 h-px origin-left scale-x-0 bg-mint transition-transform duration-300 ease-smooth group-hover:scale-x-100" />
            </Link>
          ))}
          {/* Real route (not a section anchor) — active state via usePathname. */}
          <Link
            href="/shop"
            aria-current={onShop ? "page" : undefined}
            className={cn(
              "group relative py-1.5 transition-colors duration-200 hover:text-navy-900",
              onShop && "text-navy-900",
            )}
          >
            Магазин
            <span
              className={cn(
                "absolute -bottom-0.5 left-0 right-0 h-px origin-left bg-mint transition-transform duration-300 ease-smooth",
                onShop ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
              )}
            />
          </Link>
        </nav>

        <div className="flex items-center gap-2.5">
          {status === "loading" ? (
            // Skeleton: same dimensions as the avatar / login button so the
            // header doesn't reflow when the session resolves.
            <div
              aria-hidden="true"
              className="h-10 w-10 animate-pulse rounded-full bg-cream"
            />
          ) : status === "authenticated" && session?.user ? (
            <>
              <NotificationsBell />
              <AvatarMenu user={session.user} role={session.user.role} />
            </>
          ) : (
            <button
              type="button"
              onClick={open}
              className="rounded-full px-4 py-2.5 text-sm font-medium text-navy-900 transition-colors duration-200 hover:bg-cream"
            >
              Увійти
            </button>
          )}
          <Link
            href="/booking"
            aria-current={onBooking ? "page" : undefined}
            className={cn(
              btnBase,
              btnMint,
              "hidden sm:inline-flex",
              onBooking && "ring-2 ring-mint-600/50 ring-offset-2 ring-offset-white",
            )}
          >
            Записатися
            <IcoArrow size={16} />
          </Link>
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
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  setMenuOpen(false);
                  handleSectionNav(e, link.href);
                }}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-navy-700 hover:bg-cream"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/shop"
              aria-current={onShop ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "rounded-md px-2 py-2.5 text-sm font-medium hover:bg-cream",
                onShop ? "bg-cream text-navy-900" : "text-navy-700",
              )}
            >
              Магазин
            </Link>
            <Link
              href="/booking"
              aria-current={onBooking ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className={cn(
                btnBase,
                btnMint,
                "mt-2 justify-center sm:hidden",
                onBooking && "ring-2 ring-mint-600/50 ring-offset-2 ring-offset-white",
              )}
            >
              Записатися
              <IcoArrow size={16} />
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
