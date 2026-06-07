import type { Metadata } from "next";
import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ShopPage } from "@/components/shop/ShopPage";

export const metadata: Metadata = {
  title: "Магазин клініки — SmileClinic",
  description:
    "Засоби догляду за зубами від SmileClinic. Оплата при отриманні, самовивіз або Нова Пошта.",
};

export default function Page() {
  return (
    <LoginModalProvider>
      <Header />
      <main className="min-h-[60vh] bg-cream/20">
        <ShopPage />
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
