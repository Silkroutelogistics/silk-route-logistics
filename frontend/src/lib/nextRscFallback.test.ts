/**
 * Guard for patches/next+15.5.14.patch — the static-export RSC fallback URL.
 *
 * THE DEFECT (2026-09-18, reported from a carrier's iPhone). In
 * next/dist/client/components/router-reducer/fetch-server-response.js,
 * `output: "export"` mode mutates `url` in place to the flight-payload URL
 * (`/carrier/login` → `/carrier/login.txt?_rsc=…`) before fetching. Every
 * fallback in that function then routes through doMpaNavigation(), which
 * strips `.txt` and `_rsc` — EXCEPT the catch block, which builds its result
 * by hand from the mutated `url`. A string flightData means "hard-navigate
 * here", so any exception during the fetch sent the browser to the `.txt`
 * file as a DOCUMENT and Safari rendered the raw RSC payload as the page.
 *
 * Reachable on a phone by an ordinary dropped connection (`TypeError: Load
 * failed`), or by Safari aborting the in-flight fetch when a competing hard
 * navigation commits — the module's own `pagehide` listener calls
 * abortController.abort(), which lands in the same catch. Reproduced against
 * production by rejecting the .txt fetch: one link tap navigated to
 * /carrier/forgot-password.txt and rendered the payload.
 *
 * Upstream fixed this in canary (falls back to `originalUrl`); 15.5.x carries
 * it. The patch makes the catch block use doMpaNavigation like its siblings.
 *
 * WHAT THIS ASSERTS. The real function, called with a fetch that rejects,
 * returns a string flightData equal to the page URL — no `.txt`, no `_rsc`,
 * query preserved. It is behavioural, not a grep: the vacuity tripwire proves
 * the export branch actually ran (the fetch was aimed at the .txt URL), so a
 * pass cannot come from a code path where no .txt was ever appended.
 *
 * ONE LIMIT, STATED. This imports the CJS copy. The browser bundle is built
 * from next/dist/esm/. patch-package patches both from one file, and the
 * second case below reads both copies to confirm the same shape landed —
 * that half is structural, because two module systems cannot be imported
 * behaviourally from one vitest file without duplicating the whole harness.
 * The prebuild check (scripts/check-next-patch.mjs) is the build-time gate
 * that fails `next build` itself if the ESM copy is unpatched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

const PAGE_URL =
  "https://silkroutelogistics.ai/carrier/login?next=%2Fcarrier%2Fdashboard%2Ftenders";

describe("Next static-export RSC fetch fallback never targets the .txt payload", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    OUT: process.env.__NEXT_CONFIG_OUTPUT,
  };
  type Fsr = typeof import("next/dist/client/components/router-reducer/fetch-server-response");
  let fetchServerResponse: Fsr["fetchServerResponse"];
  // Next's types declare process.env.NODE_ENV readonly; the module reads it at
  // call time, so assignment through a plain record is the honest way in.
  const env = process.env as Record<string, string | undefined>;

  // The module require()s the bare specifier "react-server-dom-webpack/client",
  // which only exists as a webpack alias in Next's own build
  // (create-compiler-aliases.js: → next/dist/compiled/react-server-dom-webpack/
  // client.browser). Externalised node_modules are loaded by Node's real
  // require, which vi.mock cannot intercept, so mirror that exact alias at the
  // resolver — the module then runs against the same dependency the shipped
  // browser bundle is built with, not a stub.
  type Resolver = (this: unknown, request: unknown, ...rest: unknown[]) => string;
  const M = Module as unknown as { _resolveFilename: Resolver };
  const realResolve = M._resolveFilename;

  beforeAll(async () => {
    M._resolveFilename = function (request, ...rest) {
      if (request === "react-server-dom-webpack/client") {
        request = "next/dist/compiled/react-server-dom-webpack/client.browser";
      }
      return realResolve.call(this, request, ...rest);
    };
    // The compiled client reads __webpack_require__.u at module scope (chunk
    // filename plumbing). It is a bundle-time global; the fallback path under
    // test never loads a chunk, so a stub is all that is needed to import.
    (globalThis as unknown as { __webpack_require__: unknown }).__webpack_require__ = Object.assign(
      () => undefined,
      { u: () => "" },
    );
    // Both branches in the module read process.env at CALL time (CJS build,
    // nothing inlined), so this is enough to put it in production+export mode.
    env.NODE_ENV = "production";
    env.__NEXT_CONFIG_OUTPUT = "export";
    ({ fetchServerResponse } = await import(
      "next/dist/client/components/router-reducer/fetch-server-response"
    ));
  });

  afterAll(() => {
    M._resolveFilename = realResolve;
    env.NODE_ENV = saved.NODE_ENV;
    env.__NEXT_CONFIG_OUTPUT = saved.OUT;
    vi.unstubAllGlobals();
  });

  it("a rejected flight fetch falls back to the page URL, not the .txt it fetched", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", (input: URL | Request | string) => {
      fetched.push(input instanceof URL ? input.href : typeof input === "string" ? input : input.url);
      return Promise.reject(new TypeError("Load failed")); // Safari's wording
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchServerResponse(new URL(PAGE_URL), {
      flightRouterState: ["", { children: ["__PAGE__", {}] }],
      nextUrl: null,
    } as Parameters<Fsr["fetchServerResponse"]>[1]);

    // Vacuity tripwire: the export branch must have run, i.e. the fetch was
    // aimed at the .txt flight URL. Without this, a non-export code path
    // (which never appends .txt) would pass the assertions below for free.
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toMatch(/^https:\/\/silkroutelogistics\.ai\/carrier\/login\.txt\?/);
    expect(fetched[0]).toContain("_rsc=");

    // The fallback: a string (hard navigation) to the PAGE, query intact.
    expect(typeof result.flightData).toBe("string");
    expect(result.flightData).toBe(PAGE_URL);
    expect(String(result.flightData)).not.toMatch(/\.txt/);
    expect(String(result.flightData)).not.toMatch(/_rsc=/);

    err.mockRestore();
  });

  it("both dist copies (CJS + ESM) carry the patched catch block", () => {
    const root = path.resolve(__dirname, "../../node_modules/next/dist");
    for (const rel of [
      "client/components/router-reducer/fetch-server-response.js",
      "esm/client/components/router-reducer/fetch-server-response.js",
    ]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      const catchIdx = src.indexOf("Failed to fetch RSC payload for");
      expect(catchIdx, `${rel}: catch block not found`).toBeGreaterThan(0);
      // Bound the window by the next function definition rather than a byte
      // count: the first draft used 900 bytes and was 31 short of the patched
      // return, failing against a correctly patched file.
      const endIdx = src.indexOf("function createFetch", catchIdx);
      expect(endIdx, `${rel}: createFetch not found after catch block`).toBeGreaterThan(catchIdx);
      const catchBlock = src.slice(catchIdx, endIdx);
      expect(catchBlock, `${rel}: unpatched — falls back to the mutated .txt url`).not.toContain(
        "flightData: url.toString()",
      );
      expect(catchBlock, `${rel}: patched fallback must route through doMpaNavigation`).toContain(
        "doMpaNavigation(url.toString())",
      );
    }
  });
});
