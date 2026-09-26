/**
 * §21.2 as amended 2026-09-23: one bare number per load. Corrected 2026-09-26:
 * the invoice adds "I" (121498I), and loads continue at 121498.
 *
 * Since 2026-09-26 the retired suffix scheme governs only stems with no number
 * in them and a legacy load's supplementals; its own tests (documentNumber.test,
 * documentNumberAllocation.test) run on an RFQ- stem. A legacy SRL- load's
 * ISSUED numbers still read as issued; a NEW document for it prints its digits.
 * This file covers what is new, and in particular the two properties the bare
 * scheme puts at risk that the suffix scheme did not:
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
  DOCUMENT_SUFFIX,
  documentDigits,
  documentNumberFor,
  formatDocumentNumber,
  formatSupplementalNumber,
  generateLoadNumber,
  isBareStem,
  isLegacyStem,
  LAST_LEGACY_LOAD_NUMBER,
  LOAD_NUMBER_FLOOR,
  nextDocumentNumber,
  nextSupplementalNumber,
  parseDocumentRevision,
  parseSupplementalOccurrence,
  printedLoadNumber,
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
  it("gives the load, BOL, rate con and settlement the SAME number, and the invoice that number plus I", () => {
    // This is the whole amendment. Quoting 5001 names the load and every core
    // document on it; the invoice's I keeps it from being read as the load.
    expect(formatDocumentNumber("5001", "BOL")).toBe("5001");
    expect(formatDocumentNumber("5001", "RATE_CONFIRMATION")).toBe("5001");
    expect(formatDocumentNumber("5001", "INVOICE")).toBe("5001I");
    expect(formatDocumentNumber("5001", "INVOICE", 2)).toBe("5001I-2");
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

describe("issued numbers and numberless stems keep the scheme they were issued under", () => {
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
    // and a persisted bare number is equally untouched: an invoice issued as
    // 5001, before the I, keeps 5001
    expect(documentNumberFor("5001", { loadNumber: "5001" }, "INVOICE")).toBe("5001");
    expect(documentNumberFor(null, { loadNumber: "5001" }, "INVOICE")).toBe("5001I");
  });
});

describe("a NEW document for a legacy SRL- load prints its digits (§21.2, corrected 2026-09-26)", () => {
  const legacy = { loadNumber: "SRL-121494", referenceNumber: "SRL-121494" };

  it("finds the digits only where there is a number to find", () => {
    expect(documentDigits("SRL-121494")).toBe("121494");
    expect(documentDigits("121498")).toBe("121498");
    for (const none of ["SRL-20260211-0001", "RFQ-9Z3K1", "clx9q2z0000abcdefghijklmb", "SRL-", "", null]) {
      expect(documentDigits(none)).toBeNull();
    }
  });

  it("numbers the BOL, rate con and settlement 121494, and the invoice 121494I", () => {
    expect(formatDocumentNumber("SRL-121494", "BOL")).toBe("121494");
    expect(formatDocumentNumber("SRL-121494", "RATE_CONFIRMATION", 2)).toBe("121494-2");
    expect(formatDocumentNumber("SRL-121494", "SETTLEMENT")).toBe("121494");
    expect(formatDocumentNumber("SRL-121494", "INVOICE")).toBe("121494I");
    expect(documentNumberFor(null, legacy, "INVOICE")).toBe("121494I");
    expect(printedLoadNumber(legacy)).toBe("121494");
    expect(printedLoadNumber({ referenceNumber: "RFQ-9Z3K1" })).toBe("RFQ-9Z3K1");
  });

  it("keeps what was already issued, and a legacy supplemental's S (open decision)", () => {
    expect(documentNumberFor("SRL-121494I", legacy, "INVOICE")).toBe("SRL-121494I");
    expect(parseDocumentRevision("SRL-121494I", "SRL-121494", "INVOICE")).toBe(1);
    expect(parseDocumentRevision("121494I", "SRL-121494", "INVOICE")).toBe(1);
    expect(formatSupplementalNumber("SRL-121494", "TONU")).toBe("SRL-121494S");
  });

  it("allocates in the digits form and does not count retired-form numbers", async () => {
    const client = makeClient([{ srlDocNumber: "SRL-121494I" }, { srlDocNumber: "SRL-121494I2" }]);
    expect(await nextDocumentNumber("INVOICE", "SRL-121494", client as any)).toBe("121494I");
    expect(client.wheres[0]).toEqual({
      OR: [{ srlDocNumber: "121494I" }, { srlDocNumber: { startsWith: "121494I-" } }],
    });
    const issued = makeClient([{ srlDocNumber: "121494I" }]);
    expect(await nextDocumentNumber("INVOICE", "SRL-121494", issued as any)).toBe("121494I-2");
  });

  it("no newly generated core number carries SRL-, and a legacy load's digits never meet a new load's", () => {
    for (const stem of ["121498", "5001", "SRL-121472", "SRL-121494", "SRL-121497"]) {
      for (const kind of ["BOL", "RATE_CONFIRMATION", "INVOICE", "SETTLEMENT"] as const) {
        for (const rev of [1, 2]) expect(formatDocumentNumber(stem, kind, rev)).not.toContain("SRL-");
        expect(documentNumberFor(null, { loadNumber: stem }, kind)).not.toContain("SRL-");
      }
    }
    expect(Number(documentDigits("SRL-121497"))).toBeLessThan(LOAD_NUMBER_FLOOR);
  });
});

describe("parsing cannot confuse one load for another", () => {
  it("reads 5001 as revision 1 and 5001-2 as revision 2, and the invoice off 5001I", () => {
    expect(parseDocumentRevision("5001", "5001", "RATE_CONFIRMATION")).toBe(1);
    expect(parseDocumentRevision("5001-2", "5001", "RATE_CONFIRMATION")).toBe(2);
    expect(parseDocumentRevision("5001I", "5001", "INVOICE")).toBe(1);
    expect(parseDocumentRevision("5001I-2", "5001", "INVOICE")).toBe(2);
    // the load's own number is not its invoice
    expect(parseDocumentRevision("5001", "5001", "INVOICE")).toBeNull();
  });

  it("does NOT read load 50012's number as a revision of load 5001", () => {
    // The bleed. 50012 startsWith 5001, and under a naive rule that would make
    // another load's invoice look like this load's revision 2.
    expect(parseDocumentRevision("50012", "5001", "RATE_CONFIRMATION")).toBeNull();
    expect(parseDocumentRevision("50012-2", "5001", "RATE_CONFIRMATION")).toBeNull();
    expect(parseDocumentRevision("50012I", "5001", "INVOICE")).toBeNull();
    expect(parseDocumentRevision("50012I-2", "5001", "INVOICE")).toBeNull();
  });

  it("rejects 5001-1, because revision 1 is the bare number", () => {
    // Two spellings of one revision is how a duplicate gets past a @unique index.
    expect(parseDocumentRevision("5001-1", "5001", "RATE_CONFIRMATION")).toBeNull();
    expect(parseDocumentRevision("5001I-1", "5001", "INVOICE")).toBeNull();
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
    // I reads as a 1 on a hand-written or faxed reference, and it is the
    // invoice's own letter: a supplemental can never spell 121498I.
    expect(letters).not.toContain("I");
    expect(letters).not.toContain(DOCUMENT_SUFFIX.INVOICE);
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

  it("allocates an invoice as the number plus I, and a re-issue off that", async () => {
    const client = makeClient([]);
    expect(await nextDocumentNumber("INVOICE", "121498", client as any)).toBe("121498I");
    expect(client.wheres[0]).toEqual({
      OR: [{ srlDocNumber: "121498I" }, { srlDocNumber: { startsWith: "121498I-" } }],
    });
    const issued = makeClient([{ srlDocNumber: "121498I" }]);
    expect(await nextDocumentNumber("INVOICE", "121498", issued as any)).toBe("121498I-2");
  });

  it("allocates supplementals per type, so a lumper and a TONU do not share", async () => {
    const rows = [{ srlDocNumber: "5001A" }];
    expect(await nextSupplementalNumber("5001", "LUMPER", makeClient(rows) as any)).toBe("5001A2");
    // the same row set for a different type yields that type's first occurrence
    expect(await nextSupplementalNumber("5001", "TONU", makeClient([]) as any)).toBe("5001D");
  });
});


/**
 * A stand-in for load_number_seq that behaves like Postgres: CREATE ... IF NOT
 * EXISTS only applies START WITH to a sequence that does not exist yet, and
 * nextval advances. It also honours a setval, deliberately: a generator that
 * started lifting the sequence again would be SEEN lifting it here, instead of
 * a fixed-answer mock hiding the move.
 */
