/**
 * AI model guard — no literal model string outside the config constant.
 *
 * v3.8.awf. `gemini-2.0-flash` was hardcoded in four files. Google retired it,
 * all four broke simultaneously, and the most visible one — Marco Polo on the
 * public homepage — failed GRACEFULLY: it caught the error and replied "I'm
 * having trouble connecting right now", which reads as a transient blip. Nothing
 * surfaced it. The window is unknown.
 *
 * The defect was not that a model was retired; that is normal and will happen
 * again. The defect was that four files had to be found to notice, and that the
 * failure looked like weather.
 *
 * This guard is a source check: it proves no literal remains, not that the model
 * works. The monitor probe (Marco Polo answering a real question) and the health
 * capability field are what prove function. Presence is not function
 * (§19 Sub-pattern 16).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..", "..", "src");

/**
 * A model SELECTION — `model: "…"` as passed to an SDK, or `models/<name>` in a
 * REST URL. Both are the shape that pins a call site to a version.
 *
 * Deliberately NOT "any model name anywhere". The first version matched bare
 * literals and immediately flagged `feedbackCollector.ts`'s TOKEN_COST_MAP —
 * a per-1k-token price table whose KEYS are model names. Those are data, not
 * call sites; pinning them is correct, and a guard that reports them is one
 * people learn to skip.
 */
const MODEL_LITERAL = /\bmodel\s*:\s*["'`](?:gemini|gpt|claude)-[0-9][^"'`]*["'`]|models\/(?:gemini|gpt|claude)-[0-9][^"'`\s:]*/g;

/** The one file allowed to name a model. */
const CONFIG = "config/ai.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("AI model configuration", () => {
  it("no source file outside config/ai.ts names a model literal", () => {
    const offenders: string[] = [];
    for (const abs of walk(SRC)) {
      const rel = path.relative(SRC, abs).replace(/\\/g, "/");
      if (rel === CONFIG) continue;
      const src = fs.readFileSync(abs, "utf8");
      for (const m of src.matchAll(MODEL_LITERAL)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line} → ${m[0]}`);
      }
    }
    expect(
      offenders,
      `model names belong in config/ai.ts — four hardcoded copies is how the last retirement went unnoticed:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("the constant is env-overridable, so the next retirement is config not code", async () => {
    const src = fs.readFileSync(path.join(SRC, CONFIG), "utf8");
    // The env var is the whole point: a retired model should be fixable in
    // minutes from the Render dashboard, not on the next deploy.
    expect(src).toMatch(/process\.env\.GEMINI_MODEL/);
  });

  it("every generative call site imports from the config", () => {
    // Named individually: a failure should say which surface went back to a
    // literal, not that something somewhere changed.
    const sites = [
      "services/coiReaderService.ts",
      "controllers/chatController.ts",
      "controllers/shipperPortalController.ts",
    ];
    for (const rel of sites) {
      const src = fs.readFileSync(path.join(SRC, rel), "utf8");
      expect(src, `${rel} must import from config/ai`).toMatch(/from "\.\.\/config\/ai"/);
    }
  });
});

describe("guard reach", () => {
  it("the pattern matches the shape it hunts", () => {
    // Tripwire. If this stops matching, the assertion above passes by finding
    // nothing rather than by there being nothing.
    expect([...'model: "gemini-2.0-flash",'.matchAll(MODEL_LITERAL)].length).toBe(1);
    expect([...'models/gemini-3.6-flash:generateContent'.matchAll(MODEL_LITERAL)].length).toBe(1);
    expect([...'const GEMINI_MODEL = process.env.GEMINI_MODEL'.matchAll(MODEL_LITERAL)].length).toBe(0);
    // a price-table KEY is data, not a call site — it must NOT trip
    expect([...'"gpt-4o": { input: 0.0025, output: 0.01 },'.matchAll(MODEL_LITERAL)].length).toBe(0);
  });

  it("actually walks the source tree", () => {
    // A guard whose walk returns nothing passes vacuously.
    expect(walk(SRC).length).toBeGreaterThan(100);
  });
});
