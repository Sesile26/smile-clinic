import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ProductDetail } from "@/components/shop/ProductDetail";

type Params = { params: Promise<{ id: string }> };

// SEO: real title/description per product (server-side, public fields only).
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await prisma.product.findUnique({
    where: { id },
    select: { name: true, description: true, isActive: true },
  });
  if (!p || !p.isActive) {
    return { title: "Товар не знайдено — Магазин · SmileClinic" };
  }
  return {
    title: `${p.name} — Магазин · SmileClinic`,
    description: p.description ?? "Товар магазину клініки SmileClinic.",
  };
}

// Storefront product page. Data comes from GET /api/products/[id] (role-gated
// stock); offline falls back to the Dexie catalog mirror. CartProvider is in
// the root layout, so the cart survives navigating here and back.
export default async function Page({ params }: Params) {
  const { id } = await params;
  return <ProductDetail id={id} />;
}
