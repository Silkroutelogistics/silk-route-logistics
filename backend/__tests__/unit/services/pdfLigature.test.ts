import { describe, it, expect } from "vitest";

/**
 * Integration-style test for the generateBOLFromLoad monkey-patch approach
 * (v3.8.b — Option D′: features-injection, object-form with explicit
 * liga/clig/rlig/dlig = false).
 *
 * The v3.8.b first attempt tried `features: ["kern"]` (array form). Array
 * form is additive — fontkit treats it as "enable these USER features on
 * top of the default feature set" — so `liga` stayed on via defaults and
 * Playfair / DM Sans still substituted `fi` with a glyph that truncated
 * the `i`. Observed: "classified" → "classifed".
 *
 * Option D′ switches to the object form, which is fontkit's explicit
 * per-feature on/off map. Each ligature-family tag is set to `false`.
 * This disables all four at the layout-engine level, so no substitution
 * runs and each glyph renders individually. `kern: true` preserves
 * typography kerning.
 *
 * This test reproduces the patch against a minimal mock and verifies that
 * both call styles correctly receive the object-form features option,
 * and that caller-provided options are preserved while the four
 * ligature flags are forced off.
 */

interface MockDocText {
  (s: string, ...rest: unknown[]): MockDoc;
}

interface MockDoc {
  text: MockDocText;
  font: (f: string) => MockDoc;
  fontSize: (n: number) => MockDoc;
  fillColor: (c: string) => MockDoc;
  _calls: Array<{ text: unknown; options: Record<string, unknown> | undefined }>;
}

function makeMockDoc(): MockDoc {
  const doc: MockDoc = {
    _calls: [],
    text(s: unknown, ...rest: unknown[]): MockDoc {
      const last = rest[rest.length - 1];
      const options =
        last !== null && typeof last === "object" && !Array.isArray(last) && !Buffer.isBuffer(last as Buffer)
          ? (last as Record<string, unknown>)
          : undefined;
      doc._calls.push({ text: s, options });
      return doc;
    },
    font(_f: string): MockDoc { return doc; },
    fontSize(_n: number): MockDoc { return doc; },
    fillColor(_c: string): MockDoc { return doc; },
  };
  return doc;
}

function applyMonkeyPatch(doc: MockDoc): void {
  const origText = doc.text.bind(doc);
  doc.text = function (this: MockDoc, ...args: unknown[]): MockDoc {
    const last = args[args.length - 1];
    const isOptionsObj =
      last !== null &&
      typeof last === "object" &&
      !Array.isArray(last) &&
      !Buffer.isBuffer(last as Buffer);

    const base: Record<string, boolean> = {
      liga: false,
      clig: false,
      rlig: false,
      dlig: false,
      kern: true,
    };

    if (isOptionsObj) {
      const opts = last as Record<string, unknown>;
      const callerFeatures = opts.features;
      let merged: Record<string, boolean>;
      if (
        callerFeatures !== null &&
        typeof callerFeatures === "object" &&
        !Array.isArray(callerFeatures)
      ) {
        merged = {
          ...(callerFeatures as Record<string, boolean>),
          liga: false,
          clig: false,
          rlig: false,
          dlig: false,
          kern:
            (callerFeatures as Record<string, boolean>).kern ?? true,
        };
      } else {
        merged = base;
      }
      opts.features = merged as unknown as string[];
    } else {
      args.push({ features: base as unknown as string[] });
    }
    return (origText as (...a: unknown[]) => MockDoc)(...args);
  } as MockDocText;
}

