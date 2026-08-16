// Locks the document-numbering scheme: suffix on the load stem, one derivation
// rule, and — the detail most likely to break in production — atomic revision
// allocation when two AEs re-issue the same document at the same moment.
//
// These tests inject a fake Prisma client rather than leaning on the shared
// __tests__/setup.ts mock. Two reasons: setup.ts has no `rateConfirmation`
// model mock, and a fake client lets the concurrency tests script exactly which
// call throws P2002 and when — which is the whole point of the exercise.
import { describe, it, expect } from "vitest";
import {
  DOCUMENT_SUFFIX,
  resolveLoadStem,
  formatDocumentNumber,
  parseDocumentRevision,
  documentNumberFor,
  nextDocumentNumber,
  withDocumentNumber,
} from "../../../src/lib/documentNumber";

/** Minimal stand-in for the one model method nextDocumentNumber calls. */
function fakeClient(model: string, field: string, taken: string[]) {
  return {
    [model]: {
      findMany: async ({ where }: any) => {
        const prefix = where[field].startsWith as string;
        return taken.filter((v) => v.startsWith(prefix)).map((v) => ({ [field]: v }));
      },
    },
  } as any;
}

function p2002(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

describe("suffix scheme", () => {
  it("assigns one letter per document kind, with P for pay so it cannot collide with S", () => {
    expect(DOCUMENT_SUFFIX).toEqual({
      BOL: "B",
      RATE_CONFIRMATION: "R",
      INVOICE: "I",
      SUPPLEMENTAL_INVOICE: "S",
      SETTLEMENT: "P",
    });
  });

  it("suffixes the stem so every document for one load sorts together", () => {
    const stem = "SRL-121485";
    expect(formatDocumentNumber(stem, "BOL")).toBe("SRL-121485B");
    expect(formatDocumentNumber(stem, "RATE_CONFIRMATION")).toBe("SRL-121485R");
    expect(formatDocumentNumber(stem, "INVOICE")).toBe("SRL-121485I");
    expect(formatDocumentNumber(stem, "SUPPLEMENTAL_INVOICE")).toBe("SRL-121485S");
    expect(formatDocumentNumber(stem, "SETTLEMENT")).toBe("SRL-121485P");

    // The property that motivates suffixing over prefixing.
    const sorted = [
      formatDocumentNumber(stem, "INVOICE"),
      formatDocumentNumber("SRL-121486", "BOL"),
      formatDocumentNumber(stem, "BOL"),
    ].sort();
    expect(sorted).toEqual(["SRL-121485B", "SRL-121485I", "SRL-121486B"]);
  });

  it("omits the digit on revision 1 and appends it from revision 2 up", () => {
    expect(formatDocumentNumber("SRL-121485", "RATE_CONFIRMATION", 1)).toBe("SRL-121485R");
    expect(formatDocumentNumber("SRL-121485", "RATE_CONFIRMATION", 2)).toBe("SRL-121485R2");
    expect(formatDocumentNumber("SRL-121485", "RATE_CONFIRMATION", 10)).toBe("SRL-121485R10");
  });

  it("rejects a nonsense revision instead of emitting a malformed number", () => {
    expect(() => formatDocumentNumber("SRL-1", "BOL", 0)).toThrow(/revision/);
    expect(() => formatDocumentNumber("SRL-1", "BOL", -2)).toThrow(/revision/);
    expect(() => formatDocumentNumber("SRL-1", "BOL", 1.5)).toThrow(/revision/);
  });
});

describe("resolveLoadStem — the one derivation rule", () => {
  it("prefers loadNumber, which only the sequence writes", () => {
    // referenceNumber is @unique @default(cuid()) and historically absorbed junk
    // from creators that skipped the generator, so it is the fallback, not the
    // source of truth.
    expect(resolveLoadStem({ loadNumber: "SRL-121485", referenceNumber: "clx9q2z0000abcdefghij" }))
      .toBe("SRL-121485");
  });

  it("falls back to referenceNumber for loads predating the numbering fix", () => {
    expect(resolveLoadStem({ loadNumber: null, referenceNumber: "SRL-121400" })).toBe("SRL-121400");
  });

  it("returns null when there is no stem at all", () => {
    expect(resolveLoadStem({})).toBeNull();
    expect(resolveLoadStem(null)).toBeNull();
    expect(resolveLoadStem({ loadNumber: "   ", referenceNumber: "" })).toBeNull();
  });
});

describe("documentNumberFor — what a renderer prints", () => {
  it("prints the persisted number, so regenerating reproduces it exactly", () => {
    // The persisted value wins even when it disagrees with what the stem would
    // derive. That is the entire reason these are persisted: a re-issued RC
    // stays R2 forever, and a later render must not quietly demote it to R.
    expect(documentNumberFor("SRL-121485R2", { loadNumber: "SRL-121485" }, "RATE_CONFIRMATION"))
      .toBe("SRL-121485R2");
  });

  it("derives revision 1 for documents predating the scheme", () => {
    expect(documentNumberFor(null, { loadNumber: "SRL-121485" }, "INVOICE")).toBe("SRL-121485I");
  });

  it("returns null rather than a half-formed number when the load has no stem", () => {
    expect(documentNumberFor(null, {}, "BOL")).toBeNull();
  });
});

describe("parseDocumentRevision", () => {
  it("reads the revision back out", () => {
    expect(parseDocumentRevision("SRL-121485R", "SRL-121485", "RATE_CONFIRMATION")).toBe(1);
    expect(parseDocumentRevision("SRL-121485R3", "SRL-121485", "RATE_CONFIRMATION")).toBe(3);
  });

  it("does not confuse one kind's numbers for another's", () => {
    // INVOICE and SUPPLEMENTAL_INVOICE share a column; only the letter separates
    // them, so this is the guard that keeps …S out of the …I sequence.
    expect(parseDocumentRevision("SRL-121485S", "SRL-121485", "INVOICE")).toBeNull();
    expect(parseDocumentRevision("SRL-121485I", "SRL-121485", "SUPPLEMENTAL_INVOICE")).toBeNull();
  });

  it("does not match a different load's number", () => {
    expect(parseDocumentRevision("SRL-121486R", "SRL-121485", "RATE_CONFIRMATION")).toBeNull();
  });

  it("parses against a known stem, so a cuid stem containing letters is unambiguous", () => {
    // A legacy load's stem can be a 25-char cuid, so a general regex could not
    // tell the suffix letter from the stem's own last character.
    const cuid = "clx9q2z0000abcdefghijklmb";
    expect(parseDocumentRevision(`${cuid}B`, cuid, "BOL")).toBe(1);
    expect(parseDocumentRevision(`${cuid}B2`, cuid, "BOL")).toBe(2);
  });

  it("rejects a malformed tail rather than guessing", () => {
    expect(parseDocumentRevision("SRL-121485Rx", "SRL-121485", "RATE_CONFIRMATION")).toBeNull();
    expect(parseDocumentRevision("SRL-121485R0", "SRL-121485", "RATE_CONFIRMATION")).toBeNull();
    expect(parseDocumentRevision(null, "SRL-121485", "RATE_CONFIRMATION")).toBeNull();
  });
});

describe("nextDocumentNumber", () => {
  it("issues revision 1 when nothing exists yet", async () => {
    const c = fakeClient("rateConfirmation", "rateConNumber", []);
    expect(await nextDocumentNumber("RATE_CONFIRMATION", "SRL-121485", c)).toBe("SRL-121485R");
  });

  it("takes the next revision above the highest issued", async () => {
    const c = fakeClient("rateConfirmation", "rateConNumber", ["SRL-121485R", "SRL-121485R2"]);
    expect(await nextDocumentNumber("RATE_CONFIRMATION", "SRL-121485", c)).toBe("SRL-121485R3");
  });

  it("never reuses a gap left by a deleted revision", async () => {
    // R2 is missing, but reissuing it would make two documents share a number in
    // the record — the exact thing a dispute cannot tolerate.
    const c = fakeClient("rateConfirmation", "rateConNumber", ["SRL-121485R", "SRL-121485R3"]);
    expect(await nextDocumentNumber("RATE_CONFIRMATION", "SRL-121485", c)).toBe("SRL-121485R4");
  });

  it("counts past revision 9 numerically, not lexically", async () => {
    const c = fakeClient("rateConfirmation", "rateConNumber", ["SRL-121485R9", "SRL-121485R10"]);
    expect(await nextDocumentNumber("RATE_CONFIRMATION", "SRL-121485", c)).toBe("SRL-121485R11");
  });

  it("keeps the base invoice and the supplemental in separate sequences", async () => {
    // Both live in Invoice.srlDocNumber. Scanning the stem alone would let one
    // advance the other's revision counter.
    const taken = ["SRL-121485I", "SRL-121485I2", "SRL-121485S"];
    const c = fakeClient("invoice", "srlDocNumber", taken);
    expect(await nextDocumentNumber("INVOICE", "SRL-121485", c)).toBe("SRL-121485I3");
    expect(await nextDocumentNumber("SUPPLEMENTAL_INVOICE", "SRL-121485", c)).toBe("SRL-121485S2");
  });

  it("does not bleed across stems that share a numeric prefix", async () => {
    // "SRL-121485I" must not prefix-match a document on stem "SRL-1214851".
    const c = fakeClient("invoice", "srlDocNumber", ["SRL-1214851I", "SRL-1214851I2"]);
    expect(await nextDocumentNumber("INVOICE", "SRL-121485", c)).toBe("SRL-121485I");
  });
});

describe("withDocumentNumber — two AEs re-issuing at the same instant", () => {
  it("allocates and hands the number to the builder", async () => {
    const c = fakeClient("rateConfirmation", "rateConNumber", ["SRL-121485R"]);
    const got = await withDocumentNumber("RATE_CONFIRMATION", "SRL-121485", async (n) => n, 6, c);
    expect(got).toBe("SRL-121485R2");
  });

  it("gives the loser of a race the NEXT revision instead of colliding", async () => {
    // Both AEs scan, both see only R, both compute R2. One write lands; the
    // other is rejected by the @unique column with P2002. The loser must rescan
    // — now seeing R2 taken — and take R3. Numbers are never reused, and neither
    // AE gets an error.
    const taken = ["SRL-121485R"];
    const client = fakeClient("rateConfirmation", "rateConNumber", taken);

    // Simulates the winner's row landing between the loser's scan and write.
    let firstAttempt = true;
    const build = async (n: string) => {
      if (firstAttempt) {
        firstAttempt = false;
        taken.push("SRL-121485R2"); // the winner committed
        throw p2002();
      }
      taken.push(n);
      return n;
    };

    const loser = await withDocumentNumber("RATE_CONFIRMATION", "SRL-121485", build, 6, client);
    expect(loser).toBe("SRL-121485R3");
    expect(taken).toEqual(["SRL-121485R", "SRL-121485R2", "SRL-121485R3"]);
  });

  it("keeps climbing when several writers pile up", async () => {
    const taken: string[] = [];
    const client = fakeClient("rateConfirmation", "rateConNumber", taken);
    let losses = 3;
    const build = async (n: string) => {
      if (losses > 0) {
        losses--;
        taken.push(n); // someone else took the number we just computed
        throw p2002();
      }
      taken.push(n);
      return n;
    };
    expect(await withDocumentNumber("RATE_CONFIRMATION", "SRL-121485", build, 6, client))
      .toBe("SRL-121485R4");
  });

  it("issues distinct numbers to concurrent callers sharing one store", async () => {
    // The end-to-end property: N racing re-issues produce N distinct numbers.
    const taken: string[] = [];
    const client = fakeClient("rateConfirmation", "rateConNumber", taken);
    const build = async (n: string) => {
      if (taken.includes(n)) throw p2002();
      taken.push(n);
      return n;
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        withDocumentNumber("RATE_CONFIRMATION", "SRL-121485", build, 10, client),
      ),
    );
    expect(new Set(results).size).toBe(5);
    expect([...results].sort()).toEqual(
      ["SRL-121485R", "SRL-121485R2", "SRL-121485R3", "SRL-121485R4", "SRL-121485R5"].sort(),
    );
  });

  it("rethrows a non-P2002 error immediately instead of burning retries", async () => {
    const c = fakeClient("rateConfirmation", "rateConNumber", []);
    let calls = 0;
    const build = async () => {
      calls++;
      throw new Error("connection reset");
    };
    await expect(
      withDocumentNumber("RATE_CONFIRMATION", "SRL-121485", build, 6, c),
    ).rejects.toThrow("connection reset");
    expect(calls).toBe(1);
  });

  it("gives up rather than returning an unnumbered document", async () => {
    const c = fakeClient("rateConfirmation", "rateConNumber", []);
    const build = async () => { throw p2002(); };
    await expect(
      withDocumentNumber("RATE_CONFIRMATION", "SRL-121485", build, 3, c),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
