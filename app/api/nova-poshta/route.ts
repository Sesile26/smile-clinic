import { NextResponse } from "next/server";
import { shopError } from "@/lib/shop-server";
import type { NpOption } from "@/lib/shop-types";

/**
 * Nova Poshta proxy. Calls are made SERVER-SIDE so the API key never reaches
 * the browser (NOVA_POSHTA_API_KEY in .env). The client sends a small action
 * payload; we normalise NP's verbose response to { ref, name }.
 *
 * Endpoints (verified against NP API v2.0):
 *   POST https://api.novaposhta.ua/v2.0/json/
 *   - cities:     modelName "Address", calledMethod "getCities"
 *                 methodProperties { FindByString, Limit }
 *   - warehouses: modelName "Address", calledMethod "getWarehouses"
 *                 methodProperties { CityRef, FindByString, Limit }
 *
 * NOTE: without a valid NOVA_POSHTA_API_KEY this returns 503 (np_unavailable);
 * the checkout UI then shows an error and Nova Poshta delivery can't be picked
 * (pickup still works). Set the key to enable live city/warehouse lookups.
 */

const NP_URL = "https://api.novaposhta.ua/v2.0/json/";

interface NpRow {
  Ref?: string;
  Description?: string;
}
interface NpResponse {
  success?: boolean;
  data?: NpRow[];
  errors?: string[];
}

export async function POST(request: Request) {
  const apiKey = process.env.NOVA_POSHTA_API_KEY;
  if (!apiKey) {
    return shopError(
      503,
      "np_unavailable",
      "Сервіс Нової Пошти не налаштовано (немає API-ключа)",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }
  const { action, query, cityRef } = (body ?? {}) as {
    action?: string;
    query?: string;
    cityRef?: string;
  };

  let payload: Record<string, unknown> | null = null;
  if (action === "cities") {
    payload = {
      apiKey,
      modelName: "Address",
      calledMethod: "getCities",
      methodProperties: { FindByString: query ?? "", Limit: "20" },
    };
  } else if (action === "warehouses") {
    if (!cityRef) {
      return shopError(400, "validation", "Потрібен cityRef");
    }
    payload = {
      apiKey,
      modelName: "Address",
      calledMethod: "getWarehouses",
      methodProperties: {
        CityRef: cityRef,
        FindByString: query ?? "",
        Limit: "50",
      },
    };
  } else {
    return shopError(400, "validation", "Невідома дія");
  }

  try {
    const res = await fetch(NP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      return shopError(502, "np_unavailable", "Нова Пошта недоступна");
    }
    const data = (await res.json()) as NpResponse;
    if (!data.success) {
      return shopError(
        502,
        "np_unavailable",
        data.errors?.[0] ?? "Помилка Нової Пошти",
      );
    }
    const options: NpOption[] = (data.data ?? [])
      .filter((r): r is Required<Pick<NpRow, "Ref" | "Description">> =>
        Boolean(r.Ref && r.Description),
      )
      .map((r) => ({ ref: r.Ref, name: r.Description }));
    return NextResponse.json<NpOption[]>(options);
  } catch (err) {
    console.error("POST /api/nova-poshta failed", err);
    return shopError(502, "np_unavailable", "Нова Пошта недоступна");
  }
}
