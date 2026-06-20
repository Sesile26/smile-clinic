"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/cn";
import { btnBase, btnMint } from "@/lib/buttons";
import { IcoChevron, IcoClose } from "@/components/icons";
import { useLoginModal } from "@/components/ui/LoginModalProvider";
import { createOrder, npCities, npWarehouses, ShopApiError } from "@/lib/shop-client";
import type { DeliveryMethod, NpOption } from "@/lib/shop-types";
import { useCart, type CartItem } from "./CartContext";
import { CLINIC_ADDRESS, formatUAH, isValidUaPhone } from "./data";
import { OfflineNotice } from "./StatePanels";

type Step = "cart" | "checkout" | "done";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Ordering is online-only; offline disables the submit. */
  online: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface PlacedOrder {
  items: CartItem[];
  total: number;
  deliveryLabel: string;
}

/**
 * Right-side cart drawer: cart → checkout → done. a11y mirrors LoginModal
 * (role=dialog, scroll lock, Escape, focus trap, focus restore). Cart state is
 * local (CartContext, no localStorage). Checkout calls POST /api/orders — the
 * SERVER computes the total from Product.price; we display the client subtotal
 * only as a preview. Nova Poshta city/warehouse come from the server proxy.
 */
export function CartDrawer({ open, onClose, online }: CartDrawerProps) {
  const {
    items,
    count,
    subtotal,
    inc,
    dec,
    remove,
    clear,
    hydrating,
    notice,
    dismissNotice,
  } = useCart();
  const { status } = useSession();
  const authed = status === "authenticated"; // ordering requires sign-in
  const loginModal = useLoginModal();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const [step, setStep] = useState<Step>("cart");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  // Render into document.body via a portal (SSR-safe: only after mount). The
  // header is a `backdrop-filter` ancestor, which makes it the containing block
  // for `position: fixed` descendants — so a drawer rendered *inside* the header
  // would size its `fixed inset-0` against the header box (~78px), not the
  // viewport. Portalling to <body> escapes both that containing block and the
  // header's stacking context, so `fixed`/`z-index` resolve against the window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Defer to a microtask so we never call setState synchronously in the
    // effect body (react-hooks/set-state-in-effect) — same convention as the
    // Nova Poshta picker below.
    queueMicrotask(() => setMounted(true));
  }, []);

  // Checkout form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+380");
  const [delivery, setDelivery] = useState<DeliveryMethod>("pickup");
  const [npCity, setNpCity] = useState<NpOption | null>(null);
  const [npWarehouse, setNpWarehouse] = useState<NpOption | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Scroll lock + autofocus + focus restore.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 80);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open, step]);

  // Reset transient state after the drawer closes.
  useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => {
        setStep("cart");
        setPlaced(null);
        setTouched(false);
        setSubmitError(null);
      }, 250);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const phoneValid = isValidUaPhone(phone);
  const nameValid = name.trim().length >= 2;
  const deliveryValid =
    delivery === "pickup" || (!!npCity && !!npWarehouse);
  const canSubmit =
    authed && online && !submitting && nameValid && phoneValid && deliveryValid;

  // Close the cart and open the auth modal; the cart (context) survives, so the
  // user returns to a populated cart after signing in.
  const promptLogin = () => {
    onClose();
    loginModal.open();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!authed) {
      promptLogin();
      return;
    }
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createOrder({
        items: items.map((i) => ({ productId: i.product.id, quantity: i.qty })),
        deliveryMethod: delivery,
        contactName: name.trim(),
        contactPhone: phone.trim(),
        npCity: delivery === "nova_poshta" ? npCity?.name : undefined,
        npWarehouse: delivery === "nova_poshta" ? npWarehouse?.name : undefined,
      });
      const deliveryLabel =
        delivery === "pickup"
          ? `Самовивіз — ${CLINIC_ADDRESS}`
          : `Нова Пошта — ${npCity?.name}, ${npWarehouse?.name}`;
      // Use the SERVER total (authoritative), not the client subtotal.
      setPlaced({ items, total: order.total, deliveryLabel });
      clear();
      setStep("done");
    } catch (err) {
      if (err instanceof ShopApiError && err.code === "out_of_stock") {
        setSubmitError("Товару недостатньо в наявності. Оновіть кошик.");
      } else if (err instanceof ShopApiError && err.code === "unauthorized") {
        setSubmitError("Сесія завершилася. Увійдіть, щоб оформити замовлення.");
      } else if (err instanceof ShopApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Не вдалося оформити замовлення. Спробуйте ще раз.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const headerTitle =
    step === "cart"
      ? `Кошик${count ? ` · ${count}` : ""}`
      : step === "checkout"
        ? "Оформлення"
        : "Готово";

  if (!mounted) return null;

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        // Full-viewport overlay (backdrop): fixed inset-0 covers the whole
        // window; z above the sticky header (z-50).
        "fixed inset-0 z-[100] flex justify-end backdrop-blur-[6px] transition-[opacity,visibility] duration-300 ease-smooth",
        "bg-[rgba(10,22,40,0.5)]",
        open ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          // Full height = the overlay's height (fixed inset-0 → the ACTUAL
          // visible viewport, so the mobile address bar never crops it; safer
          // than 100dvh, which is the *largest* viewport and overshoots when the
          // address bar is shown). The body below is overflow-y-auto, so long
          // carts scroll inside.
          "flex h-full w-full max-w-[440px] flex-col bg-cream shadow-s3 transition-transform duration-[350ms] ease-smooth",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            {step === "checkout" && (
              <button
                type="button"
                onClick={() => setStep("cart")}
                aria-label="Назад до кошика"
                className="grid h-8 w-8 place-items-center rounded-full text-navy-700 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
              >
                <IcoChevron size={18} className="rotate-90" />
              </button>
            )}
            <h2
              id={titleId}
              className="font-serif text-[22px] leading-none tracking-[-0.01em] text-navy-900"
            >
              {headerTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити кошик"
            className="grid h-9 w-9 place-items-center rounded-full text-navy-400 transition-colors hover:bg-cream hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <IcoClose size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!online && step !== "done" && <OfflineNotice className="mb-4" />}

          {step === "cart" && notice && (
            <div
              role="status"
              className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
            >
              <span>{notice}</span>
              <button
                type="button"
                onClick={dismissNotice}
                aria-label="Сховати повідомлення"
                className="shrink-0 rounded p-0.5 text-amber-600 transition-colors hover:text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <IcoClose size={16} />
              </button>
            </div>
          )}

          {step === "cart" &&
            (hydrating ? (
              <CartSkeleton />
            ) : (
              <CartStep items={items} onInc={inc} onDec={dec} onRemove={remove} />
            ))}

          {step === "checkout" && (
            <form id="checkout-form" onSubmit={handleSubmit} noValidate>
              <CheckoutFields
                name={name}
                onName={setName}
                phone={phone}
                onPhone={setPhone}
                delivery={delivery}
                onDelivery={setDelivery}
                npCity={npCity}
                npWarehouse={npWarehouse}
                onCity={(c) => {
                  setNpCity(c);
                  setNpWarehouse(null); // warehouse depends on city
                }}
                onWarehouse={setNpWarehouse}
                touched={touched}
                nameValid={nameValid}
                phoneValid={phoneValid}
                deliveryValid={deliveryValid}
              />

              <OrderSummary
                items={items}
                subtotal={subtotal}
                deliveryLabel={
                  delivery === "pickup" ? "Самовивіз із клініки" : "Нова Пошта"
                }
              />

              {submitError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  {submitError}
                </div>
              )}
            </form>
          )}

          {step === "done" && placed && <DoneStep order={placed} />}
        </div>

        {/* Footer (sticky actions) */}
        {step === "done" ? (
          <div className="border-t border-[color:var(--line)] bg-white px-5 py-4">
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className={cn(btnBase, btnMint, "w-full justify-center")}
            >
              Продовжити покупки
            </button>
          </div>
        ) : (
          <div className="border-t border-[color:var(--line)] bg-white px-5 py-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-navy-400">Проміжна сума</span>
              <span className="text-lg font-medium tabular-nums text-navy-900">
                {formatUAH(subtotal)}
              </span>
            </div>

            {step === "cart" ? (
              authed ? (
                <button
                  type="button"
                  data-autofocus
                  onClick={() => setStep("checkout")}
                  disabled={count === 0}
                  className={cn(
                    btnBase,
                    btnMint,
                    "w-full justify-center",
                    count === 0 && "cursor-not-allowed opacity-50",
                  )}
                >
                  Оформити замовлення
                </button>
              ) : (
                // Guest: checkout disabled; ordering needs an account.
                <>
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className={cn(
                      btnBase,
                      btnMint,
                      "w-full cursor-not-allowed justify-center opacity-50",
                    )}
                  >
                    Оформити замовлення
                  </button>
                  <button
                    type="button"
                    data-autofocus
                    onClick={promptLogin}
                    disabled={count === 0}
                    className={cn(
                      "mt-2 inline-flex w-full items-center justify-center rounded-full bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
                      count === 0 && "cursor-not-allowed opacity-50",
                    )}
                  >
                    Увійти / Зареєструватися
                  </button>
                  <p className="mt-2 text-center text-xs text-navy-400">
                    Увійдіть, щоб оформити замовлення
                  </p>
                </>
              )
            ) : (
              <>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={!online || submitting}
                  className={cn(
                    btnBase,
                    btnMint,
                    "w-full justify-center",
                    (!online || submitting) && "cursor-not-allowed opacity-50",
                  )}
                >
                  {submitting ? "Оформлення…" : "Оформити замовлення"}
                </button>
                <p className="mt-2 text-center text-xs text-navy-400">
                  {online
                    ? "Оплата при отриманні"
                    : "Оформлення доступне лише онлайн"}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Cart step ───────────────────────────────────────────────────────────────

/** Shown while the cart hydrates from Dexie — prevents an empty→full flash. */
function CartSkeleton() {
  return (
    <ul
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-3"
    >
      <span className="sr-only">Завантаження кошика…</span>
      {Array.from({ length: 2 }).map((_, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-xl border border-[color:var(--line)] bg-white p-3"
        >
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-bone/60" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-bone/60" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-bone/40" />
            <div className="h-7 w-24 animate-pulse rounded-full bg-bone/50" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CartStep({
  items,
  onInc,
  onDec,
  onRemove,
}: {
  items: CartItem[];
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span
          aria-hidden="true"
          className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-white text-navy-400"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
          </svg>
        </span>
        <p className="text-base font-medium text-navy-900">Кошик порожній</p>
        <p className="mt-1 max-w-[32ch] text-sm text-navy-400">
          Додайте товари з каталогу, щоб оформити замовлення.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ product, qty }) => (
        <li
          key={product.id}
          className="flex gap-3 rounded-xl border border-[color:var(--line)] bg-white p-3"
        >
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[linear-gradient(150deg,#0F1E36,#0A1628)] text-mint">
            <span className="font-serif text-lg">{product.name.charAt(0)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium text-navy-900">
                {product.name}
              </p>
              <button
                type="button"
                onClick={() => onRemove(product.id)}
                aria-label={`Видалити «${product.name}» з кошика`}
                className="shrink-0 rounded p-1 text-navy-400 transition-colors hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </div>
            <p className="mt-0.5 text-xs text-navy-400">{formatUAH(product.price)}</p>
            <div className="mt-2 flex items-center justify-between">
              <QtyStepper
                qty={qty}
                label={product.name}
                onInc={() => onInc(product.id)}
                onDec={() => onDec(product.id)}
              />
              <span className="text-sm font-medium tabular-nums text-navy-900">
                {formatUAH(product.price * qty)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function QtyStepper({
  qty,
  label,
  onInc,
  onDec,
}: {
  qty: number;
  label: string;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-[color:var(--line-2)] bg-white">
      <button
        type="button"
        onClick={onDec}
        aria-label={`Зменшити кількість «${label}»`}
        className="grid h-8 w-8 place-items-center rounded-full text-navy-700 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <span
        className="min-w-7 text-center text-sm font-medium tabular-nums text-navy-900"
        aria-live="polite"
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={onInc}
        aria-label={`Збільшити кількість «${label}»`}
        className="grid h-8 w-8 place-items-center rounded-full text-navy-700 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}

// ─── Checkout fields ─────────────────────────────────────────────────────────

const fieldLabel = "text-xs font-medium tracking-[0.04em] text-navy-700";
const fieldInput =
  "w-full rounded-lg border border-[color:var(--line-2)] bg-white py-2.5 px-3.5 text-sm text-navy-900 outline-none transition-[border,box-shadow] duration-200 placeholder:text-navy-400/60 focus:border-navy-900 focus:shadow-[0_0_0_3px_rgba(0,201,167,0.18)]";
const fieldError = "text-xs text-red-500";

function CheckoutFields({
  name,
  onName,
  phone,
  onPhone,
  delivery,
  onDelivery,
  npCity,
  npWarehouse,
  onCity,
  onWarehouse,
  touched,
  nameValid,
  phoneValid,
  deliveryValid,
}: {
  name: string;
  onName: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  delivery: DeliveryMethod;
  onDelivery: (v: DeliveryMethod) => void;
  npCity: NpOption | null;
  npWarehouse: NpOption | null;
  onCity: (c: NpOption | null) => void;
  onWarehouse: (w: NpOption | null) => void;
  touched: boolean;
  nameValid: boolean;
  phoneValid: boolean;
  deliveryValid: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-navy-900">
          Контактні дані
        </legend>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ck-name" className={fieldLabel}>
            Імʼя та прізвище
          </label>
          <input
            id="ck-name"
            data-autofocus
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Іван Петренко"
            autoComplete="name"
            className={fieldInput}
            aria-invalid={touched && !nameValid}
          />
          {touched && !nameValid && (
            <span className={fieldError}>Вкажіть імʼя (мін. 2 символи)</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ck-phone" className={fieldLabel}>
            Телефон
          </label>
          <input
            id="ck-phone"
            type="tel"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="+380XXXXXXXXX"
            autoComplete="tel"
            inputMode="tel"
            className={fieldInput}
            aria-invalid={touched && !phoneValid}
          />
          {touched && !phoneValid && (
            <span className={fieldError}>Формат: +380XXXXXXXXX</span>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-navy-900">
          Спосіб доставки
        </legend>
        <div role="group" aria-label="Спосіб доставки" className="grid grid-cols-2 gap-2">
          <DeliveryToggle
            active={delivery === "pickup"}
            onClick={() => onDelivery("pickup")}
            title="Самовивіз"
            subtitle="з клініки"
          />
          <DeliveryToggle
            active={delivery === "nova_poshta"}
            onClick={() => onDelivery("nova_poshta")}
            title="Нова Пошта"
            subtitle="у відділення"
          />
        </div>

        {delivery === "pickup" ? (
          <div className="mt-3 rounded-lg border border-[color:var(--line)] bg-white px-3.5 py-3 text-sm text-navy-700">
            <span className="font-medium text-navy-900">Адреса клініки:</span>
            <br />
            {CLINIC_ADDRESS}
          </div>
        ) : (
          <NovaPoshtaPicker
            city={npCity}
            warehouse={npWarehouse}
            onCity={onCity}
            onWarehouse={onWarehouse}
            invalid={touched && !deliveryValid}
          />
        )}
      </fieldset>
    </div>
  );
}

function DeliveryToggle({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1",
        active
          ? "border-navy-900 bg-navy-900 text-white"
          : "border-[color:var(--line-2)] bg-white text-navy-900 hover:border-navy-900",
      )}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className={cn("text-xs", active ? "text-white/60" : "text-navy-400")}>
        {subtitle}
      </span>
    </button>
  );
}

// ─── Nova Poshta city/warehouse autocomplete (server proxy) ──────────────────

function NovaPoshtaPicker({
  city,
  warehouse,
  onCity,
  onWarehouse,
  invalid,
}: {
  city: NpOption | null;
  warehouse: NpOption | null;
  onCity: (c: NpOption | null) => void;
  onWarehouse: (w: NpOption | null) => void;
  invalid: boolean;
}) {
  const [cityQuery, setCityQuery] = useState(city?.name ?? "");
  const [cityOptions, setCityOptions] = useState<NpOption[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<NpOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [npError, setNpError] = useState<string | null>(null);

  // Debounced city search (only while no city is committed yet). All setState
  // happens inside the timer/promise callbacks — never synchronously in the
  // effect body (avoids the set-state-in-effect cascade).
  useEffect(() => {
    const q = cityQuery.trim();
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      if (city || q.length < 2) {
        setCityOptions([]);
        return;
      }
      setLoading(true);
      setNpError(null);
      npCities(q, ac.signal)
        .then((opts) => {
          setCityOptions(opts);
          setCityOpen(true);
        })
        .catch((err) => {
          if (ac.signal.aborted) return;
          setCityOptions([]);
          setNpError(
            err instanceof ShopApiError
              ? err.message
              : "Не вдалося завантажити міста",
          );
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [cityQuery, city]);

  // Load warehouses when a city is committed. No synchronous setState in the
  // effect body — loading flips in a microtask, results land in the promise.
  // When there's no city we render [] (derived) without clearing state here.
  useEffect(() => {
    if (!city) return;
    const ac = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setNpError(null);
      }
    });
    npWarehouses(city.ref, "", ac.signal)
      .then((opts) => {
        if (active) setWarehouses(opts);
      })
      .catch((err) => {
        if (!active || ac.signal.aborted) return;
        setWarehouses([]);
        setNpError(
          err instanceof ShopApiError
            ? err.message
            : "Не вдалося завантажити відділення",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      ac.abort();
    };
  }, [city]);

  // Derived: warehouses only belong to a committed city.
  const warehouseOptions = city ? warehouses : [];

  const pickCity = (c: NpOption) => {
    onCity(c);
    setCityQuery(c.name);
    setCityOpen(false);
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* City autocomplete */}
      <div className="relative flex flex-col gap-1.5">
        <label htmlFor="np-city" className={fieldLabel}>
          Місто
        </label>
        <input
          id="np-city"
          type="text"
          value={cityQuery}
          autoComplete="off"
          onChange={(e) => {
            setCityQuery(e.target.value);
            if (city) {
              onCity(null); // editing the city resets the committed selection
              onWarehouse(null);
            }
          }}
          onFocus={() => cityOptions.length > 0 && setCityOpen(true)}
          placeholder="Почніть вводити місто…"
          className={fieldInput}
          aria-invalid={invalid && !city}
          aria-expanded={cityOpen}
          role="combobox"
          aria-controls="np-city-list"
        />
        {cityOpen && cityOptions.length > 0 && (
          <ul
            id="np-city-list"
            role="listbox"
            className="absolute top-full z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[color:var(--line-2)] bg-white shadow-s2"
          >
            {cityOptions.map((c) => (
              <li key={c.ref} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => pickCity(c)}
                  className="block w-full px-3.5 py-2 text-left text-sm text-navy-900 hover:bg-cream focus:bg-cream focus:outline-none"
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Warehouse select (depends on the chosen city) */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="np-warehouse" className={fieldLabel}>
          Відділення
        </label>
        <select
          id="np-warehouse"
          value={warehouse?.ref ?? ""}
          disabled={!city || warehouseOptions.length === 0}
          onChange={(e) => {
            const w =
              warehouseOptions.find((x) => x.ref === e.target.value) ?? null;
            onWarehouse(w);
          }}
          className={cn(fieldInput, "disabled:opacity-60")}
          aria-invalid={invalid && !warehouse}
        >
          <option value="">
            {!city
              ? "Спершу оберіть місто"
              : warehouseOptions.length === 0
                ? "Немає відділень"
                : "Оберіть відділення…"}
          </option>
          {warehouseOptions.map((w) => (
            <option key={w.ref} value={w.ref}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-xs text-navy-400">Завантаження…</p>}
      {npError && (
        <p className="text-xs text-red-500">
          {npError}. Нова Пошта тимчасово недоступна — оберіть самовивіз.
        </p>
      )}
      {invalid && !npError && (
        <p className={fieldError}>Оберіть місто та відділення</p>
      )}
    </div>
  );
}

// ─── Order summary ───────────────────────────────────────────────────────────

function OrderSummary({
  items,
  subtotal,
  deliveryLabel,
}: {
  items: CartItem[];
  subtotal: number;
  deliveryLabel: string;
}) {
  return (
    <div className="mt-5 rounded-xl border border-[color:var(--line)] bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-navy-900">
        Підсумок замовлення
      </h3>
      <ul className="flex flex-col gap-2 border-b border-[color:var(--line)] pb-3">
        {items.map(({ product, qty }) => (
          <li
            key={product.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="min-w-0 truncate text-navy-700">
              {product.name} <span className="text-navy-400">× {qty}</span>
            </span>
            <span className="shrink-0 tabular-nums text-navy-900">
              {formatUAH(product.price * qty)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-navy-400">Сума</dt>
          <dd className="font-medium tabular-nums text-navy-900">
            {formatUAH(subtotal)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-navy-400">Доставка</dt>
          <dd className="text-right text-navy-700">{deliveryLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-navy-400">Оплата</dt>
          <dd className="text-navy-700">При отриманні</dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Done step ───────────────────────────────────────────────────────────────

function DoneStep({ order }: { order: PlacedOrder }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span
        aria-hidden="true"
        className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-mint-100 text-mint-600"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <h3 className="font-serif text-[26px] leading-tight tracking-[-0.015em] text-navy-900">
        Замовлення <em className="italic text-mint-600">прийнято</em>!
      </h3>
      <p className="mt-2 max-w-[34ch] text-sm text-navy-400">
        Ми зв’яжемося з вами для підтвердження.
      </p>

      <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-xs font-medium text-navy-900">
        💵 Оплата при отриманні
      </span>

      <div className="mt-6 w-full rounded-xl border border-[color:var(--line)] bg-white p-4 text-left">
        <ul className="flex flex-col gap-2 border-b border-[color:var(--line)] pb-3">
          {order.items.map(({ product, qty }) => (
            <li
              key={product.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate text-navy-700">
                {product.name} <span className="text-navy-400">× {qty}</span>
              </span>
              <span className="shrink-0 tabular-nums text-navy-900">
                {formatUAH(product.price * qty)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-navy-400">Разом</span>
          <span className="text-lg font-medium tabular-nums text-navy-900">
            {formatUAH(order.total)}
          </span>
        </div>
        <p className="mt-2 text-xs text-navy-400">{order.deliveryLabel}</p>
      </div>
    </div>
  );
}
