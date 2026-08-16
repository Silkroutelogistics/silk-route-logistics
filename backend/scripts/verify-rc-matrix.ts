/** v3.8.arl — Rate Confirmation fit matrix. Asserts page count is stable and
 *  nothing renders below the footer rule across variable content.
 *
 *  v3.8.ary — two additions, both closing gaps that let a real defect through:
 *
 *  (1) PAGE COUNT IS NOW ASSERTED. This script printed `pages=N` from the start
 *      but never checked it, so "ALL CASES PASS" was never evidence of
 *      page-count stability — a change that silently added or dropped a page
 *      passed the gate. See EXPECTED_PAGES.
 *
 *  (2) `--dump` regenerates docs/rc-references/_CURRENT_SRL_RC_RENDERED.txt
 *      from this same render. That capture had gone stale (it was a 2-page
 *      document while the code rendered 3, and it still carried strings that
 *      v3.8.arw removed), and a spec was then written from it — so the stale
 *      artefact taught a wrong page map to everything downstream. Regenerating
 *      from the gate that already renders these fixtures removes the manual
 *      step that rotted.
 */
import * as fs from "fs";
import * as path from "path";
import { generateEnhancedRateConfirmation } from "../src/services/pdfService";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CAPTURE_FILE = path.join(REPO_ROOT, "docs", "rc-references", "_CURRENT_SRL_RC_RENDERED.txt");

/** Recorded page count per fixture — a BASELINE, NOT A LAW.
 *
 *  The Rate Confirmation legitimately grew from 2 pages to 3 across
 *  v3.8.arp/arq/art, and that was correct. So a mismatch here does not mean
 *  "you broke it"; it means "the document changed shape — go look at the PDF,
 *  decide whether the new shape is right, and if it is, update this number in
 *  the same commit that changed it." What it stops is the change going
 *  unnoticed, which is exactly what happened to the reference capture.
 */
const EXPECTED_PAGES: Record<string, number> = {
  "baseline 1 line": 3,
  "3 lines": 3,
  "6 lines": 3,
  "long special instr": 3,
  reefer: 3,
  "long names": 3,
  "no carrier assigned": 3,
  "customTerms set": 3,
  "worst case": 3,
  "qp not elected": 3,
  "qp 7-day": 3,
  "qp same-day": 3,
  "qp fee without speed": 3,
  "qp standard label with fee": 3,
  "qp with accessorials": 3,
};

/** Cases written into the reference capture by a bare `--dump`. One dry van and
 *  one reefer, which is what that file has always held — the reefer case is the
 *  only one that exercises the TEMPERATURE CONTROL block. `--dump=all` writes
 *  all nine; `--dump=reefer,worst case` writes a named subset. */
/** v3.8.asb — "qp 7-day" added. The capture held only loads with no Quick Pay
 *  election, so the reference artefact showed the Quick Pay surface in exactly
 *  one of its two states, and the state it never showed is the one where a
 *  carrier is charged money. */
const DUMP_DEFAULT = ["baseline 1 line", "reefer", "qp 7-day"];

type Row = { y: number; text: string };

/** Text a case must render, and text it must not. Empty for the fit-only
 *  fixtures, which exist to check geometry rather than content.
 *
 *  v3.8.asb — added because this script had never rendered a Quick Pay rate
 *  confirmation. `grep -c "carrierPaymentTier\|quickPay" ` on this file
 *  returned 0: every fixture passed `fd` with no tier and no election, so all
 *  nine took the no-tier nudge path and the entire Quick Pay surface was green
 *  while untested. The defect that shipped under that gap was the rate
 *  confirmation printing a TIER NAME where the applied fee belongs, so a
 *  carrier charged 3% had no document stating 3%. The assertions below are
 *  what would have caught it.
 */
type TextExpect = { expect?: string[]; forbid?: string[] };

/** Whitespace-insensitive containment.
 *
 *  pdf.js splits a single PDFKit text run into several items whenever the
 *  glyph run breaks, so "3% · 7-day" can arrive as three items. Joining items
 *  with a space and then comparing with all whitespace removed on both sides
 *  makes the assertion independent of where the extractor chose to split,
 *  which is the §19 Sub-pattern 9 false-negative class ("freight \ncharges")
 *  that has bitten the e2e pins before.
 */
