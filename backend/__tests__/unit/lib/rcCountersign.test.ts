/**
 * The Rate Confirmation countersignature carries the company's identity from
 * ONE source, and takes its instant from the caller.
 *
 * Both properties are load-bearing rather than stylistic. The identity source
 * is what stops a rate confirmation and a Broker-Carrier Agreement naming
 * different officers of the same company. The caller-supplied instant is what
 * lets issuance write the SAME moment to the row that it renders into the
 * bytes: a clock read inside this function would be a second, later instant,
 * and the row and the document would then disagree about when SRL bound itself.
 *
 * THE IDENTITY CASE IS STRUCTURAL AND HAS TO BE. Comparing the returned name
 * against SIGNATORY_NAME cannot detect a hardcoded "Wasi Haider", because the
 * constant holds exactly that string today. Such an assertion passes on the
 * defect it is written against and starts failing only on the day the officer
 * changes, which is the day it matters most. So it reads the source as well.
 *
 * Adversarially verified at authoring: hardcoding the name turns the structural
 * case red; reading the clock inside instead of taking the parameter turns the
 * instant case red.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buildRcCountersign } from "../../../src/lib/rcCountersign";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../../../src/config/authority";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../../src/lib/rcCountersign.ts"), "utf8");
/** Comment lines stripped: every identifier below is also named in the prose. */
const code = SRC.split("\n")
  .map((l) => l.replace("\r", ""))
  .filter((l) => {
    const t = l.trim();
    return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
  })
  .join("\n");

describe("the Rate Confirmation countersignature", () => {
  it("names the officer from config/authority, never a literal", () => {
    const cs = buildRcCountersign(new Date("2026-09-22T14:31:07.000Z"));
    expect(cs.name).toBe(SIGNATORY_NAME);
    expect(cs.title).toBe(SIGNATORY_TITLE);
    // The half the value comparison above structurally cannot see.
    expect(code, "the name must come from the constant").toContain("name: SIGNATORY_NAME");
    expect(code, "the title must come from the constant").toContain("title: SIGNATORY_TITLE");
    expect(code, "no hardcoded officer name").not.toContain('name: "');
    expect(code, "no hardcoded officer title").not.toContain('title: "');
  });

  it("takes the caller's instant, so the row and the bytes agree", () => {
    const at = new Date("2026-09-22T14:31:07.000Z");
    expect(buildRcCountersign(at).at).toBe(at);
    expect(code, "no clock read inside the builder").not.toContain("new Date()");
  });

  it("is the same identity the agreements countersign with", () => {
    // A carrier holding a BCA and a rate confirmation must not find two
    // different people binding Silk Route Logistics Inc.
    expect(buildRcCountersign(new Date()).name).toBe(SIGNATORY_NAME);
  });

  it("vacuity tripwire: the source was read and the constants are real", () => {
    expect(code).toContain("export function buildRcCountersign");
    expect(typeof SIGNATORY_NAME).toBe("string");
    expect(SIGNATORY_NAME.length).toBeGreaterThan(0);
    expect(SIGNATORY_TITLE.length).toBeGreaterThan(0);
  });
});
