/**
 * Marco Polo probe — proven against the body production actually returned.
 *
 * v3.8.awg. The chatbot was dead in public and every signal read healthy: 200,
 * flat error rates, a well-formed JSON body with a "reply" field. The broken and
 * the working chatbot are indistinguishable by status code, so only the SENTENCE
 * separates them — which is exactly the Arc 28 rule this encodes.
 *
 * This exercises the REAL evaluate() from the probe harness rather than
 * reproducing its rules here. A proof that reimplements the code it is proving
 * cannot fail when that code is wrong (Arc 16, §13.3 Item 222.5).
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — .mjs harness, no types
import { PROBES, evaluate } from "../../../scripts/probe-public-surfaces.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const probe = (PROBES as any[]).find((p) => p.name.startsWith("Marco Polo"));

/** The exact body production returned while the model was retired. */
const OUTAGE_BODY = JSON.stringify({
  reply: "I'm having trouble connecting right now. Please try the contact form on this page, or call us directly!",
  actions: [{ label: "Contact Us", type: "navigate", url: "/contact.html" }],
});

/** The exact shape production returns now. */
const HEALTHY_BODY = JSON.stringify({
  reply: "Silk Route Logistics arranges transport for Dry Van, Reefer, Dedicated, Expedited and Flatbed across the 48 contiguous states.",
  actions: [],
});

describe("Marco Polo probe", () => {
  it("is declared", () => {
    expect(probe, "the public chatbot must be probed — it was dead for an unknown window").toBeTruthy();
    expect(probe.path).toBe("/chat/public");
  });

  it("CATCHES the real outage body", () => {
    const problems = evaluate(probe, 200, OUTAGE_BODY);
    expect(problems.length, "the probe must reject the body production actually served").toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/OUTAGE SIGNATURE/);
  });

  it("passes the real healthy body", () => {
    expect(evaluate(probe, 200, HEALTHY_BODY)).toEqual([]);
  });

  it("rejects a 200 that answers nothing — the class a status check cannot see", () => {
    // A reply that is well-formed, cheerful, and says nothing. No outage
    // signature, correct status, valid JSON. Only mustMatch catches this.
    const evasive = JSON.stringify({ reply: "Thanks for reaching out! How can I help today?", actions: [] });
    const problems = evaluate(probe, 200, evasive);
    expect(problems.length, "a 200 with no equipment named is not a working chatbot").toBeGreaterThan(0);
  });

  it("keeps watching for the outage sentence specifically", () => {
    // If someone rewrites the fallback copy, this probe stops covering the class
    // it was written for. Pinned so that change is a conscious one.
    expect(probe.mustNotContain).toContain("having trouble connecting");
  });

  it("carries a hint naming the env override", () => {
    // The next retirement should be fixable from the Render dashboard by whoever
    // is woken by the alert, without reading this arc.
    expect(probe.hint).toMatch(/GEMINI_MODEL/);
  });
});
