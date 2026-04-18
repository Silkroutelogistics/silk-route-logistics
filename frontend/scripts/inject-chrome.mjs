#!/usr/bin/env node
// Injects the shared SRL site chrome (nav + footer) into every marketing HTML
// page that declares INCLUDE markers. Idempotent — re-running replaces the
// marked region in place.
//
// Source of truth: frontend/src/lib/site-chrome.json (also consumed by the
// React <SiteFooter /> / <SiteNav /> components, so HTML + React stay aligned).
//
// Markers:
//   <!-- INCLUDE:nav -->   ... generated content ...   <!-- END INCLUDE:nav -->
//   <!-- INCLUDE:footer --> ... generated content ... <!-- END INCLUDE:footer -->
//
// Wired as `prebuild` in package.json, so every `next build` re-renders the
// chrome. Each page keeps its own pre-existing inline <script> that wires the
// legacy IDs below, so the injected markup intentionally uses those IDs
// (mainNav, loginBtn, loginWrap, hamburger, mobileMenu, mobileOverlay).
//
// INTEGRITY GUARD: after every write the script SHA-256s the content outside
// the INCLUDE markers and refuses to proceed if it changed. This makes the
// class of bug that produced the v3.6.f/g regression structurally impossible.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(root, "public");
const chromeJsonPath = path.join(root, "src/lib/site-chrome.json");

const chrome = JSON.parse(await readFile(chromeJsonPath, "utf8"));

// Penguin SVG copied verbatim from the pre-Phase-2 index.html
// (commit 36e5636, frontend/public/index.html lines 47-56). Animated via
// srl-logo.css (@keyframes penguin-north + waddle) which is already loaded
// on every marketing page that opts into this variant.
const PENGUIN_SVG = `<svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="12" cy="17" rx="7" ry="9" fill="#1a1a2e"/>
              <ellipse cx="12" cy="18" rx="4.5" ry="6" fill="#e8e8e8"/>
              <circle cx="12" cy="8" r="5.5" fill="#1a1a2e"/>
              <circle cx="10" cy="7" r="1.1" fill="white"/><circle cx="14" cy="7" r="1.1" fill="white"/>
              <circle cx="10.4" cy="7.2" r="0.5" fill="#111"/><circle cx="14.4" cy="7.2" r="0.5" fill="#111"/>
              <polygon points="12,9.5 10.5,11.5 13.5,11.5" fill="#C8963E"/>
              <ellipse cx="9" cy="26" rx="3" ry="1.3" fill="#C8963E"/>
              <ellipse cx="15" cy="26" rx="3" ry="1.3" fill="#C8963E"/>
            </svg>`;

function renderNav(variant) {
  const navLinks = chrome.navItems
    .map((i) => `        <a href="${i.href}" class="nav-link">${escape(i.label)}</a>`)
    .join("\n");
  const desktopLogin = chrome.loginDropdown
    .map((i) => `            <a href="${i.href}" role="menuitem">${escape(i.label)}</a>`)
    .join("\n");
  const mobileLinks = chrome.navItems
    .map((i) => `    <a href="${i.href}" class="mobile-nav-link">${escape(i.label)}</a>`)
    .join("\n");
  const mobileLogin = chrome.loginDropdown
    .map((i) => `      <a href="${i.href}" class="mobile-nav-link">${escape(i.label)}</a>`)
    .join("\n");

  // Penguin variant: render the walking-penguin overlay inside the logo wrap
  // (used only on index.html via `<!-- INCLUDE:nav logo="penguin" -->`).
  const logoOverlay = variant === "penguin"
    ? `
        <div class="srl-penguin-zone">
          <div class="srl-penguin">
            ${PENGUIN_SVG}
          </div>
        </div>`
    : "";

  // Dual class names ("nav navbar" / "nav-inner navbar-inner" etc.) so the
  // generated chrome picks up styles from either of the two page CSS files
  // that exist across the marketing site (some use `.nav`, some `.navbar`).
  //
  // IDs are intentionally the LEGACY names (mainNav, loginBtn, loginWrap,
  // hamburger, mobileMenu, mobileOverlay) because each page already has an
  // inline <script> that wires these IDs for scroll effects, dropdown toggles,
  // and mobile-menu behavior. Renaming them would null-deref the pre-existing
  // scripts and break layout (v3.6.f/g regression). The injected chrome does
  // NOT ship its own wiring script — each page's existing JS is the source of
  // truth for behavior.
  return `<nav class="nav navbar" id="mainNav" role="navigation" aria-label="Main">
    <div class="nav-inner navbar-inner">
      <a href="/" class="srl-logo-wrap" aria-label="${escape(chrome.company)} Home">
        <img src="/logo.png" alt="SRL" class="srl-logo-img">${logoOverlay}
      </a>
      <div class="nav-links navbar-links">
${navLinks}
        <div class="nav-login-wrap" id="loginWrap">
          <button type="button" class="nav-login-btn" id="loginBtn" aria-haspopup="true" aria-expanded="false">Sign In</button>
          <div class="nav-login-dropdown" role="menu">
${desktopLogin}
          </div>
        </div>
      </div>
      <button type="button" class="hamburger" id="hamburger" aria-label="Toggle menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-overlay" id="mobileOverlay"></div>
  <div class="mobile-menu" id="mobileMenu">
${mobileLinks}
    <div class="mobile-login-section">
      <div class="label">Sign In</div>
${mobileLogin}
    </div>
  </div>`;
}

