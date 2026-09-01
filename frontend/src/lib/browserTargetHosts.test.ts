/**
 * A browser-facing target must be reachable from the host that serves the page.
 *
 * WHY THIS EXISTS. The carrier portal's "View Rate Confirmation" link 404'd on
 * every load that had one. The backend wrote `/api/rate-confirmations/{id}/pdf`
 * into Load.rateConfirmationPdfUrl and two carrier pages rendered it into an
 * href — but the portal is a Cloudflare Pages static export on
 * silkroutelogistics.ai and the API is Render on api.silkroutelogistics.ai, so
 * the browser resolved it against the Pages host and got the Next.js 404 page
 * where a PDF belonged.
 *
 * The same audit found the identical shape in three more forms:
 *   - `.replace("/api", "")` to derive a base. Unanchored, so the FIRST `/api`
 *     in "https://api.silkroutelogistics.ai/api" is the one inside `https://api`
 *     and the base became "https:/.silkroutelogistics.ai/api". Localhost has one
 *     `/api`, so dev was fine and production was not.
 *   - `href={doc.fileUrl}` where fileUrl holds `s3://bucket/key` in production —
 *     a scheme no browser can open. Nine sites.
 *   - The API returning a storage key as `url` for the shipper portal to render,
 *     which is the same defect one layer further back.
 *
 * One rule covers all of them: **a value that came out of the database is not a
 * browser target.** Reach documents by id through the API, or build an absolute
 * URL with apiHref().
 *
 * PARSER NOTE. Comments are blanked before matching, offsets preserved. The
 * fixes for these defects are documented in comments that necessarily quote the
 * banned patterns, and an earlier draft of this guard flagged its own
 * explanations. Anchor on what runs, never on a word that appears in a comment
 * about what runs.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..");

/** Blank comments, preserving offsets so reported line numbers stay true. */
function stripComments(s: string): string {
  let o = "", i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { while (i < n && s[i] !== "\n") { o += " "; i++; } continue; }
    if (c === "/" && d === "*") {
      o += "  "; i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) { o += s[i] === "\n" ? "\n" : " "; i++; }
      o += "  "; i += 2; continue;
    }
    o += c; i++;
  }
  // JSX comments are {/* … */} — the block arm above already blanked the inner
  // text, and the surviving braces match nothing here.
  return o;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); continue; }
    if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Persisted URL columns. These specifically, not a generic `*Url` match: a local
 * `previewUrl` holding a blob, an external `profileUrl` from FMCSA, and a
 * `qrCodeDataUrl` holding a data: URI are all legitimate browser targets, and a
 * guard that flagged them would be noise. These names are database columns whose
 * values are storage keys or server-relative paths.
 */
const DB_URL_FIELDS = [
  "fileUrl",
  "podUrl",
  "bolPdfUrl",
  "rateConfirmationPdfUrl",
  "documentUrl",
  "signedUrl",
  "attachmentUrl",
];

interface Finding { file: string; line: number; detail: string }

