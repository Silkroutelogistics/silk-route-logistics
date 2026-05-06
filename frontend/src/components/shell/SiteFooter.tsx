import Link from "next/link";
import { siteChrome } from "@/lib/site-chrome";

interface SiteFooterProps {
  compact?: boolean;
  showLegalColumn?: boolean;
  theme?: "dark" | "light";
}

export function SiteFooter({ compact = false, showLegalColumn = true, theme = "dark" }: SiteFooterProps) {
  const isDark = theme === "dark";
  const baseText = isDark ? "text-white/70" : "text-slate-600";
  const headingText = isDark ? "text-white" : "text-slate-900";
  const linkText = isDark ? "text-white/70 hover:text-white" : "text-slate-600 hover:text-slate-900";
  const bg = isDark ? "bg-[#0F1117] border-t border-[#C9A84C]/15" : "bg-white border-t border-slate-200";

  if (compact) {
    return (
      <footer className={`${bg} px-6 py-5`}>
        <div className="max-w-[1280px] mx-auto flex justify-between items-center flex-wrap gap-3">
          <div className={`text-[11px] ${baseText}`}>
            © {siteChrome.copyrightYear} {siteChrome.company} · {siteChrome.addressCity}, {siteChrome.addressState} · MC# {siteChrome.mcNumber} · DOT# {siteChrome.dotNumber}
          </div>
          <div className={`text-[11px] ${baseText}`}>{siteChrome.tagline}</div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`${bg} px-6 py-12`}>
      <div className="max-w-[1280px] mx-auto">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Link href="/" aria-label={`${siteChrome.company} home`} style={{ display: "inline-block", lineHeight: 0 }}>
                <img src="/logo.png" alt="Silk Route Logistics" style={{ height: 36, width: "auto", borderRadius: 6 }} />
              </Link>
            </div>
            <p className={`text-[13px] leading-relaxed ${baseText} max-w-sm`}>{siteChrome.tagline}</p>
            <p className={`text-[12px] mt-3 ${baseText}`}>
              {siteChrome.addressCity}, {siteChrome.addressState}
              <br />
              <a href={`tel:${siteChrome.phoneTel}`} className={linkText}>{siteChrome.phone}</a>
              <br />
              <a href={`mailto:${siteChrome.email}`} className={linkText}>{siteChrome.email}</a>
            </p>
          </div>

          {siteChrome.footerCols.map((col) => (
            <div key={col.heading}>
              <h5 className={`text-[12px] font-semibold uppercase tracking-wider mb-3 ${headingText}`}>{col.heading}</h5>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className={`text-[13px] ${linkText}`}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={`mt-10 pt-6 border-t ${isDark ? "border-white/10" : "border-slate-200"} flex flex-wrap items-center justify-between gap-3`}>
          <p className={`text-[11px] ${baseText}`}>
            © {siteChrome.copyrightYear} {siteChrome.company} · MC# {siteChrome.mcNumber} · DOT# {siteChrome.dotNumber}
          </p>
          {showLegalColumn && (
            <div className="flex gap-4">
              {siteChrome.legalLinks.map((l) => (
                <Link key={l.href} href={l.href} className={`text-[11px] ${linkText}`}>{l.label}</Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
