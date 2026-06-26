import type { Metadata, Viewport } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { ServiceWorkerCleanup } from "@/components/pwa/ServiceWorkerCleanup";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { CartProvider } from "@/components/shop/CartContext";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SmileClinic — Преміальна стоматологія",
  description:
    "Бутік-мережа стоматологічних клінік у Києві. Швейцарські протоколи лікування з українською гостинністю.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0A1628",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${dmSans.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans text-navy-900">
        <ServiceWorkerCleanup />
        <InstallPrompt />
        {/* Cart lives at the root so it survives client-side navigation; it
            persists to / hydrates from Dexie for reloads and direct entry. */}
        <SessionProvider>
          <CartProvider>{children}</CartProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
