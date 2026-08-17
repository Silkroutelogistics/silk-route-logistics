/**
 * Fails the build when a document contradicts the ratified accessorial schedule.
 *
 * WHY
 * ---
 * The schedule was ratified twice and drifted anyway, because the numbers lived as
 * prose in a dozen files. At the time this guard was written, production served a
 * Rate Confirmation printing detention $50/hr capped at $250/stop AND an SOP at
 * /dashboard/sops telling the AE it was $75/hr with a $350 TONU. Both were "SRL
 * policy". Only one was.
 *
 * Prose cannot import a constant, so it gets a guard instead: this scans every
 * surface that states accessorial terms to a human — SOP seeds, the Driver Academy
 * curriculum, the signed agreements, public marketing HTML, the chatbot prompts,
 * the app UI — for figures the schedule has retired.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 * ----------------------------------
 * A retired number is not radioactive. A changelog may record that a rate changed;
 * a ban list must name what it bans; a roadmap may price a thing that does not
 * exist yet. Flagging those would train people to ignore the guard, which is worse
 * than not having one. So a hit is exonerated when its line is a comment, sits
 * under a RETIRED / roadmap / not-live marker, or is a test asserting the old value
 * is rejected. Those rules are listed in EXEMPTIONS below and each one is there
 * because a real line in this repo needed it.
 *
 * Run: npx tsx scripts/verify-accessorial-standard.ts
 */
import fs from "fs";
import path from "path";
import {
  RETIRED_FIGURES,
  MONEY_CODE_TERMS,
  DETENTION_RATE_PER_HOUR,
  DETENTION_CAP_PER_STOP,
  LAYOVER_RATE_PER_DAY,
  TONU_AMOUNT,
  ISSUES_MONEY_CODES,
  LUMPER_ADMIN_FEE,
} from "../src/lib/accessorialPolicy";

const ROOT = path.resolve(__dirname, "..", "..");

/** Surfaces that state terms to a human. Not the whole repo — the whole repo has
 *  changelogs in it, and scanning those produces noise, not signal. */
const SCAN: { dir: string; exts: string[] }[] = [
  { dir: "backend/prisma", exts: [".ts"] },
  { dir: "backend/src/data", exts: [".ts"] },
  { dir: "backend/src/lib", exts: [".ts"] },
  { dir: "backend/src/services", exts: [".ts"] },
  { dir: "backend/src/controllers", exts: [".ts"] },
  { dir: "backend/src/templates", exts: [".ts", ".html"] },
  { dir: "frontend/public", exts: [".html"] },
  { dir: "frontend/src/app", exts: [".tsx", ".ts"] },
  { dir: "frontend/src/components", exts: [".tsx", ".ts"] },
];

/** Files whose entire job is to record history or enumerate what is banned. */
const SKIP_FILES = [
  "frontend/src/components/ui/VersionFooter.tsx", // sprint history, by design
  "backend/src/lib/accessorialPolicy.ts",         // defines the retired list
  "backend/scripts/verify-accessorial-standard.ts",
];

