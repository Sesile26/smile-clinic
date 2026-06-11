"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createCategory,
  deleteCategory,
  getCategories,
  renameCategory,
  ShopApiError,
} from "@/lib/shop-client";

export interface ShopCategory {
  id: string;
  name: string;
  /** Products referencing this category (from the server _count). */
  count: number;
}
export type CatLoadState = "loading" | "ready" | "error";

export interface MutationResult {
  ok: boolean;
  error?: string;
}

/** Sentinel filter value + label for products without a category. */
export const UNCATEGORIZED = "__uncategorized__";
export const UNCATEGORIZED_LABEL = "Без категорії";

export interface UseShopCategories {
  categories: ShopCategory[];
  state: CatLoadState;
  reload: () => void;
  add: (name: string) => Promise<MutationResult>;
  rename: (id: string, name: string) => Promise<MutationResult>;
  /** Delete; reassigns products to "Без категорії" first when the category is
   *  non-empty (the count is known from the loaded list). */
  remove: (id: string) => Promise<MutationResult>;
}

const toMsg = (err: unknown, fallback: string) =>
  err instanceof ShopApiError ? err.message : fallback;

/**
 * Category store backed by /api/categories. Reads are public; mutations are
 * STAFF/ADMIN (re-checked server-side). After any successful mutation it
 * refetches its own list AND calls `onMutated` so the parent can refresh the
 * catalog (a rename/delete changes products' category name / categoryId).
 */
export function useShopCategories(onMutated?: () => void): UseShopCategories {
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [state, setState] = useState<CatLoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch the list. No synchronous setState in the effect body — updates land
  // in the async callbacks.
  useEffect(() => {
    const ac = new AbortController();
    getCategories(ac.signal)
      .then((rows) => {
        setCategories(
          rows.map((c) => ({ id: c.id, name: c.name, count: c.productCount })),
        );
        setState("ready");
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setState("error");
      });
    return () => ac.abort();
  }, [reloadKey]);

  const reload = useCallback(() => {
    setState("loading");
    setReloadKey((k) => k + 1);
  }, []);

  // Silent refetch after a mutation (no skeleton flash) + notify the parent.
  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1);
    onMutated?.();
  }, [onMutated]);

  const add = useCallback(
    async (name: string): Promise<MutationResult> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: "Вкажіть назву категорії" };
      try {
        await createCategory(trimmed);
        refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toMsg(err, "Не вдалося додати категорію") };
      }
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<MutationResult> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: "Назва не може бути порожньою" };
      try {
        await renameCategory(id, trimmed);
        refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toMsg(err, "Не вдалося перейменувати") };
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<MutationResult> => {
      // Non-empty categories need the explicit reassign-to-null opt-in.
      const target = categories.find((c) => c.id === id);
      const reassign = (target?.count ?? 0) > 0;
      try {
        await deleteCategory(id, reassign);
        refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: toMsg(err, "Не вдалося видалити категорію") };
      }
    },
    [categories, refresh],
  );

  return { categories, state, reload, add, rename, remove };
}