describe("doc.text monkey-patch — features-disable (Option D′)", () => {
  it("injects object-form features with liga=false on a direct doc.text(str) call", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    doc.text("classified");

    expect(doc._calls).toHaveLength(1);
    expect(doc._calls[0].text).toBe("classified");
    const f = doc._calls[0].options?.features as unknown as Record<string, boolean>;
    expect(f).toBeDefined();
    expect(f.liga).toBe(false);
    expect(f.clig).toBe(false);
    expect(f.rlig).toBe(false);
    expect(f.dlig).toBe(false);
    expect(f.kern).toBe(true);
  });

  it("injects object-form features on a doc.text(str, x, y) call with no options", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    doc.text("certifies", 100, 200);

    expect(doc._calls).toHaveLength(1);
    const f = doc._calls[0].options?.features as unknown as Record<string, boolean>;
    expect(f.liga).toBe(false);
    expect(f.kern).toBe(true);
  });

  it("merges into caller's existing options object without losing other fields", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    doc.text("filed", 50, 50, { width: 200, align: "right", lineBreak: false });

    expect(doc._calls).toHaveLength(1);
    const opts = doc._calls[0].options;
    expect(opts).toBeDefined();
    expect(opts?.width).toBe(200);
    expect(opts?.align).toBe("right");
    expect(opts?.lineBreak).toBe(false);
    const f = opts?.features as unknown as Record<string, boolean>;
    expect(f.liga).toBe(false);
    expect(f.clig).toBe(false);
    expect(f.rlig).toBe(false);
    expect(f.dlig).toBe(false);
    expect(f.kern).toBe(true);
  });

  it("merges with caller's object-form features, forcing liga family off while preserving other tags", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    // Caller asks for stylistic set 1 and wants ligatures enabled (ignored).
    const callerFeatures = { ss01: true, liga: true, smcp: true };
    doc.text("traffic", 50, 50, { features: callerFeatures });

    const f = doc._calls[0].options?.features as unknown as Record<string, boolean>;
    expect(f.ss01).toBe(true); // caller's non-ligature tag preserved
    expect(f.smcp).toBe(true); // caller's non-ligature tag preserved
    expect(f.liga).toBe(false); // forced off
    expect(f.clig).toBe(false);
    expect(f.rlig).toBe(false);
    expect(f.dlig).toBe(false);
    expect(f.kern).toBe(true);
  });

  it("discards array-form caller features and uses the object-form disable", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    doc.text("modifications", 50, 50, { features: ["kern", "liga"] });

    const f = doc._calls[0].options?.features as unknown as Record<string, boolean>;
    expect(Array.isArray(f)).toBe(false);
    expect(f.liga).toBe(false);
    expect(f.kern).toBe(true);
  });

  it("intercepts a fluent-chained doc.font(...).fontSize(...).fillColor(...).text(...) call", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    doc.font("Playfair-Bold").fontSize(14).fillColor("#0A2540").text("traffic modifications");

    expect(doc._calls).toHaveLength(1);
    expect(doc._calls[0].text).toBe("traffic modifications");
    const f = doc._calls[0].options?.features as unknown as Record<string, boolean>;
    expect(f.liga).toBe(false);
    expect(f.kern).toBe(true);
  });

  it("does NOT mutate the string — all ligature handling flows through options, not characters", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    const legal = "Certifies contents are properly classified, packaged, marked, and labeled per applicable notifications and filed tariffs.";
    doc.font("DMSans-Italic").fontSize(7.75).text(legal);

    const recorded = doc._calls[0].text as string;
    // Critical: no ZWNJ or any other inserted char — string passes through verbatim.
    expect(recorded.indexOf("‌")).toBe(-1);
    expect(recorded).toBe(legal);
    // Ligature control is in the options, not the string.
    const f = doc._calls[0].options?.features as unknown as Record<string, boolean>;
    expect(f.liga).toBe(false);
  });

  it("preserves chained return value for continued chaining", () => {
    const doc = makeMockDoc();
    applyMonkeyPatch(doc);

    const result = doc.text("filed").font("X").text("traffic");

    expect(result).toBe(doc);
    expect(doc._calls).toHaveLength(2);
    expect(doc._calls[0].text).toBe("filed");
    expect(doc._calls[1].text).toBe("traffic");
    const f0 = doc._calls[0].options?.features as unknown as Record<string, boolean>;
    const f1 = doc._calls[1].options?.features as unknown as Record<string, boolean>;
    expect(f0.liga).toBe(false);
    expect(f1.liga).toBe(false);
  });
});