/** A hit on a line matching any of these is exonerated. Each earned its place. */
const EXEMPTIONS: { name: string; test: (line: string, prev: string[]) => boolean }[] = [
  {
    name: "comment line",
    // A `//` or `*` line is a note to a developer, not a statement to a carrier.
    test: (l) => /^\s*(\/\/|\*|\/\*|<!--|#)/.test(l),
  },
  {
    name: "explicitly marked retired",
    test: (l) => /RETIRED|retired|superseded|no longer|was \$|struck|deprecated/i.test(l),
  },
  {
    name: "roadmap / not live",
    // e.g. the fuel discount section headed "ROADMAP, NOT LIVE" in a carrier SOP.
    test: (l, prev) =>
      /ROADMAP|NOT LIVE|not offered|planning figure|do not offer/i.test(l) ||
      prev.some((p) => /ROADMAP|NOT LIVE|planning figures|do not offer/i.test(p)),
  },
  {
    name: "negated — says SRL does NOT do this",
    // "SRL issues no money codes (no Comchek, EFS, or Comdata)" is the FIX, not the bug.
    test: (l) => /\bno\b[^.\n]{0,40}(money code|Comchek|EFS|Comdata|fuel card|admin fee)/i.test(l) ||
                 /(issues?|charges?|has)\s+no\b/i.test(l) ||
                 /there is no\b/i.test(l) ||
                 /does not (issue|charge|have)/i.test(l),
  },
  {
    name: "ban-list entry",
    // chatController tells the model what it may not say; it must name it to ban it.
    test: (l) => /never (say|state|claim|offer)|do not (say|state|claim)|banned|prohibited|must not/i.test(l),
  },
];

/**
 * Files that state a ratified figure to a human and must INTERPOLATE it rather
 * than type it. The retired-figure scan above catches yesterday's numbers; this
 * catches tomorrow's — a hardcoded 250 is correct today and silently wrong the
 * day the cap moves, which is exactly how the schedule drifted the first time.
 *
 * Scoped deliberately to the contractual and instructional surfaces. Test
 * fixtures assert against literals on purpose, and the engine that DEFINES the
 * numbers obviously contains them.
 */
const MUST_INTERPOLATE: { file: string; why: string }[] = [
  { file: "backend/src/data/agreements.ts", why: "the carrier signs it" },
  { file: "backend/prisma/seed-sops-enterprise.ts", why: "the AE quotes from it" },
  { file: "backend/prisma/seed-sops.ts", why: "the AE quotes from it" },
];

/** The ratified figures, as they would appear typed into prose. */
const LIVE_FIGURES: { re: RegExp; constant: string }[] = [
  { re: new RegExp(`\\$${DETENTION_RATE_PER_HOUR}\\s*(?:/|\\s+per\\s+)\\s*(?:hr|hour)`, "i"), constant: "DETENTION_RATE_PER_HOUR" },
  { re: new RegExp(`\\$${DETENTION_CAP_PER_STOP}\\s+per\\s+stop|\\$${DETENTION_CAP_PER_STOP}\\s*/\\s*stop`, "i"), constant: "DETENTION_CAP_PER_STOP" },
  { re: new RegExp(`\\$${LAYOVER_RATE_PER_DAY}\\s*(?:/|\\s+per\\s+)\\s*day`, "i"), constant: "LAYOVER_RATE_PER_DAY" },
  { re: new RegExp(`\\$${TONU_AMOUNT}\\s+flat`, "i"), constant: "TONU_AMOUNT" },
];

interface Hit {
  file: string;
  line: number;
  text: string;
  rule: string;
  expected: string;
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".next", "out", "_archived_migrations_2026-05-09"].includes(entry.name)) continue;
      walk(rel, exts, out);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(rel);
    }
  }
  return out;
}

function exempt(line: string, prev: string[]): string | null {
  for (const e of EXEMPTIONS) if (e.test(line, prev)) return e.name;
  return null;
}

