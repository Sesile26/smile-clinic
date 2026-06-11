"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { db, type LocalProduct } from "@/lib/db";
import { getProducts } from "@/lib/shop-client";
import type { ApiProduct } from "@/lib/shop-types";

export interface CartItem {
  product: ApiProduct;
  qty: number;
  /** Epoch ms first added — keeps a stable order across reloads. */
  addedAt: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number; // total units
  subtotal: number; // UAH
  /** True until the cart has been hydrated from Dexie (avoids empty flash). */
  hydrating: boolean;
  /** Set when hydration dropped now-unavailable items; null otherwise. */
  notice: string | null;
  dismissNotice: () => void;
  add: (product: ApiProduct) => void;
  setQty: (id: string, qty: number) => void;
  inc: (id: string) => void;
  dec: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}

const MAX_QTY = 99;

/** Upper bound for a line. Patients no longer receive the exact stock (it's
 *  staff-only), so the client caps at MAX_QTY and the SERVER is the authority —
 *  it re-validates stock on order and returns out_of_stock if exceeded. When a
 *  stock number is present (shouldn't happen in the buyer cart) we still honour
 *  it as an extra silent ceiling. */
function capQty(item: CartItem, desired: number): number {
  return Math.min(desired, item.product.stock ?? MAX_QTY, MAX_QTY);
}

/** Offline fallback: map a mirrored product to the wire shape (no exact stock —
 *  it isn't mirrored; availability comes from inStock). */
function localToApi(p: LocalProduct): ApiProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    inStock: p.inStock,
    isActive: p.isActive,
  };
}

/** A product is orderable if it still exists, is active, and is in stock. */
function isAvailable(p: ApiProduct | undefined): p is ApiProduct {
  return !!p && p.isActive && p.inStock;
}

/** Write the current cart to Dexie (full replace — cheap, the cart is tiny). */
async function persist(items: CartItem[]): Promise<void> {
  try {
    await db.transaction("rw", db.cartItems, async () => {
      await db.cartItems.clear();
      if (items.length > 0) {
        await db.cartItems.bulkPut(
          items.map((i) => ({
            productId: i.product.id,
            quantity: i.qty,
            addedAt: i.addedAt,
          })),
        );
      }
    });
  } catch (err) {
    console.warn("[cart] persist failed", err);
  }
}

/**
 * Cart state, persisted to Dexie (IndexedDB) — NOT localStorage. Mounted at the
 * ROOT layout, so client-side navigation (shop → page → back) never unmounts
 * it, and a reload / direct entry rehydrates from Dexie. On hydration each line
 * is re-validated against the live catalog: missing / inactive / out-of-stock
 * items are dropped (with a soft notice) so nothing unorderable survives.
 *
 * Prices here are display-only — POST /api/orders re-prices from the DB.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrating, setHydrating] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Hydrate once from Dexie, validating against the current catalog ────────
  useEffect(() => {
    let active = true;
    (async () => {
      let stored: { productId: string; quantity: number; addedAt: number }[] =
        [];
      try {
        stored = await db.cartItems.orderBy("addedAt").toArray();
      } catch {
        /* DB unavailable — start empty */
      }
      if (stored.length === 0) {
        if (active) setHydrating(false);
        return;
      }

      // Resolve product details: live catalog online, Dexie mirror offline.
      let catalog: ApiProduct[] = [];
      try {
        catalog = await getProducts();
      } catch {
        try {
          catalog = (await db.products.toArray()).map(localToApi);
        } catch {
          /* leave empty → everything treated as unavailable */
        }
      }
      const byId = new Map(catalog.map((p) => [p.id, p]));

      const resolved: CartItem[] = [];
      let dropped = 0;
      for (const row of stored) {
        const product = byId.get(row.productId);
        if (!isAvailable(product)) {
          dropped += 1;
          continue;
        }
        const qty = Math.min(
          row.quantity,
          product.stock ?? MAX_QTY,
          MAX_QTY,
        );
        resolved.push({ product, qty, addedAt: row.addedAt });
      }

      if (!active) return;
      setItems(resolved);
      if (dropped > 0) {
        setNotice(
          dropped === 1
            ? "Один товар став недоступним і його прибрано з кошика."
            : `${dropped} товари(ів) стали недоступними і їх прибрано з кошика.`,
        );
      }
      setHydrating(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // ── Persist on every change (after hydration) ─────────────────────────────
  useEffect(() => {
    if (hydrating) return; // don't clobber stored data before it's loaded
    void persist(items);
  }, [items, hydrating]);

  const add = useCallback((product: ApiProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, qty: capQty(i, i.qty + 1) }
            : i,
        );
      }
      // Refresh the stored product snapshot to the latest passed-in data.
      return [...prev, { product, qty: 1, addedAt: Date.now() }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product.id === id
            ? { ...i, qty: Math.max(0, capQty(i, qty)) }
            : i,
        )
        // qty 0 removes the line
        .filter((i) => i.qty > 0),
    );
  }, []);

  const inc = useCallback(
    (id: string) =>
      setItems((prev) =>
        prev.map((i) =>
          i.product.id === id ? { ...i, qty: capQty(i, i.qty + 1) } : i,
        ),
      ),
    [],
  );

  const dec = useCallback(
    (id: string) =>
      setItems((prev) =>
        prev
          .map((i) =>
            i.product.id === id ? { ...i, qty: i.qty - 1 } : i,
          )
          .filter((i) => i.qty > 0),
      ),
    [],
  );

  const remove = useCallback(
    (id: string) =>
      setItems((prev) => prev.filter((i) => i.product.id !== id)),
    [],
  );

  const clear = useCallback(() => setItems([]), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((n, i) => n + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    return {
      items,
      count,
      subtotal,
      hydrating,
      notice,
      dismissNotice,
      add,
      setQty,
      inc,
      dec,
      remove,
      clear,
    };
  }, [items, hydrating, notice, dismissNotice, add, setQty, inc, dec, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
