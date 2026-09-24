/**
 * §21.2 as amended 2026-09-23: one bare number per load.
 *
 * The retired scheme's own tests (documentNumber.test.ts,
 * documentNumberAllocation.test.ts) still pass UNCHANGED, and that is the point
 * of them — every one of their stems is legacy, so if any had moved it would
 * mean an already-issued number had changed meaning. This file covers what is
 * new, and in particular the two properties the bare scheme puts at risk that
 * the suffix scheme did not:
 *
 *   1. CROSS-LOAD BLEED. Under the retired scheme a suffix letter always
 *      followed the stem's digits, so SRL-121485I could not prefix-match a
 *      document on SRL-1214851. A bare core number has no letter, so a naive
 *      startsWith("5001") matches 50012 — a DIFFERENT LOAD's number.
 *
 *   2. THE DISCRIMINATOR. There are four stem shapes in the data, not two, and
 *      only the all-digits one belongs to the amended scheme.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ACCESSORIAL_LETTER,
  CORE_REVISION_SEPARATOR,
  documentNumberFor,
  formatDocumentNumber,
  formatSupplementalNumber,
  generateLoadNumber,
  isBareStem,
  isLegacyStem,
  nextDocumentNumber,
  nextSupplementalNumber,
  parseDocumentRevision,
  parseSupplementalOccurrence,
} from "../../../src/lib/documentNumber";

/** A findMany stub that records the `where` it was handed, so a test can assert
 *  on the QUERY and not only on the answer a hand-fed row set produces. */
function makeClient(rows: any[]) {
  const wheres: any[] = [];
  const model = {
    findMany: async ({ where }: any) => {
      wheres.push(where);
      return rows;
    },
  };
  return {
    wheres,
    load: model,
    rateConfirmation: model,
    invoice: model,
    carrierPay: model,
  };
}

describe("the bare scheme: one number on every core document", () => {
  it("gives the load, BOL, rate con, invoice and settlement the SAME number", () => {
    // This is the whole amendment. Quoting 5001 names the load and every core
    // document on it without having to say which.
    expect(formatDocumentNumber("5001", "BOL")).toBe("5001");
    expect(formatDocumentNumber("5001", "RATE_CONFIRMATION")).toBe("5001");
    expect(formatDocumentNumber("5001", "INVOICE")).toBe("5001");
    expect(formatDocumentNumber("5001", "SETTLEMENT")).toBe("5001");
  });

  it("refuses a bare supplemental without an accessorial type", () => {
    // Returning the bare number would make a supplemental indistinguishable from
    // the invoice it supplements — two documents, one string.
    expect(() => formatDocumentNumber("5001", "SUPPLEMENTAL_INVOICE")).toThrow(
      /needs an accessorial type/i,
    );
  });

  it("separates a core re-issue with a hyphen, never a bare digit", () => {
    // 5001 + "2" would be 50012, which is load 50012's own number. The hyphen
    // cannot occur in a bare load number, so it delimits in both directions.
    expect(formatDocumentNumber("5001", "RATE_CONFIRMATION", 1)).toBe("5001");
    expect(formatDocumentNumber("5001", "RATE_CONFIRMATION", 2)).toBe("5001-2");
    expect(formatDocumentNumber("5001", "RATE_CONFIRMATION", 3)).toBe("5001-3");
    expect(CORE_REVISION_SEPARATOR).toBe("-");
  });
});

describe("legacy stems keep the scheme they were issued under", () => {
  it("treats only an all-digits stem as new", () => {
    expect(isBareStem("5001")).toBe(true);
    expect(isBareStem("SRL-121485")).toBe(false);
    expect(isBareStem("clx9q2z0000abcdefghijklmb")).toBe(false); // email-to-load cuid
    expect(isBareStem("RFQ-9Z3K1")).toBe(false); // shipper portal stamp
    for (const s of ["5001", "SRL-121485", "clx9q2z0000abcdefghijklmb", "RFQ-9Z3K1"]) {
      expect(isLegacyStem(s)).toBe(!isBareStem(s));
    }
  });

  it("still suffixes a cuid stem, because those documents were issued suffixed", () => {
    // The failure this pins: a discriminator that tested for the SRL- prefix
    // classed a cuid stem as NEW and stopped parsing the suffix its documents
    // actually carry — silently, on the loads whose numbering was already odd.
    const cuid = "clx9q2z0000abcdefghijklmb";
    expect(formatDocumentNumber(cuid, "BOL")).toBe(`${cuid}B`);
    expect(parseDocumentRevision(`${cuid}B`, cuid, "BOL")).toBe(1);
    expect(parseDocumentRevision(`${cuid}B2`, cuid, "BOL")).toBe(2);
  });

  it("never rewrites a persisted legacy number at render", () => {
    expect(documentNumberFor("SRL-121485R", { loadNumber: "SRL-121485" }, "RATE_CONFIRMATION")).toBe(
      "SRL-121485R",
    );
    // and a persisted bare number is equally untouched
    expect(documentNumberFor("5001", { loadNumber: "5001" }, "INVOICE")).toBe("5001");
  });
});

describe("parsing cannot confuse one load for another", () => {
  it("reads 5001 as revision 1 and 5001-2 as revision 2", () => {
    expect(parseDocumentRevision("5001", "5001", "INVOICE")).toBe(1);
    expect(parseDocumentRevision("5001-2", "5001", "INVOICE")).toBe(2);
  });

  it("does NOT read load 50012's number as a revision of load 5001", () => {
    // The bleed. 50012 startsWith 5001, and under a naive rule that would make
    // another load's invoice look like this load's revision 2.
    expect(parseDocumentRevision("50012", "5001", "INVOICE")).toBeNull();
    expect(parseDocumentRevision("50012-2", "5001", "INVOICE")).toBeNull();
  });

  it("rejects 5001-1, because revision 1 is the bare number", () => {
    // Two spellings of one revision is how a duplicate gets past a @unique index.
    expect(parseDocumentRevision("5001-1", "5001", "INVOICE")).toBeNull();
  });
});

