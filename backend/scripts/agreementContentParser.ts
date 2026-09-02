/**
 * Parses the authored Broker-Carrier Agreement markdown into the LegalAgreement
 * shape the running system compiles.
 *
 * WHY A PARSER RATHER THAN A RUNTIME READ. The markdown is the authoring source
 * and is NOT loaded at runtime: agreementContentHash is computed over the
 * compiled constant, and a hash that depended on file I/O and markdown parsing
 * could move without the words moving. A .md under backend/src/ is also not
 * emitted by tsc, so loading one would need a new cp step in the Render build
 * (§13.3 Item 99). So this runs at authoring time, the constant is committed,
 * and a parity test fails if the two drift.
 *
 * THE FILE IS ONE LINE PER PARAGRAPH. Lines are long and unwrapped, and blank
 * lines separate sections rather than paragraphs, so a non-blank line is a
 * clause. That is what keeps an enumeration -- "(a) ...", "(b) ..." -- as
 * separate drawn blocks rather than fusing it into one justified wall.
 *
 * WHAT IS DELIBERATELY DROPPED, and each is asserted by the parity test rather
 * than left to trust:
 *
 *   "# Signatures" and its body. The body is a bracketed directive,
 *   "[EXECUTION SECTION -- rendered by the execution page template: broker block
 *   pre-filled Wasi Haider, President; carrier fields blank; ESIGN/UETA note.]"
 *   That is an instruction TO the template. Drawing it as a clause would print
 *   a stage direction into a signed agreement.
 *
 *   The trailing entity/tagline footer line. drawFooter already emits the legal
 *   name, MC, DOT, domain and tagline on every page, so keeping it would print
 *   the footer twice, once as body text.
 *
 * Nothing else is dropped, reordered or reworded. A parser that quietly edited
 * a signed instrument would be the worst possible outcome here.
 */
import fs from "fs";
import type { LegalAgreement, LegalSection, LegalTable } from "../src/data/agreements";

export interface ParsedAgreement {
  agreement: Omit<LegalAgreement, "templateName">;
  /** Reference version carried in the document itself, e.g. 2026-09-01-F10. */
  version: string;
}

const ITALIC = /^\*(.+)\*$/;
const H1 = /^#\s+(.+)$/;
const H2 = /^##\s+(.+)$/;
const TABLE_ROW = /^\|(.+)\|$/;
const TABLE_RULE = /^\|[\s|:-]+\|$/;
const REFERENCE = /Reference\s+BCA-([A-Za-z0-9-]+)/;
/**
 * The page footer, repeated as body text at the end of the document.
 * NOT anchored at the end: the line continues past the tagline into
 * "· MC# 1794414 · USDOT# 4526880". An end-anchored pattern matched nothing and
 * the footer rendered as the last clause of Schedule A.
 */
const FOOTER_LINE = /^Silk Route Logistics Inc\..*Where Trust Travels\./;

function cells(line: string): string[] {
  return line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

export function parseAgreementMarkdown(md: string): ParsedAgreement {
  const lines = md.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());

  let title = "";
  let subtitle = "";
  let effectiveNote = "";
  const preamble: string[] = [];
  const sections: LegalSection[] = [];
  let current: LegalSection | null = null;
  let skipping = false; // inside the "# Signatures" block

  const push = (s: LegalSection | null) => { if (s) sections.push(s); };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const h1 = H1.exec(line);
    const h2 = H2.exec(line);

    if (h1) {
      if (!title) { title = h1[1].trim(); continue; }
      // A later level-1 heading is either the execution directive, which the
      // template owns, or a schedule, which is content.
      if (/^signatures$/i.test(h1[1].trim())) { push(current); current = null; skipping = true; continue; }
      push(current);
      current = { heading: h1[1].trim(), clauses: [] };
      skipping = false;
      continue;
    }

    if (h2) {
      push(current);
      current = { heading: h2[1].trim(), clauses: [] };
      skipping = false;
      continue;
    }

    if (skipping) continue;

    const it = ITALIC.exec(line);
    if (it && !current) {
      if (!subtitle) subtitle = it[1].trim();
      else if (!effectiveNote) effectiveNote = it[1].trim();
      continue;
    }

    if (TABLE_RULE.test(line)) continue;
    const tr = TABLE_ROW.exec(line);
    if (tr && current) {
      const row = cells(line);
      if (!current.table) current.table = { headers: row, rows: [] } as LegalTable;
      else current.table.rows.push(row);
      continue;
    }

    if (FOOTER_LINE.test(line)) continue;

    if (current) current.clauses.push(line);
    else preamble.push(line);
  }
  push(current);

  const version = REFERENCE.exec(effectiveNote || subtitle)?.[1] ?? "";
  if (!title) throw new Error("no title (# heading) found");
  if (!version) throw new Error("no `Reference BCA-<version>` found in the document meta lines");
  if (!sections.length) throw new Error("no sections found");

  return { agreement: { title, subtitle, version, effectiveNote, preamble, sections }, version };
}

export function parseAgreementFile(path: string): ParsedAgreement {
  return parseAgreementMarkdown(fs.readFileSync(path, "utf8"));
}
