import type { Metadata } from "next";

/**
 * carrier-portal-upgrade G42 — the carrier portal installs to a phone's home
 * screen as its own app.
 *
 * The site manifest (public/manifest.json) starts at the marketing home with
 * display "browser", so "Add to Home Screen" gave a carrier a bookmark to the
 * public site. Changing that file would change how the marketing site installs,
 * which is not this arc's call. This segment points every /carrier page at its
 * own manifest instead: start at the dashboard, scoped to /carrier/, standalone.
 * Next merges this over the root metadata; nothing else on the page changes.
 */
export const metadata: Metadata = {
  manifest: "/carrier-manifest.json",
  appleWebApp: { capable: true, title: "SRL Carrier", statusBarStyle: "default" },
};

export default function CarrierSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
