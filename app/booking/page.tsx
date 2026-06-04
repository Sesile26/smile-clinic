import type { Metadata } from "next";
import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BookingPage } from "@/components/booking/BookingPage";

export const metadata: Metadata = {
  title: "Бронювання візиту — SmileClinic",
  description:
    "Оберіть лікаря та зручний час візиту. Керування слотами для лікарів і онлайн-бронювання для пацієнтів.",
};

export default function Page() {
  return (
    <LoginModalProvider>
      <Header />
      <main className="min-h-[60vh] bg-cream/20">
        <BookingPage />
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
