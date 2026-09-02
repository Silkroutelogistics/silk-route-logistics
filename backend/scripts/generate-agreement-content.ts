/**
 * Regenerates the compiled Broker-Carrier Agreement body from the authored
 * markdown.
 *
 *   npx tsx scripts/generate-agreement-content.ts
 *
 * Edit docs/legal/bca-content-F10.md, run this, commit BOTH. A parity test fails
 * if the committed constant stops matching a fresh parse, so the two cannot
 * drift without CI saying so.
 *
 * It writes a SEPARATE generated module rather than rewriting the constant
 * inside data/agreements.ts. In-place surgery on a file that also holds the
 * Quick Pay body, the version constants and getAgreement is how a generator
 * eventually clobbers something it was never meant to touch -- and the thing it
 * would clobber here is the text carriers sign.
 *
 * Strings are emitted with JSON.stringify: deterministic, and it cannot be
 * defeated by a quote, a backtick or a "${" appearing in legal prose.
 */
import fs from "fs";
import path from "path";
import { parseAgreementFile } from "./agreementContentParser";

const MD = path.resolve(__dirname, "../../docs/legal/bca-content-F10.md");
const OUT = path.resolve(__dirname, "../src/data/brokerCarrierAgreement.generated.ts");

const s = (v: string) => JSON.stringify(v);

function main() {
  const { agreement, version } = parseAgreementFile(MD);

  const sections = agreement.sections.map((sec) => {
    const clauses = sec.clauses.map((c) => "        " + s(c) + ",").join("\n");
    const table = sec.table
      ? "      table: {\n" +
        "        headers: [" + sec.table.headers.map(s).join(", ") + "],\n" +
        "        rows: [\n" +
        sec.table.rows.map((r) => "          [" + r.map(s).join(", ") + "],").join("\n") +
        "\n        ],\n      },\n"
      : "";
    return (
      "    {\n" +
      "      heading: " + s(sec.heading) + ",\n" +
      "      clauses: [\n" + clauses + "\n      ],\n" +
      table +
      "    },"
    );
  }).join("\n");

  const out =
    "// GENERATED FILE -- DO NOT EDIT BY HAND.\n" +
    "//\n" +
    "// Source:    docs/legal/bca-content-F10.md\n" +
    "// Regenerate: npx tsx scripts/generate-agreement-content.ts\n" +
    "//\n" +
    "// Editing this file directly makes the committed text disagree with the\n" +
    "// authored markdown, and the parity test will fail rather than let the two\n" +
    "// drift -- because the drift would be in the words a carrier signs.\n" +
    "import type { LegalSection } from \"./agreements\";\n\n" +
    "/** Reference version carried in the document itself. */\n" +
    "export const BCA_F10_VERSION = " + s(version) + ";\n\n" +
    "export const BCA_F10_TITLE = " + s(agreement.title) + ";\n" +
    "export const BCA_F10_SUBTITLE = " + s(agreement.subtitle) + ";\n" +
    "export const BCA_F10_EFFECTIVE_NOTE = " + s(agreement.effectiveNote) + ";\n\n" +
    "export const BCA_F10_PREAMBLE: string[] = [\n" +
    agreement.preamble.map((p) => "  " + s(p) + ",").join("\n") + "\n];\n\n" +
    "export const BCA_F10_SECTIONS: LegalSection[] = [\n" + sections + "\n];\n";

  fs.writeFileSync(OUT, out);

  const clauses = agreement.sections.reduce((n, x) => n + x.clauses.length, 0);
  const tables = agreement.sections.filter((x) => x.table).length;
  console.log("wrote " + path.relative(process.cwd(), OUT));
  console.log("  version  " + version);
  console.log("  sections " + agreement.sections.length);
  console.log("  clauses  " + clauses);
  console.log("  tables   " + tables);
  console.log("  preamble " + agreement.preamble.length);
}

main();