function scan(): { findings: Finding[]; filesScanned: number; targetsSeen: number } {
  const findings: Finding[] = [];
  let targetsSeen = 0;
  const files = walk(SRC);

  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const rel = path.relative(SRC, file).replace(/\\/g, "/");
    const lineOf = (idx: number) => src.slice(0, idx).split("\n").length;

    // (1) A string literal `/api/...` used as a browser target. On a static
    //     export this can only ever resolve against the Pages host.
    const literalApi = /(?:href|src)=\{?["'`]\/api\/|window\.open\(\s*["'`]\/api\//g;
    let m: RegExpExecArray | null;
    while ((m = literalApi.exec(src))) {
      findings.push({ file: rel, line: lineOf(m.index), detail: "browser target begins with /api/ — on the Pages host that is a 404. Use apiHref()." });
    }

    // (2) A persisted URL column rendered straight into href/src.
    for (const field of DB_URL_FIELDS) {
      const dbField = new RegExp(`(?:href|src)=\\{[^}]*\\.${field}\\b`, "g");
      while ((m = dbField.exec(src))) {
        findings.push({ file: rel, line: lineOf(m.index), detail: `renders .${field} (a stored value, "s3://…" in production) as a browser target. Reach it by id through the API.` });
      }
    }

    // (3) Unanchored base derivation.
    const unanchored = /\.replace\(\s*["']\/api["']\s*,\s*["']["']\s*\)/g;
    while ((m = unanchored.exec(src))) {
      findings.push({ file: rel, line: lineOf(m.index), detail: 'unanchored .replace("/api","") — it strips the /api inside "https://api…". Use apiHref(), or /\\/api$/ if a base is genuinely needed.' });
    }

    targetsSeen += (src.match(/(?:href|src)=\{/g) ?? []).length;
  }

  return { findings, filesScanned: files.length, targetsSeen };
}

describe("browser-facing targets resolve on the host that serves them", () => {
  const { findings, filesScanned, targetsSeen } = scan();

  it("scanner reaches the frontend source (vacuity tripwire)", () => {
    // Without this, a broken walk() or a bad regex reports a clean sweep of
    // nothing at all — which is the failure mode this whole arc keeps hitting.
    expect(filesScanned).toBeGreaterThan(200);
    expect(targetsSeen).toBeGreaterThan(50);
  });

  it("no browser target points at /api/ on the page host, a stored URL, or an unanchored base", () => {
    expect(
      findings.map((f) => `${f.file}:${f.line}  ${f.detail}`),
      findings.length ? "\n  " + findings.map((f) => `${f.file}:${f.line}\n    ${f.detail}`).join("\n  ") + "\n" : "",
    ).toEqual([]);
  });

  it("apiHref is the single place the API base is assembled", () => {
    // If a second call site starts building the base by hand, rule (3) stops
    // being enough — it only catches the one idiom that has bitten us so far.
    const helper = fs.readFileSync(path.join(__dirname, "download.ts"), "utf8");
    expect(helper).toContain("export function apiHref");
    expect(helper).toContain("NEXT_PUBLIC_API_URL");

    const handRolled = walk(SRC)
      .filter((f) => !f.endsWith(path.join("lib", "download.ts")) && !f.endsWith(path.join("lib", "api.ts")))
      .filter((f) => /NEXT_PUBLIC_API_URL/.test(stripComments(fs.readFileSync(f, "utf8"))))
      .map((f) => path.relative(SRC, f).replace(/\\/g, "/"));

    // A frozen inventory rather than a threshold. Reading the env var is often
    // legitimate — the AE login page builds an SSO link with an ANCHORED regex,
    // config/env.ts is the config surface — so the rule is not "never". It is
    // "not somewhere new without someone looking", because the unanchored-strip
    // bug entered exactly this way. May shrink, never grow.
    const KNOWN_BASE_ASSEMBLERS = [
      "app/auth/login/page.tsx",
      "app/onboarding/page.tsx",
      "app/onboarding/verify/page.tsx",
      "app/shipper/register/page.tsx",
      "components/MarcoPolo.tsx",
      "components/dashboard/PlatformConfigBanner.tsx",
      "config/env.ts",
    ];
    const unexpected = handRolled.filter((f) => !KNOWN_BASE_ASSEMBLERS.includes(f));
    expect(
      unexpected,
      unexpected.length
        ? `New file(s) assembling the API base by hand:\n  ${unexpected.join("\n  ")}\n\nPrefer apiHref(). If a base is genuinely needed, anchor the strip (/\\/api$/) and add the file here.`
        : "",
    ).toEqual([]);

    const goneStale = KNOWN_BASE_ASSEMBLERS.filter((f) => !handRolled.includes(f));
    expect(
      goneStale,
      goneStale.length ? `Inventory lists file(s) that no longer assemble a base:\n  ${goneStale.join("\n  ")}\n\nDelete these lines.` : "",
    ).toEqual([]);
  });
});
