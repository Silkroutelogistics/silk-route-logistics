#!/usr/bin/env node
// Injects the shared SRL site chrome (nav + footer) into every static HTML
// page under frontend/public/ that declares INCLUDE markers. Idempotent —
// re-running replaces the marked region in place.
//
// Source of truth: frontend/src/lib/site-chrome.json (same JSON the React
// components consume, so HTML + React surfaces stay in lockstep).
//
// Pages opt in via markers:
//   <!-- INCLUDE:nav -->   ... generated content ...   <!-- END INCLUDE:nav -->
//   <!-- INCLUDE:footer --> ... generated content ... <!-- END INCLUDE:footer -->
//
// Wired as `prebuild` in frontend/package.json, so every `next build` (local
// or on Cloudflare Pages) re-renders the chrome from the JSON.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(root, "public");
const chromeJsonPath = path.join(root, "src/lib/site-chrome.json");

const chrome = JSON.parse(await readFile(chromeJsonPath, "utf8"));

function renderNav() {
  const navLinks = chrome.navItems
    .map((i) => `        <a href="${i.href}" class="nav-link">${escape(i.label)}</a>`)
    .join("\n");
  const desktopLogin = chrome.loginDropdown
    .map((i) => `            <a href="${i.href}" role="menuitem">${escape(i.label)}</a>`)
    .join("\n");
  const mobileLinks = chrome.navItems
    .map((i) => `      <a href="${i.href}" class="mobile-nav-link">${escape(i.label)}</a>`)
    .join("\n");
  const mobileLogin = chrome.loginDropdown
    .map((i) => `        <a href="${i.href}" class="mobile-nav-link">${escape(i.label)}</a>`)
    .join("\n");

  // Dual class names ("nav navbar" / "nav-inner navbar-inner" etc.) so the
  // generated chrome picks up styles from either of the two page CSS files
  // that exist across the marketing site (some use `.nav`, some `.navbar`).
  return `<nav class="nav navbar" id="srl-site-nav" role="navigation" aria-label="Main">
    <div class="nav-inner navbar-inner">
      <a href="/" class="srl-logo-wrap" aria-label="${escape(chrome.company)} Home">
        <img src="/logo.png" alt="SRL" class="srl-logo-img">
      </a>
      <div class="nav-links navbar-links">
${navLinks}
        <div class="nav-login-wrap" id="srl-login-wrap">
          <button type="button" class="nav-login-btn" id="srl-login-btn" aria-haspopup="true" aria-expanded="false">Sign In</button>
          <div class="nav-login-dropdown" role="menu">
${desktopLogin}
          </div>
        </div>
      </div>
      <button type="button" class="hamburger" id="srl-hamburger" aria-label="Toggle menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-overlay" id="srl-mobile-overlay"></div>
  <div class="mobile-menu" id="srl-mobile-menu">
${mobileLinks}
    <div class="mobile-login-section">
      <div class="label">Sign In</div>
${mobileLogin}
    </div>
  </div>
  <script>
    (function () {
      var btn = document.getElementById("srl-login-btn");
      var wrap = document.getElementById("srl-login-wrap");
      if (btn && wrap) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var open = wrap.classList.toggle("open");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
        document.addEventListener("click", function () {
          wrap.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
        });
      }
      var hamburger = document.getElementById("srl-hamburger");
      var menu = document.getElementById("srl-mobile-menu");
      var overlay = document.getElementById("srl-mobile-overlay");
      if (hamburger && menu && overlay) {
        var close = function () {
          menu.classList.remove("open");
          overlay.classList.remove("open");
          hamburger.setAttribute("aria-expanded", "false");
        };
        hamburger.addEventListener("click", function () {
          var open = menu.classList.toggle("open");
          overlay.classList.toggle("open", open);
          hamburger.setAttribute("aria-expanded", open ? "true" : "false");
        });
        overlay.addEventListener("click", close);
      }
    })();
  </script>`;
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

  return `<footer class="footer" id="srl-site-footer" role="contentinfo">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="footer-logo">
            <img src="/logo.png" alt="SRL" style="height:44px;width:auto;border-radius:6px;">
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

function replaceMarked(html, tag, rendered) {
  const re = new RegExp(`<!-- INCLUDE:${tag} -->[\\s\\S]*?<!-- END INCLUDE:${tag} -->`, "g");
  const block = `<!-- INCLUDE:${tag} -->\n  ${rendered}\n  <!-- END INCLUDE:${tag} -->`;
  if (!re.test(html)) return { html, touched: false };
  return { html: html.replace(re, block), touched: true };
}

// Marketing surface only. Portal (ae/**, carrier/**) + auth screens
// (auth/**) keep their own scoped chrome — inject-chrome must not touch them.
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

const navRendered = renderNav();
const footerRendered = renderFooter();

// Persist standalone partial files too — handy for grep + manual preview.
await writeFile(path.join(publicDir, "_partials", "nav.html"), navRendered + "\n", "utf8");
await writeFile(path.join(publicDir, "_partials", "footer.html"), footerRendered + "\n", "utf8");

const files = await walkHtml(publicDir);
let navHits = 0;
let footerHits = 0;
let changedFiles = 0;
for (const f of files) {
  const before = await readFile(f, "utf8");
  let html = before;
  const n = replaceMarked(html, "nav", navRendered);
  html = n.html;
  const fr = replaceMarked(html, "footer", footerRendered);
  html = fr.html;
  if (html !== before) {
    await writeFile(f, html, "utf8");
    changedFiles += 1;
    if (n.touched) navHits += 1;
    if (fr.touched) footerHits += 1;
  }
}

console.log(`[inject-chrome] scanned ${files.length} HTML files, rewrote ${changedFiles} (nav: ${navHits}, footer: ${footerHits})`);
