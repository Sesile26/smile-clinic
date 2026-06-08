"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ApiProduct } from "@/lib/shop-types";

export interface CartItem {
  product: ApiProduct;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number; // total units
  subtotal: number; // UAH
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

/**
 * Cart lives entirely in React state — NO localStorage (per spec). It resets on
 * reload, which is fine for a demo storefront.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const add = useCallback((product: ApiProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, qty: Math.min(MAX_QTY, i.qty + 1) }
            : i,
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product.id === id
            ? { ...i, qty: Math.max(0, Math.min(MAX_QTY, qty)) }
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
          i.product.id === id
            ? { ...i, qty: Math.min(MAX_QTY, i.qty + 1) }
            : i,
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

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((n, i) => n + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    return { items, count, subtotal, add, setQty, inc, dec, remove, clear };
  }, [items, add, setQty, inc, dec, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
