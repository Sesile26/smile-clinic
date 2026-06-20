import type { Metadata } from "next";
import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MyOrdersPage } from "@/components/my/orders/MyOrdersPage";

export const metadata: Metadata = {
  title: "Історія покупок — SmileClinic",
  description: "Ваші замовлення в магазині клініки та повторне замовлення товарів.",
};

// Access is gated to authenticated users in proxy.ts (/my/*). Data comes from
// GET /api/my/orders (owner-scoped); CartProvider comes from the root layout,
// so reorder adds persist in the cart.
export default function Page() {
  return (
    <LoginModalProvider>
      <Header />
      <main className="min-h-[60vh] bg-cream/20">
        <MyOrdersPage />
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