describe("supplementals carry the accessorial type as a letter", () => {
  it("assigns the letter from the type, and a digit only on a repeat", () => {
    expect(formatSupplementalNumber("5001", "LUMPER")).toBe("5001A");
    expect(formatSupplementalNumber("5001", "LUMPER", 2)).toBe("5001A2");
    expect(formatSupplementalNumber("5001", "DETENTION_PU")).toBe("5001B");
    expect(formatSupplementalNumber("5001", "PALLET_EXCHANGE")).toBe("5001M");
  });

  it("keeps the retired single S on a legacy stem, whatever the type", () => {
    // Legacy supplementals were never type-coded. Issued numbers are not rewritten.
    expect(formatSupplementalNumber("SRL-121485", "LUMPER")).toBe("SRL-121485S");
    expect(formatSupplementalNumber("SRL-121485", "TONU")).toBe("SRL-121485S");
  });

  it("parses an occurrence back off a bare supplemental", () => {
    expect(parseSupplementalOccurrence("5001A", "5001", "LUMPER")).toBe(1);
    expect(parseSupplementalOccurrence("5001A2", "5001", "LUMPER")).toBe(2);
    // a different type's supplemental on the same load is not this one
    expect(parseSupplementalOccurrence("5001B", "5001", "LUMPER")).toBeNull();
  });
});

describe("the letter map is the only place a letter is assigned", () => {
  it("covers every AccessorialType in the schema, and no extras", () => {
    // A type added to the enum without a letter here would otherwise surface as
    // an undefined letter concatenated into a document number.
    const schema = readFileSync(
      join(__dirname, "../../../prisma/schema.prisma"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const block = schema.slice(schema.indexOf("enum AccessorialType"));
    const body = block.slice(block.indexOf("{") + 1, block.indexOf("}"));
    const members = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//"));

    expect(members.length, "expected 12 accessorial types").toBe(12);
    expect(new Set(Object.keys(ACCESSORIAL_LETTER))).toEqual(new Set(members));
  });

  it("assigns 12 distinct letters and skips I", () => {
    const letters = Object.values(ACCESSORIAL_LETTER);
    expect(letters.length).toBe(12);
    expect(new Set(letters).size, "two accessorial types share a letter").toBe(12);
    // I reads as a 1 on a hand-written or faxed reference.
    expect(letters).not.toContain("I");
  });
});

describe("allocation", () => {
  it("scans for the exact number OR the hyphen form, never a bare prefix", async () => {
    // The assertion that matters is on the QUERY. A startsWith("5001") would
    // sweep in load 50012's row, and no amount of parsing afterwards would tell
    // the allocator that it had been handed another load's document.
    const client = makeClient([]);
    await nextDocumentNumber("RATE_CONFIRMATION", "5001", client as any);
    expect(client.wheres).toHaveLength(1);
    expect(client.wheres[0]).toEqual({
      OR: [{ rateConNumber: "5001" }, { rateConNumber: { startsWith: "5001-" } }],
    });
  });

  it("allocates 5001, then 5001-2, then 5001-3", async () => {
    expect(
      await nextDocumentNumber("RATE_CONFIRMATION", "5001", makeClient([]) as any),
    ).toBe("5001");
    expect(
      await nextDocumentNumber(
        "RATE_CONFIRMATION",
        "5001",
        makeClient([{ rateConNumber: "5001" }]) as any,
      ),
    ).toBe("5001-2");
    expect(
      await nextDocumentNumber(
        "RATE_CONFIRMATION",
        "5001",
        makeClient([{ rateConNumber: "5001" }, { rateConNumber: "5001-2" }]) as any,
      ),
    ).toBe("5001-3");
  });

  it("ignores another load's number even if the scan hands it one", async () => {
    // Belt and braces against the query assertion above: if a future change
    // widened the WHERE, the revision must still not jump on a foreign row.
    const client = makeClient([{ rateConNumber: "50012" }, { rateConNumber: "50012-4" }]);
    expect(await nextDocumentNumber("RATE_CONFIRMATION", "5001", client as any)).toBe("5001");
  });

  it("allocates supplementals per type, so a lumper and a TONU do not share", async () => {
    const rows = [{ srlDocNumber: "5001A" }];
    expect(await nextSupplementalNumber("5001", "LUMPER", makeClient(rows) as any)).toBe("5001A2");
    // the same row set for a different type yields that type's first occurrence
    expect(await nextSupplementalNumber("5001", "TONU", makeClient([]) as any)).toBe("5001D");
  });
});

describe("the sequence issues a bare number starting at 5001", () => {
  it("declares START WITH 5001 and returns no prefix", async () => {
    const statements: string[] = [];
    const client = {
      $executeRaw: async (strings: TemplateStringsArray) => {
        statements.push(strings.join(""));
        return 0;
      },
      $queryRaw: async () => [{ nextval: BigInt(5001) }],
    };
    const n = await generateLoadNumber(client as any);

    expect(n).toBe("5001");
    expect(n).not.toMatch(/SRL/);
    // A fresh CI database or a new container must start at 5001, never 121472.
    expect(statements.join(" ")).toContain("START WITH 5001");
    expect(statements.join(" ")).not.toContain("121472");
  });
});