const squash = (s: string) => s.replace(/\s+/g, "");
const hasText = (haystack: string, needle: string) => squash(haystack).includes(squash(needle));

/** Reproduces the pre-existing capture format exactly, so a diff against the
 *  previous version reads as a content change rather than a format change:
 *  Y (top-down, rounded to 0.5) padded to 7, two spaces, then every text item
 *  sharing that Y sorted left-to-right and joined with " ⟂ ". */
function captureBlock(name: string, pages: Row[][]): string {
  let s = `\n\n################ CASE: ${name} — ${pages.length} pages ################\n`;
  pages.forEach((rows, i) => {
    s += `\n─────────── PAGE ${i + 1} ───────────\n`;
    for (const r of rows) s += String(r.y).padStart(7) + "  " + r.text + "\n";
  });
  return s;
}

/** Derived from git rather than hand-typed, because a hand-typed provenance
 *  stamp is precisely what goes stale. */
async function sourceStamp(): Promise<string> {
  try {
    const { execFileSync } = await import("child_process");
    const git = (args: string[]) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
    const sha = git(["rev-parse", "--short", "HEAD"]).trim();
    const version = git(["log", "-1", "--pretty=%s"]).trim().match(/v\d+\.\d+\.[a-z]+/)?.[0] ?? "no version letter in HEAD subject";
    const renderInputs = ["backend/src/services/pdfService.ts", "backend/src/lib/srl-chrome.ts"];
    // Strip the two-character porcelain status and its separator. Do NOT trim
    // the whole blob first: that eats the leading space of " M path" and takes
    // the first character of the filename with it.
    const dirty = git(["status", "--porcelain", "--", ...renderInputs])
      .split("\n").map((l) => l.replace(/^\s*\S+\s+/, "").trim()).filter(Boolean);
    return `${version} (commit ${sha})` + (dirty.length ? ` PLUS uncommitted changes to ${dirty.join(", ")}` : "");
  } catch {
    return "unknown — git was not available when this was generated";
  }
}

function makeLoad(o: { rows?: number; longSi?: boolean; reefer?: boolean; longNames?: boolean; noCarrier?: boolean; custom?: boolean } = {}): any {
  const rows = o.rows ?? 1;
  return {
    id: "t", referenceNumber: "SRL-121488",
    originCompany: o.longNames ? "Virun Nutraceutical Manufacturing & Distribution LLC" : "Virun",
    originAddress: "1750 North 8th Street", originCity: "Colton", originState: "CA", originZip: "92324",
    originContactName: "Monika Pape",
    destCompany: o.longNames ? "Mainfreight Distribution Services North Lake Facility" : "Mainfreight North Lake",
    destAddress: "17801 Interstate 35 West Service Road", destCity: "Northlake", destState: "TX", destZip: "76262",
    pickupDate: new Date("2026-08-13"), deliveryDate: new Date("2026-08-17"),
    equipmentType: o.reefer ? "Reefer 53'" : "Dry Van 53'",
    temperatureControlled: !!o.reefer, tempMin: o.reefer ? 34 : null, tempMax: o.reefer ? 38 : null,
    commodity: "Mixed", weight: 16500, pieces: 26, distance: 1350, rate: 4100, customerRate: 4850,
    specialInstructions: o.longSi
      ? "Driver Assist is Needed. Call ahead 2 hours before arrival. Dock 26 only; overnight parking not permitted; PPE required inside the facility; lumper receipt must accompany the POD; driver must reseal after each stop and record the seal number on the bill of lading."
      : "Driver Assist is Needed",
    poNumbers: ["PO1770"],
    lineItems: Array.from({ length: rows }, (_, i) => ({
      lineNumber: i + 1, pieces: 10 + i, packageType: "PLT",
      description: "Commodity line " + (i + 1), weight: 2000 + i * 500, freightClass: "70", hazmat: false,
    })),
    carrier: o.noCarrier ? null : {
      firstName: "Test", lastName: "Carrier",
      company: o.longNames ? "Zamorano Enterprises Transportation Services LLC" : "ZO Enterprises LLC",
      phone: "555-555-5555",
      carrierProfile: { mcNumber: "MC-596655", dotNumber: "1911857", tier: "SILVER", contactEmail: "d@x.com" },
    },
    poster: { firstName: "Wasi", lastName: "Haider", phone: "(269) 220-6760" },
    customer: { name: "Beekeepers Naturals USA Inc." },
  };
}

