/**
 * A native form that POSTs to the API host needs the CSP to allow it, and the
 * two live in different files that nothing else connects.
 *
 * WHY THIS EXISTS. E3 (v3.8.bew) added the carrier's "Sign the rate
 * confirmation" button as a REAL `<form method="POST" action={apiHref(...)}>`,
 * because the route answers a 303 to the token page and only a top-level
 * navigation both follows it into the tab and carries the httpOnly cookie. A
 * browser enforces `form-action` from `public/_headers` on that submission.
 * The directive already allowed the API host when the form landed; it was
 * never asserted anywhere, so a later tightening to `form-action 'self'` would
 * have killed the button silently — the browser blocks the POST, no request
 * reaches the server, nothing logs. That is §19 Sub-pattern 5's third fire in
 * a new costume: a contract with one end in the app and the other in an
 * allow-list the app's tests never read (v3.8.awq was the same shape with a
 * custom header and the CORS allow-list).
 *
 * The rule is derived from source, not from a second hand-kept list: every
 * `<form` whose `action` is built with apiHref() is a form that submits to the
 * API host, and the CSP must name that host in `form-action`.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..");
const HEADERS = path.join(__dirname, "..", "..", "public", "_headers");
const API_HOST = "https://api.silkroutelogistics.ai";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** `<form … action={apiHref(` anywhere in the file, across line breaks. */
function apiForms(src: string): number {
  return (src.match(/<form\b[^>]*\baction=\{apiHref\(/g) ?? []).length;
}

function formAction(): string[] {
  const csp = fs.readFileSync(HEADERS, "utf8").split(/\r?\n/).find((l) => /Content-Security-Policy:/i.test(l));
  if (!csp) throw new Error("no Content-Security-Policy line in public/_headers");
  const dir = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("form-action"));
  return dir ? dir.split(/\s+/).slice(1) : [];
}

describe("CSP form-action covers every native form that posts to the API", () => {
  const files = walk(SRC);
  const posting = files.filter((f) => apiForms(fs.readFileSync(f, "utf8")) > 0);

  it("vacuity tripwire: the walk sees the app and finds the E3 sign form", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(posting.some((f) => f.replace(/\\/g, "/").endsWith("carrier/dashboard/my-loads/page.tsx"))).toBe(true);
  });

  it("the extractor sees a form whose attributes wrap across lines", () => {
    expect(apiForms('<form\n  method="POST"\n  action={apiHref(`/x`)}\n>')).toBe(1);
    expect(apiForms('<form method="POST" action="/local">')).toBe(0);
    expect(apiForms("const f = apiHref(`/x`); // not a form")).toBe(0);
  });

  it("form-action names the API host while any such form exists", () => {
    const allowed = formAction();
    expect(allowed, "form-action directive is missing from public/_headers").not.toEqual([]);
    if (posting.length > 0) {
      expect(allowed, `these files post a native form to the API host: ${posting.map((f) => path.relative(SRC, f)).join(", ")}`)
        .toContain(API_HOST);
    }
  });
});
