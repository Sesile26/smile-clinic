"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useShopRole, isShopManager } from "@/hooks/useShop";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";

/**
 * Global cart entry point in the site header. Opens the SAME drawer used on
 * /shop, backed by the SAME CartContext (mounted in the root layout) — so the
 * counter and contents are identical on every page (/shop, /shop/[id],
 * /my/orders, профіль, home …). There is exactly ONE cart; this only surfaces
 * access to it in a new place.
 *
 * Visibility is gated to buyers (guest / PATIENT / DOCTOR) and hidden for
 * catalog managers (STAFF/ADMIN) — the same `isShopManager` gate as on /shop,
 * so the two stay consistent. We wait for the session to resolve (`ready`)
 * before rendering to avoid briefly flashing the cart for a manager.
 */
export function HeaderCart() {
  const { ready, role } = useShopRole();
  const { isOnline: online } = useOnlineStatus();
  // The drawer open state lives in CartContext (the one global cart), so other
  // pages (e.g. the product CTA) can open it without a URL param.
  const { count, isOpen, openCart, closeCart } = useCart();

  if (!ready || isShopManager(role)) return null;

  return (
    <>
      <button
        type="button"
        onClick={openCart}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Відкрити кошик, товарів: ${count}`}
        className="relative grid h-10 w-10 place-items-center rounded-full text-navy-900 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
        </svg>
        {count > 0 && (
          // aria-hidden: the count is already in the button's aria-label, so the
          // badge isn't announced twice.
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-mint px-1 text-[11px] font-semibold tabular-nums text-navy-900 ring-2 ring-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <CartDrawer open={isOpen} onClose={closeCart} online={online} />
    </>
  );
}
