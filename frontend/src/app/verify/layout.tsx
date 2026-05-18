import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Rate Confirmation",
  description: "Confirm a Rate Confirmation was issued by Silk Route Logistics. Enter the RC token to check it against SRL records. Broker MC 1794414.",
  alternates: {
    canonical: "/verify",
  },
  openGraph: {
    title: "Verify Rate Confirmation | Silk Route Logistics",
    description: "Confirm a Rate Confirmation was issued by SRL. Broker MC 1794414.",
    url: "/verify",
  },
  twitter: {
    title: "Verify Rate Confirmation | Silk Route Logistics",
    description: "Confirm a Rate Confirmation was issued by SRL. Broker MC 1794414.",
  },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
