// Typed wrapper around site-chrome.json. The JSON file is the single source
// of truth — it's consumed by React (via this import) AND by the static-HTML
// inject script at frontend/scripts/inject-chrome.mjs. Keep the two surfaces
// aligned by editing the JSON only; re-run the injector on the HTML side.

import data from "./site-chrome.json";

export interface ChromeLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: ChromeLink[];
}

export interface SiteChrome {
  company: string;
  tagline: string;
  mcNumber: string;
  dotNumber: string;
  phone: string;
  phoneTel: string;
  email: string;
  website: string;
  addressCity: string;
  addressState: string;
  copyrightYear: number;
  navItems: ChromeLink[];
  loginDropdown: ChromeLink[];
  footerCols: FooterColumn[];
  legalLinks: ChromeLink[];
}

export const siteChrome = data as SiteChrome;