function sequence(existing: { last: number; called: boolean } | null) {
  let seq = existing ? { ...existing } : null;
  const statements: string[] = [];
  const client = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ""), "");
      statements.push(sql);
      const create = sql.match(/CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH (\d+)/);
      if (create && !seq) seq = { last: Number(create[1]), called: false };
      const set = sql.match(/setval\('load_number_seq', (\d+)(?:, (true|false))?\)/);
      if (set) seq = { last: Number(set[1]), called: set[2] !== "false" };
      return 0;
    },
    $queryRaw: async () => {
      seq = seq!.called ? { last: seq!.last + 1, called: true } : { last: seq!.last, called: true };
      return [{ nextval: BigInt(seq.last) }];
    },
  };
  return { client, statements, state: () => seq };
}

describe("loads continue from the last legacy number (§21.2, corrected 2026-09-26)", () => {
  it("a fresh database starts at 121498, then 121499", async () => {
    const { client, statements } = sequence(null);
    expect(await generateLoadNumber(client as any)).toBe("121498");
    expect(await generateLoadNumber(client as any)).toBe("121499");
    expect(statements[0]).toContain("START WITH 121498");
    expect(statements.join(" ")).not.toMatch(/\b5000?1\b/);
  });

  it("5001 and 5002 do not change the next number: a sequence left at 5002 is refused, never lifted or issued", async () => {
    const { client, statements, state } = sequence({ last: 5002, called: true });
    await expect(generateLoadNumber(client as any)).rejects.toThrow(/issued 5003, below 121498/);
    await expect(generateLoadNumber(client as any)).rejects.toThrow(/restart-load-number-sequence/);
    expect(statements.some((s) => /setval|ALTER SEQUENCE/i.test(s))).toBe(false);
    expect(state()!.last).toBeLessThan(LOAD_NUMBER_FLOOR);
  });

  it("once the sequence sits at 121497, the next load is 121498 and it is not moved again", async () => {
    const { client, statements } = sequence({ last: 121497, called: true });
    expect(await generateLoadNumber(client as any)).toBe("121498");
    expect(await generateLoadNumber(client as any)).toBe("121499");
    expect(statements.some((s) => /setval|ALTER SEQUENCE/i.test(s))).toBe(false);
  });

  it("the floor is the last legacy number plus one, and it is the only literal the generator carries", async () => {
    expect(LAST_LEGACY_LOAD_NUMBER).toBe(121497);
    expect(LOAD_NUMBER_FLOOR).toBe(121498);
    const src = readFileSync(join(__dirname, "../../../src/lib/documentNumber.ts"), "utf8");
    const at = src.indexOf("export async function generateLoadNumber");
    expect(at, "generateLoadNumber not found").toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(new Set(body.match(/\b\d{4,}\b/g) ?? [])).toEqual(new Set([String(LOAD_NUMBER_FLOOR)]));
    // SQL shapes only: the refusal message names the restart SCRIPT, and a bare
    // /RESTART/ matched that prose rather than a statement.
    expect(body).not.toMatch(/setval\s*\(|ALTER\s+SEQUENCE|RESTART\s+WITH/i);
    const { client } = sequence(null);
    expect(await generateLoadNumber(client as any)).not.toMatch(/SRL/);
  });

  it("the invoice adds I; beyond that only an accessorial supplement takes a letter", () => {
    for (const kind of ["BOL", "RATE_CONFIRMATION", "SETTLEMENT"] as const) {
      expect(formatDocumentNumber("121498", kind)).toBe("121498");
    }
    expect(formatDocumentNumber("121498", "INVOICE")).toBe("121498I");
    expect(formatSupplementalNumber("121498", "TONU")).toBe("121498D");
  });
});