function renderFooter() {
  const cols = chrome.footerCols
    .map(
      (col) => `        <div class="footer-col">
          <h5>${escape(col.heading)}</h5>
${col.links.map((l) => `          <a href="${l.href}">${escape(l.label)}</a>`).join("\n")}
        </div>`,
    )
    .join("\n");

  const legal = chrome.legalLinks
    .map((l) => `          <a href="${l.href}">${escape(l.label)}</a>`)
    .join("\n");

  return `<footer class="footer" id="footer" role="contentinfo">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="footer-logo">
            <a href="/" aria-label="${escape(chrome.company)} home" style="display:inline-block;line-height:0;">
              <img src="/logo.png" alt="SRL" style="height:44px;width:auto;border-radius:6px;">
            </a>
          </div>
          <p>${escape(chrome.tagline)}</p>
          <p style="margin-top:12px">
            ${escape(chrome.addressCity)}, ${escape(chrome.addressState)}<br>
            <a href="tel:${escape(chrome.phoneTel)}">${escape(chrome.phone)}</a><br>
            <a href="mailto:${escape(chrome.email)}">${escape(chrome.email)}</a>
          </p>
        </div>
${cols}
      </div>
      <div class="footer-bottom">
        <p>&copy; ${chrome.copyrightYear} ${escape(chrome.company)} &nbsp;|&nbsp; MC# ${escape(chrome.mcNumber)} &nbsp;|&nbsp; DOT# ${escape(chrome.dotNumber)}</p>
        <div class="footer-bottom-links">
${legal}
        </div>
      </div>
    </div>
  </footer>`;
}

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Hash everything EXCEPT the region between INCLUDE/END markers. Any change
// to the hash means a write modified content we don't own — refuse to save.
function hashOutsideMarkers(html) {
  let stripped = html;
  for (const tag of ["nav", "footer"]) {
    const re = new RegExp(`<!-- INCLUDE:${tag}(?:\\s+[^>]*?)?\\s*-->[\\s\\S]*?<!-- END INCLUDE:${tag} -->`, "g");
    stripped = stripped.replace(re, `__CHROME_${tag.toUpperCase()}__`);
  }
  return createHash("sha256").update(stripped).digest("hex");
}

// Marker regex captures optional attributes (group 1) so callers can render
// variant-specific content based on e.g. `logo="penguin"`. Attributes are
// preserved verbatim on write so the marker survives re-injection.
function replaceMarked(html, tag, renderer) {
  const re = new RegExp(`<!-- INCLUDE:${tag}(?:\\s+([^>]*?))?\\s*-->[\\s\\S]*?<!-- END INCLUDE:${tag} -->`, "g");
  if (!re.test(html)) return { html, touched: false };
  const out = html.replace(re, (_match, attrs) => {
    const attrStr = attrs ? ` ${attrs.trim()}` : "";
    const rendered = renderer(parseAttrs(attrs));
    return `<!-- INCLUDE:${tag}${attrStr} -->\n  ${rendered}\n  <!-- END INCLUDE:${tag} -->`;
  });
  return { html: out, touched: true };
}

function parseAttrs(s) {
  const out = {};
  if (!s) return out;
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) out[m[1]] = m[2];
  return out;
}

// Marketing surface only. Portal (ae/**, carrier/**) + auth screens (auth/**)
// keep their own scoped chrome — inject-chrome must not touch them.
const MARKETING_PAGES = new Set([
  "about.html", "blog.html", "careers.html", "carriers.html", "contact.html",
  "faq.html", "index.html", "login.html", "privacy.html", "register.html",
  "security-policy.html", "shippers.html", "terms.html", "tracking.html",
]);

async function walkHtml(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".html")) continue;
    if (!MARKETING_PAGES.has(ent.name)) continue;
    out.push(path.join(dir, ent.name));
  }
  return out;
}

// Partials preview: default (no-variant) render, for grep/preview only.
await writeFile(path.join(publicDir, "_partials", "nav.html"), renderNav("default") + "\n", "utf8");
await writeFile(path.join(publicDir, "_partials", "footer.html"), renderFooter() + "\n", "utf8");

const navRenderer = (attrs) => renderNav(attrs?.logo || "default");
const footerRenderer = () => renderFooter();

const files = await walkHtml(publicDir);
let navHits = 0;
let footerHits = 0;
let changedFiles = 0;

for (const f of files) {
  const before = await readFile(f, "utf8");
  const preHash = hashOutsideMarkers(before);

  const n = replaceMarked(before, "nav", navRenderer);
  const fr = replaceMarked(n.html, "footer", footerRenderer);
  const after = fr.html;

  if (after === before) continue;

  const postHash = hashOutsideMarkers(after);
  if (preHash !== postHash) {
    const rel = path.relative(root, f);
    console.error(`[inject-chrome] INTEGRITY FAILURE in ${rel}: content outside INCLUDE markers changed. Refusing to write. Restore the file and re-run.`);
    process.exit(2);
  }

  await writeFile(f, after, "utf8");
  changedFiles += 1;
  if (n.touched) navHits += 1;
  if (fr.touched) footerHits += 1;
}

console.log(`[inject-chrome] scanned ${files.length} HTML files, rewrote ${changedFiles} (nav: ${navHits}, footer: ${footerHits})`);
