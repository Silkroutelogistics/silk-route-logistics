import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
// Playfair is 400 + 700 ONLY per the srl-brand-design skill — no medium, no
// semibold. Pinned by backend/__tests__/unit/ci/typographyTokens.test.ts, so
// re-adding 500 or 600 here fails CI before any component can use it.
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", weight: ["400", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://silkroutelogistics.ai"),
  title: {
    default: "Silk Route Logistics",
    template: "%s | Silk Route Logistics",
  },
  description: "Silk Route Logistics Inc. is a Michigan property broker (USDOT 4526880, Broker MC 1794414) moving freight across the 48 contiguous United States. Where Trust Travels.",
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
    // The font VARIABLES must sit on <html>, not <body>. Tailwind's @theme declares
    // --font-serif / --font-sans on :root as `var(--font-playfair), …`, and a var()
    // inside a custom property is substituted where that property is DECLARED. With
    // the variables on <body>, --font-playfair was undefined at :root, so --font-serif
    // resolved to the guaranteed-invalid value and inherited as invalid — every
    // font-serif heading silently fell back to the body face. The compiled CSS was
    // correct; only a browser could see it. Keep .variable on <html>.
    <html lang="en" className={`${dmSans.variable} ${playfair.variable}`}>
      <body className={dmSans.className}>
        <MaintenanceBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
