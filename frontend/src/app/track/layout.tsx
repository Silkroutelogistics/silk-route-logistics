import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Your Shipment",
  description: "Live shipment status, ETAs, and proof of delivery for Silk Route Logistics freight. Enter a tracking number or scan the BOL QR. No login required.",
  alternates: {
    canonical: "/track",
  },
  openGraph: {
    title: "Track Your Shipment | Silk Route Logistics",
    description: "Live shipment status and proof of delivery. Enter a tracking number or scan the BOL QR.",
    url: "/track",
  },
  twitter: {
    title: "Track Your Shipment | Silk Route Logistics",
    description: "Live shipment status and proof of delivery. Enter a tracking number or scan the BOL QR.",
  },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
