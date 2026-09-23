/**
 * C7a — the settlement payload carries the execution facts, and none of the
 * evidence behind them.
 *
 * A settlement screen answers "is this payable". That needs the rate
 * confirmation's number and whether it is signed, and it needs the carrier's
 * acceptance, because those two come apart: a load can be signed and never
 * accepted, or accepted and never signed. It does NOT need the signer, the IP,
 * the content hash, or either URL — that is the load-detail surface (bgt/bgv),
 * and putting it here would spread the same evidence across two screens that
 * can then disagree about it.
 *
 * Read from SOURCE rather than by driving the handler: the property is which
 * fields the query asks for, and a mocked Prisma returns whatever it is told
 * regardless of the select, so driving it would prove the mock (§19 SP16).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "../../../src/controllers/settlementController.ts");
const raw = fs.readFileSync(SRC, "utf8");

/** Line comments then block comments — a "//" inside a block must not eat the file. */
const src = raw
  .split(/\r?\n/)
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of getSettlementById, far enough to cover its include block. */
function detailQuery(): string {
  const i = src.indexOf("export async function getSettlementById");
  if (i < 0) throw new Error("getSettlementById not found");
  return src.slice(i, i + 2500);
}

describe("the settlement detail carries the execution facts", () => {
  it("includes the rate-confirmation relation", () => {
    // carrierPays uses `include`, so every CarrierPay SCALAR already arrived —
    // including rateConfirmationId. The RELATION did not, so `signed` was not
    // in the payload and the page could not say whether the document behind
    // the money was ever executed.
    expect(detailQuery()).toMatch(/rateConfirmation:\s*\{/);
  });

  it("selects the number and the signed state", () => {
    const q = detailQuery();
    expect(q).toMatch(/rateConNumber:\s*true/);
    expect(q).toMatch(/signed:\s*true/);
    expect(q).toMatch(/signedAt:\s*true/);
  });

  it("selects the carrier's acceptance, which is a different fact from the signature", () => {
    const q = detailQuery();
    expect(q).toMatch(/carrierAcceptedAt:\s*true/);
    expect(q).toMatch(/carrierAcceptedVia:\s*true/);
  });
});

describe("the evidence stays on the surface built for it", () => {
  it("the settlement query asks for no signer, no IP, no hash and no URL", () => {
    const q = detailQuery();
    for (const leak of ["signerName", "signerIp", "signerUserAgent", "contentHash", "signedUrl", "pdfUrl"]) {
      expect(q, `${leak} does not belong on a settlement screen`).not.toContain(leak);
    }
  });

  it("no settlement route selects a storage key anywhere", () => {
    // Widened past the one query on purpose: the rule is about the SURFACE,
    // not about one handler that happens to be written correctly today. bgu
    // found exactly this — the sibling endpoint leaked the key the detail had
    // been fixed to withhold.
    for (const leak of ["signedUrl", "signerIp"]) {
      expect(src, `${leak} must not appear in a settlement route`).not.toContain(leak);
    }
  });

  it("reads a real file — the tripwire, so a broken path cannot pass vacuously", () => {
    expect(raw.length).toBeGreaterThan(3000);
    expect(src).toContain("export async function getSettlementById");
    expect(detailQuery()).toContain("carrierPays");
  });
});