function main() {
  const files = SCAN.flatMap((s) => walk(s.dir, s.exts)).filter((f) => !SKIP_FILES.includes(f));
  const hits: Hit[] = [];
  let scanned = 0;

  for (const file of files) {
    let src: string;
    try {
      src = fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    // Cheap pre-filter: most files never mention any of this.
    if (!/detention|layover|TONU|lumper|accessorial|Comchek|Comdata|EFS|fuel card/i.test(src)) continue;
    scanned++;

    const lines = src.split(/\r?\n/);
    lines.forEach((line, i) => {
      const prev = lines.slice(Math.max(0, i - 6), i);

      for (const r of RETIRED_FIGURES) {
        if (!r.pattern.test(line)) continue;
        const why = exempt(line, prev);
        if (why) continue;
        hits.push({ file, line: i + 1, text: line.trim().slice(0, 160), rule: r.was, expected: r.now });
      }

      // Reimbursements are at cost. Any charge layered onto a cost the carrier
      // fronted contradicts that, whatever the amount — so this reads the policy
      // constant rather than pattern-matching one historical figure. Setting a
      // non-zero LUMPER_ADMIN_FEE is a policy decision that would retire this rule.
      if (LUMPER_ADMIN_FEE === 0 &&
          /\b(lumper|reimburs\w*)\b/i.test(line) &&
          /\b\d+%?\s*(admin|handling|processing)\s+fee|\badmin fee of\b/i.test(line)) {
        if (!exempt(line, prev)) {
          hits.push({
            file, line: i + 1, text: line.trim().slice(0, 160),
            rule: "charges a fee on a cost the carrier fronted",
            expected: "reimbursed at cost — LUMPER_ADMIN_FEE is 0",
          });
        }
      }

      // Guarded on the policy flag, not on a hardcoded assumption. If SRL ever does
      // issue a payment instrument, this check must stop firing — flipping the
      // constant is then the whole change, which is the point of the constant.
      //
      // Money-code terms only matter where the sentence is about SRL PROVIDING an
      // instrument. The first version of this gate accepted any line containing
      // "pay", which flagged a coercion-rule quiz whose wrong answer was "using a
      // fuel card" — the word appeared, the claim did not. Require an issuance or
      // reimbursement verb so the guard reads intent, not vocabulary.
      if (!ISSUES_MONEY_CODES &&
          /lumper|reimburs|advance|front(s|ed|ing)? the|original receipt|money code|issue[sd]?\b|provide[sd]?\b|supply|give[ns]?\b/i.test(line)) {
        for (const term of MONEY_CODE_TERMS) {
          if (!new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)) continue;
          const why = exempt(line, prev);
          if (why) continue;
          hits.push({
            file, line: i + 1, text: line.trim().slice(0, 160),
            rule: `implies SRL issues a payment instrument (${term})`,
            expected: "SRL issues no money codes; carrier fronts, SRL reimburses on the original receipt",
          });
        }
      }
    });
  }

  // Second pass: the contractual and instructional surfaces must interpolate a
  // ratified figure, not type it. A literal here is right today and stale the
  // moment policy moves — the failure mode this whole module exists to end.
  for (const target of MUST_INTERPOLATE) {
    let src: string;
    try {
      src = fs.readFileSync(path.join(ROOT, target.file), "utf8");
    } catch {
      continue;
    }
    src.split(/\r?\n/).forEach((line, i) => {
      // A line that already interpolates is fine even though it contains the digits.
      if (/\$\{/.test(line)) return;
      const prev = src.split(/\r?\n/).slice(Math.max(0, i - 6), i);
      for (const f of LIVE_FIGURES) {
        if (!f.re.test(line)) continue;
        if (exempt(line, prev)) continue;
        hits.push({
          file: target.file, line: i + 1, text: line.trim().slice(0, 160),
          rule: `hardcodes a ratified figure (${target.why})`,
          expected: `interpolate ${f.constant} from lib/accessorialPolicy`,
        });
      }
    });
  }

  console.log(`\n  ratified: detention $${DETENTION_RATE_PER_HOUR}/hr, cap $${DETENTION_CAP_PER_STOP}/stop, ` +
              `layover $${LAYOVER_RATE_PER_DAY}/day, TONU $${TONU_AMOUNT} flat, lumper at cost\n`);
  console.log(`  ${files.length} files in scope, ${scanned} mention accessorial terms\n`);

  if (hits.length === 0) {
    console.log("  no surface contradicts the ratified schedule.\n");
    console.log("  ACCESSORIAL STANDARD HOLDS\n");
    return;
  }

  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}`);
    console.log(`     ${h.text}`);
    console.log(`     states: ${h.rule}`);
    console.log(`     ratified: ${h.expected}\n`);
  }
  console.log(`  ${hits.length} contradiction(s) of the ratified schedule.`);
  console.log(`  Fix the surface, or if the schedule itself changed, change`);
  console.log(`  backend/src/lib/accessorialPolicy.ts and let every surface follow.\n`);
  process.exitCode = 1;
}

main();