(async () => {
  const dumpArg = process.argv.find((a) => a === "--dump" || a.startsWith("--dump="));
  const dumpSel: string[] | null = !dumpArg
    ? null
    : dumpArg.includes("=")
      ? dumpArg.slice(dumpArg.indexOf("=") + 1).split(",").map((s) => s.trim()).filter(Boolean)
      : DUMP_DEFAULT;
  const dumpAll = !!dumpSel && dumpSel.includes("all");

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Quick Pay fixtures. The formData shapes mirror what
  // autoRateConfirmationService actually writes: carrierPaymentTier, plus
  // quickPaySpeed + quickPayFeePercent when the carrier elected on this load.
  // Fixture line haul is 4100 with no fuel surcharge, so 3% is $123.00 and 5%
  // is $205.00 — the dollar assertions below are the arithmetic a carrier
  // would do against the rate on the page.
  const cases: [string, any, any, TextExpect?][] = [
    ["baseline 1 line", makeLoad(), {}],
    ["3 lines", makeLoad({ rows: 3 }), {}],
    ["6 lines", makeLoad({ rows: 6 }), {}],
    ["long special instr", makeLoad({ longSi: true }), {}],
    ["reefer", makeLoad({ reefer: true }), {}],
    ["long names", makeLoad({ longNames: true }), {}],
    ["no carrier assigned", makeLoad({ noCarrier: true }), {}],
    ["customTerms set", makeLoad(), { customTerms: "Driver must call dispatch 1 hour prior to arrival at both stops." }],
    ["worst case", makeLoad({ rows: 6, longSi: true, reefer: true, longNames: true }), { customTerms: "Extra handling required." }],

    // No election — the ordinary case, since Quick Pay is off per load unless
    // the carrier elects it. A tier IS set, which is precisely the state that
    // used to print "SILVER" in the QUICK PAY cell and the full three-tier
    // price list in the panel, saying nothing about this load.
    [
      "qp not elected",
      makeLoad(),
      { carrierPaymentTier: "SILVER", paymentTerms: "Net-30" },
      {
        expect: [
          "Not elected",
          "No Quick Pay elected on this load",
          "standard Silver terms at no fee",
          // OPERATIONAL TERMS grid — the second site that printed the tier
          // name in a QUICK PAY cell whose neighbours (DETENTION, TONU,
          // LAYOVER) all state money.
          "Not elected on this load",
        ],
        forbid: ["FEE ON THIS RATE", "NET ON THIS RATE", "QUICK PAY SILVER"],
      },
    ],
    // Elected, seven-day. The fee, the speed and the arithmetic all have to be
    // on the page: this is the case where a carrier is charged $123 and the
    // document has to say why.
    [
      "qp 7-day",
      makeLoad(),
      { carrierPaymentTier: "SILVER", quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 3, paymentTerms: "7 days" },
      {
        expect: [
          "3% · 7-day",
          "QUICK PAY FEE",
          "FEE ON THIS RATE",
          "$123.00",
          "$3,977.00",
          "7 days",
          "3% at 7 days on this load",
        ],
        forbid: ["No Quick Pay elected", "Not elected", "QUICK PAY SILVER"],
      },
    ],
    // Elected, same-day. The meta cell candidate "Same-day · 5%" that upstream
    // pre-computes measures 69.6pt against a 67.5pt column and would overprint
    // TERMS; the renderer measures and takes "5% same day" (61.5pt) instead.
    [
      "qp same-day",
      makeLoad(),
      { carrierPaymentTier: "SILVER", quickPaySpeed: "SAME_DAY", quickPayFeePercent: 5, paymentTerms: "Same day" },
      {
        expect: ["5% same day", "$205.00", "$3,895.00", "Same day", "5% same day on this load"],
        forbid: ["No Quick Pay elected", "Not elected", "QUICK PAY SILVER"],
      },
    ],
    // The Zod-strip path. validators/rateConfirmation.ts declares
    // quickPayFeePercent but not quickPaySpeed, so any AE edit parses the
    // speed away and leaves the percent. A real fee still applies and the
    // document must still state it rather than falling through to "not
    // elected", which would tell the carrier they are not being charged.
    [
      "qp fee without speed",
      makeLoad(),
      { carrierPaymentTier: "GOLD", quickPayFeePercent: 2 },
      { expect: ["2% · 7-day", "QUICK PAY FEE", "$82.00"], forbid: ["No Quick Pay elected", "Not elected"] },
    ],
    // Contradictory input: a STANDARD speed label sitting beside a non-zero
    // frozen percent. carrierPayments can write this pair, and the ledger
    // charges the percent anyway because integrationService derives the speed
    // FROM the percent. The document has to state the fee the carrier will
    // actually be charged, so the percent wins here too.
    [
      "qp standard label with fee",
      makeLoad(),
      { carrierPaymentTier: "SILVER", quickPaySpeed: "STANDARD", quickPayFeePercent: 3 },
      { expect: ["3% · 7-day", "$123.00"], forbid: ["No Quick Pay elected", "Not elected"] },
    ],
    // Accessorials present. The fee base is line haul plus fuel plus approved
    // accessorials LESS anything reimbursed at cost, and the at-cost test lives
    // in integrationService. The renderer will not keep a second copy of that
    // rule, so it states speed and fee and leaves the arithmetic to the
    // settlement that owns it. What it must never do is print a dollar figure
    // computed on a base it cannot classify.
    [
      "qp with accessorials",
      makeLoad(),
      {
        carrierPaymentTier: "SILVER",
        quickPaySpeed: "SEVEN_DAY",
        quickPayFeePercent: 3,
        paymentTerms: "7 days",
        accessorials: [{ type: "Lumper", description: "Lumper reimbursed at cost", amount: 150 }],
      },
      { expect: ["3% · 7-day", "QUICK PAY FEE"], forbid: ["FEE ON THIS RATE", "NET ON THIS RATE"] },
    ],
  ];
  let fails = 0;
  const captured: string[] = [];
  const dumpedNames: string[] = [];
  for (const [name, load, extra, texts] of cases) {
    try {
      const wantCapture = !!dumpSel && (dumpAll || dumpSel.includes(name));
      const fd = { carrierRate: 4100, fuelSurcharge: 0, totalCarrierPay: 4100, ...extra };
      const doc = generateEnhancedRateConfirmation(load, fd);
      const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
      await new Promise<void>((r) => doc.on("end", () => r()));
      const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
      const problems: string[] = []; const dead: number[] = []; let sawBca = false, sawInvoicing = false;
      const pages: Row[][] = [];
      let allText = "";
      for (let pn = 1; pn <= d.numPages; pn++) {
        const tc = await (await d.getPage(pn)).getTextContent();
        const bands = new Map<number, { x: number; s: string }[]>();
        let maxY = 0;
        for (const it of tc.items as any[]) {
          const s = String(it.str).trim(); if (!s) continue;
          allText += s + " ";
          const yTop = Math.round((792 - it.transform[5]) * 2) / 2;
          if (s.includes("Broker-Carrier Agreement")) sawBca = true;
          if (s.includes("accounting@silkroutelogistics.ai")) sawInvoicing = true;
          const isFooter = s.includes("Page ") || s.startsWith("MC# 1794414 · DOT#") || s.startsWith("Where Trust Travels");
          if (!isFooter) maxY = Math.max(maxY, yTop);
          if (wantCapture) {
            if (!bands.has(yTop)) bands.set(yTop, []);
            bands.get(yTop)!.push({ x: it.transform[4], s });
          }
        }
        if (wantCapture) {
          pages.push([...bands.entries()].sort((a, b) => a[0] - b[0]).map(([y, items]) => ({
            y, text: items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ⟂ "),
          })));
        }
        dead.push(Math.round(738 - maxY));
        // v3.8.arm — the footer text baseline lands at ≈755.5.
        // v3.8.ary — this comment used to say the footer RULE was at y≈755 too.
        // It is not: drawFooter puts the rule at PAGE_H − MARGIN − 12 − 4 = 740
        // (792 − 36 − 16), and 755.5 is the footer text below it. So 738 buys
        // 2pt of baseline clearance above the rule, not ~17. The threshold is
        // unchanged and correct; only the stated geometry was wrong, and it was
        // wrong in the README too.  maxY here is the BASELINE of the last body
        // line, so its descenders (and any wrap the extractor reports as a
        // separate item) sit below it. The old threshold of 768 let a body line
        // at 753.5 score as "dead=2 :: ok" while it was in fact rendering
        // through the footer — caught by coordinate audit, not by this matrix.
        // Require ~6pt of real clearance above the rule.
        if (maxY > 738) problems.push("p" + pn + " collides with footer (last baseline " + maxY + ", rule at 740)");
      }
      // v3.8.ary — page-count assertion. Deliberately worded so a failure reads
      // as "confirm and re-record", not "revert": the baseline is a record of
      // observed behaviour, and the correct fix is sometimes to update it.
      const expected = EXPECTED_PAGES[name];
      if (expected === undefined) {
        problems.push("no recorded page-count baseline for this fixture — add \"" + name + "\" to EXPECTED_PAGES");
      } else if (d.numPages !== expected) {
        problems.push("PAGE COUNT changed: rendered " + d.numPages + ", recorded baseline " + expected
          + " — the baseline is a record of current behaviour, not a law. Open the PDF, confirm the new"
          + " shape is intended, then update EXPECTED_PAGES[\"" + name + "\"] in this file in the same commit.");
      }
      if (!sawBca) problems.push("BCA incorporation MISSING");
      if (!sawInvoicing) problems.push("invoicing block MISSING");
      for (const want of texts?.expect ?? []) {
        if (!hasText(allText, want)) problems.push('MISSING TEXT: "' + want + '"');
      }
      for (const nope of texts?.forbid ?? []) {
        if (hasText(allText, nope)) problems.push('FORBIDDEN TEXT PRESENT: "' + nope + '"');
      }
      if (problems.length) fails++;
      if (wantCapture && !problems.length) { captured.push(captureBlock(name, pages)); dumpedNames.push(name); }
      console.log(name.padEnd(22) + "pages=" + d.numPages + " dead=[" + dead.join(", ") + "] :: " + (problems.length ? "FAIL " + problems.join("; ") : "ok"));
    } catch (e: any) { fails++; console.log(name.padEnd(22) + "THREW: " + (e?.message ?? e)); }
  }

  if (dumpSel) {
    const unmatched = dumpAll ? [] : dumpSel.filter((n) => !cases.some(([cn]) => cn === n));
    if (unmatched.length) console.log("\n--dump: no such fixture: " + unmatched.join(", "));
    if (!captured.length) {
      console.log("--dump: nothing captured, capture file left untouched");
      fails++;
    } else {
      const stamp = [
        "SRL RATE CONFIRMATION — RENDERED CAPTURE",
        "",
        "Generated " + new Date().toISOString().slice(0, 10) + " from " + (await sourceStamp()) + ".",
        "Regenerate:  cd backend && npx tsx scripts/verify-rc-matrix.ts --dump",
        "",
        "Y coordinates are top-down from the page top, rounded to 0.5pt. Items sharing",
        "a Y are listed left to right, joined with \" ⟂ \". The gold footer rule sits",
        "at y = 740 and the footer text baseline at ≈ 755.5; body content must stay",
        "at or above 738.",
        "",
        "One line changes on every regeneration by design: DATE ISSUED, which is the",
        "render date. A diff confined to that value means nothing moved.",
        "",
        "The verify-URL token is NOT that line. rcVerifyToken (verifyController.ts) is",
        "sha256(id | referenceNumber | constant salt) truncated to 12 hex chars — fully",
        "deterministic, so regenerating reproduces the identical token. If the verify",
        "line changes, either the load identity or the token derivation changed, and",
        "that is a real diff. Do not wave it through.",
        "",
        "This is a CAPTURE, not a specification. It records what the code rendered on",
        "the date above, for the fixtures named below — nothing more. Do not derive a",
        "layout rule from it without checking the code: a stale copy of this file was",
        "read as a page map and taught the wrong one for several sprints.",
      ].join("\n") + "\n";
      fs.writeFileSync(CAPTURE_FILE, stamp + captured.join(""), "utf8");
      console.log("\nwrote " + path.relative(process.cwd(), CAPTURE_FILE) + " — " + dumpedNames.length + " case(s): " + dumpedNames.join(", "));
    }
  }

  console.log(fails ? "\n" + fails + " case(s) FAILING" : "\nALL CASES PASS");
  if (fails) process.exit(1);
})().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
