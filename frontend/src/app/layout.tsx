import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://silkroutelogistics.ai"),
  title: {
    default: "Silk Route Logistics",
    template: "%s | Silk Route Logistics",
  },
  description: "Silk Route Logistics Inc. is a Michigan property broker (USDOT 4526880, Broker MC 1794414) moving freight across North America. Where Trust Travels.",
  applicationName: "Silk Route Logistics",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Silk Route Logistics",
    url: "https://silkroutelogistics.ai",
    title: "Silk Route Logistics",
    description: "Michigan property broker. USDOT 4526880, Broker MC 1794414. Where Trust Travels.",
    images: [{ url: "/logo.png", alt: "Silk Route Logistics" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Silk Route Logistics",
    description: "Michigan property broker. USDOT 4526880, Broker MC 1794414. Where Trust Travels.",
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A2540",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${playfair.variable} ${dmSans.className}`}>
        <MaintenanceBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
