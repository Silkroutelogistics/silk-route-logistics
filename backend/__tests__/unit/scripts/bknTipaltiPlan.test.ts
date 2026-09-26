/**
 * RECONCILE step 3: the plan the production write applies. Each target is held
 * to the ruling (step 5 totals) and to the committed record of what was
 * delivered (docs/sent-invoices/bkn-2026-09/README.md), so a mistyped hash,
 * amount or date fails here rather than in production.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  TARGETS, DELIVERED_AT, ISSUED_AT, DUE_DATE, BILLING, lineDescription, totalsFor, checkPackets, sha256,
} from "../../../scripts/_bknTipaltiPlan";

const README = fs.readFileSync(path.resolve(__dirname, "../../../../docs/sent-invoices/bkn-2026-09/README.md"), "utf8");
const fmt = (d: Date, timeZone: string, opts: Intl.DateTimeFormatOptions) => d.toLocaleString("en-US", { timeZone, ...opts });

describe("the Beekeepers reconcile plan", () => {
  it("totals are the ruling's: 121492I 250, 121494I 2,550, 121495I 700, 121496I 250", () => {
    expect(Object.fromEntries(TARGETS.map((t) => [t.number, totalsFor(t).totalAmount]))).toEqual({
      "121492I": 250, "121494I": 2550, "121495I": 700, "121496I": 250,
    });
    expect(totalsFor(TARGETS[1])).toEqual({ amount: 2550, totalAmount: 2550, lineHaulAmount: 2550, fuelSurchargeAmount: 0, accessorialsAmount: 0 });
    expect(totalsFor(TARGETS[3])).toEqual({ amount: 250, totalAmount: 250, lineHaulAmount: 0, fuelSurchargeAmount: 0, accessorialsAmount: 250 });
  });

  it("each packet's name, number and SHA-256 are the ones the committed README records", () => {
    for (const t of TARGETS) {
      const row = README.split(/\r?\n/).find((l) => l.includes(`\`${t.packet}\``));
      expect(row, t.packet).toBeDefined();
      expect(row).toContain(`| ${t.number} | ${t.loadNumber} |`);
      expect(row).toContain(`\`${t.sha256}\``);
    }
  });

  it("each invoice number is its load's digits plus I", () => {
    for (const t of TARGETS) expect(t.number).toBe(`${t.loadNumber.replace(/^SRL-/, "")}I`);
  });

  it("every TONU line names its ledger row, and the lines print title over detail", () => {
    expect(TARGETS.filter((t) => t.lines.some((l) => l.type === "ACCESSORIAL")).map((t) => t.lines[0].accessorialId))
      .toEqual(["cmuiare9v0001w0ls934lhjsn", "cmugbqnog001dma2drryhcgxu"]);
    expect(lineDescription(TARGETS[1].lines[1])).toBe("Fuel\nIncluded in line haul");
  });

  it("delivered 17:00 in Toronto on Sep 25; issued Sep 25 and due Oct 25 as the renderer prints them (UTC)", () => {
    expect(fmt(DELIVERED_AT, "America/Toronto", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" })).toBe("Sep 25, 2026, 17:00");
    expect(fmt(ISSUED_AT, "UTC", { dateStyle: "medium" })).toBe("Sep 25, 2026");
    expect(fmt(DUE_DATE, "UTC", { dateStyle: "medium" })).toBe("Oct 25, 2026");
  });

  it("the billing address is the ruling's, with no email", () => {
    expect(BILLING).toEqual({ billingContactName: "Accounts Payable", billingAddress: "440 N Barranca Ave #9223", billingCity: "Covina", billingState: "CA", billingZip: "91723" });
  });

  it("checkPackets passes exactly the bytes whose SHA-256 is recorded, and names every other", () => {
    const good = Buffer.from("delivered");
    const t = { ...TARGETS[0], sha256: sha256(good) };
    expect(checkPackets(() => good, [t])).toEqual([]);
    expect(checkPackets(() => Buffer.from("delivered."), [t])).toEqual([expect.stringContaining("is not the delivered")]);
    expect(checkPackets(() => { throw new Error("ENOENT"); })).toEqual(TARGETS.map((x) => `${x.packet}: not readable`));
  });

  // The packets carry the bank account and are gitignored, so this runs only where they are.
  const DIR = path.resolve(__dirname, "../../../../docs/sent-invoices/bkn-2026-09");
  it.skipIf(!fs.existsSync(path.join(DIR, TARGETS[0].packet)))("where the packets are present, they are the delivered ones", () => {
    expect(checkPackets((n) => fs.readFileSync(path.join(DIR, n)))).toEqual([]);
  });
});
