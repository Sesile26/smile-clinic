import { LoginModalProvider } from "@/components/ui/LoginModalProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { MarqueeSection } from "@/components/home/MarqueeSection";
import { ServicesSection } from "@/components/home/ServicesSection";
import { StatsSection } from "@/components/home/StatsSection";
import { DoctorsSection } from "@/components/home/DoctorsSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { CtaBannerSection } from "@/components/home/CtaBannerSection";

export default function HomePage() {
  return (
    <LoginModalProvider>
      <Header />
      <main>
        <HeroSection />
        <MarqueeSection />
        <ServicesSection />
        <StatsSection />
        <DoctorsSection />
        <TestimonialsSection />
        <CtaBannerSection />
      </main>
      <Footer />
    </LoginModalProvider>
  );
}
