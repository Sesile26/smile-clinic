import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getActor, isStaff, shopError } from "@/lib/shop-server";

/**
 * POST /api/admin/products/upload — server upload of a product image to Vercel
 * Blob (public store). STAFF/ADMIN only (re-checked here, never trust the UI).
 *
 * Flow: multipart form with a `file` field → validate type/size → put() →
 * return { url }. The caller then writes that URL into Product.imageUrl via the
 * normal product POST/PATCH. We do NOT touch the product row here — upload and
 * persistence are deliberately separate so a half-finished form can't orphan a
 * blob into the DB (and an external placehold.co URL still works as before).
 *
 * `put()` reads BLOB_READ_WRITE_TOKEN from process.env itself — never hardcode
 * or log it. On Vercel it's injected by the Blob integration.
 *
 * Server upload (file streamed THROUGH this function) is capped by Vercel's
 * request body limit (~4.5 MB). Larger files need client upload + token
 * handshake — out of scope here.
 */

export const runtime = "nodejs";

const MAX_BYTES = Math.floor(4.5 * 1024 * 1024); // ~4.5 MB server-upload limit
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

  // Fail clearly if the store isn't wired (locally: .env.local; prod: Vercel
  // integration) instead of letting put() throw an opaque error.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set");
    return shopError(500, "server", "Сховище зображень не налаштоване");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return shopError(400, "validation", "Очікується multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return shopError(400, "validation", "Файл не надіслано");
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return shopError(400, "validation", "Лише зображення JPEG, PNG або WebP");
  }
  if (file.size > MAX_BYTES) {
    return shopError(400, "validation", "Зображення завелике (макс. 4.5 МБ)");
  }

  // Readable base name + folder; addRandomSuffix guarantees no collisions.
  const base =
    (file.name || `image.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) ||
    `image.${ext}`;

  try {
    const blob = await put(`products/${base}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/products/upload failed", err);
    return shopError(500, "server", "Не вдалося завантажити зображення");
  }
}
