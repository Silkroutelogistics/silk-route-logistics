/**
 * The preview and the PUT must reach the same verdict, and they build their
 * facts SEPARATELY.
 *
 * uncancelPreviewHandler exists so an AE is told a reversal will refuse BEFORE
 * they type a reason rather than after. That promise holds only while both
 * sites hand assessUncancel the same shape. They are two hand-written queries
 * in two files, so nothing but this test stops one gaining a field the other
 * lacks -- and the failure would be silent and asymmetric: the dialog would say
 * yes and the PUT would say no.
 *
 * Finding B made that concrete. The policy now judges a tender by its own
 * createdAt, so a call site still selecting only { id, status } hands over
 * `undefined` and the comparison throws or silently misjudges.
 *
 * SOURCE-LEVEL rather than behavioural because the two call sites are inside a
 * controller and a service that each open their own Prisma queries; driving
 * them for real needs a database, and this arc writes none. What it can prove
 * is that neither query drops a field the policy reads -- which is the whole
 * drift.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(BACKEND, rel), "utf8");

/** Comments stripped: a field named in prose is not a field selected. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const SITES = [
  { label: "PUT (services/uncancelLoad.ts)", rel: "src/services/uncancelLoad.ts", fn: "export async function uncancelLoad(" },
  { label: "preview (controllers/loadController.ts)", rel: "src/controllers/loadController.ts", fn: "export async function uncancelPreviewHandler(" },
];

/** Every field assessUncancel reads off a tender. Add one here when the policy gains one. */
const TENDER_FIELDS = ["id", "status", "createdAt", "statusChangedAt"];

describe("the un-cancel preview and the PUT build the same facts", () => {
  for (const site of SITES) {
    const src = strip(read(site.rel));
    const start = src.indexOf(site.fn);
    const body = start < 0 ? "" : src.slice(start, start + 4000);

    it(`finds ${site.label} (vacuity tripwire)`, () => {
      expect(start, `${site.fn} not found in ${site.rel} — the scanner is broken, not the file`).toBeGreaterThan(-1);
      expect(body).toContain("assessUncancel(");
      expect(body).toContain("loadTender.findMany");
    });

    for (const field of TENDER_FIELDS) {
      it(`${site.label} selects and forwards tender.${field}`, () => {
        expect(body, `${site.rel} does not SELECT ${field} — assessUncancel would read undefined`).toContain(`${field}: true`);
        expect(body, `${site.rel} selects ${field} but never forwards it into facts.tenders`).toMatch(
          new RegExp(`${field}\\s*[:,}]`),
        );
      });
    }
  }

  it("both sites forward the same tender field set, in the same shape", () => {
    const shapes = SITES.map((s) => {
      const src = strip(read(s.rel));
      const body = src.slice(src.indexOf(s.fn));
      const m = body.match(/tenders:\s*tenders\.map\(\(t\) => \(\{([^}]*)\}\)\)/);
      expect(m, `no tenders.map(...) in ${s.rel}`).not.toBeNull();
      return m![1].split(",").map((x) => x.split(":")[0].trim()).filter(Boolean).sort().join(",");
    });
    expect(shapes[0], "the preview and the PUT forward different tender fields").toBe(shapes[1]);
    for (const field of TENDER_FIELDS) expect(shapes[0]).toContain(field);
  });
});
