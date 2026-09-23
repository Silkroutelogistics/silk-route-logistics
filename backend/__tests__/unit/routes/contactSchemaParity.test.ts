/**
 * The two contact schemas must not drift.
 *
 * WHY THIS EXISTS. A contact write is validated TWICE, by two hand-maintained
 * copies of the same shape: `contactSchema` in routes/customers.ts, applied by
 * validateBody, and `createContactSchema` in controllers/customerController.ts,
 * re-parsed inside the handler. validateBody REPLACES req.body with its parsed
 * result and z.object() strips unknown keys, so a field present in one copy and
 * absent from the other is dropped in silence: no type error, no runtime error,
 * no 400 — the toggle simply saves nothing and the UI shows the old value back.
 *
 * That is §19 Sub-pattern 5, and it is the class that let the operational
 * consent be unreachable until both copies carried it. The guard reads the
 * field sets out of the two source files and fails naming the difference.
 *
 * Reading source rather than importing is deliberate: importing the route
 * module pulls in the whole controller graph and its env, which is what makes
 * ssoSessionRow's vi.mock hoist fail in a worktree with a minimal .env.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../..");

function fieldsOf(file: string, schemaName: string): string[] {
  const src = fs.readFileSync(path.join(BACKEND, file), "utf8");
  const start = src.indexOf(`const ${schemaName} = z.object({`);
  if (start < 0) throw new Error(`${schemaName} not found in ${file}`);
  const open = src.indexOf("{", src.indexOf("z.object(", start));
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error(`unbalanced ${schemaName} in ${file}`);
  const body = src
    .slice(open + 1, end)
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  // top-level keys only: a nested z.object() would be deeper, and none exist here
  return [...body.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]).sort();
}

const ROUTE = ["src/routes/customers.ts", "contactSchema"] as const;
const CONTROLLER = ["src/controllers/customerController.ts", "createContactSchema"] as const;

describe("contact schemas — the two copies agree", () => {
  it("both parse a non-trivial field set (vacuity tripwire)", () => {
    expect(fieldsOf(...ROUTE).length).toBeGreaterThan(5);
    expect(fieldsOf(...CONTROLLER).length).toBeGreaterThan(5);
  });

  it("the route gate and the handler parse accept exactly the same fields", () => {
    const route = fieldsOf(...ROUTE);
    const ctrl = fieldsOf(...CONTROLLER);
    const onlyRoute = route.filter((f) => !ctrl.includes(f));
    const onlyCtrl = ctrl.filter((f) => !route.includes(f));
    expect(
      { onlyInRouteGate: onlyRoute, onlyInHandlerParse: onlyCtrl },
      "a field in one copy and not the other is dropped in silence — see this file's header",
    ).toEqual({ onlyInRouteGate: [], onlyInHandlerParse: [] });
  });

  it("both carry the consent fields the resolver reads", () => {
    for (const s of [ROUTE, CONTROLLER] as const) {
      const f = fieldsOf(...s);
      expect(f, `${s[0]} is missing a consent field`).toEqual(
        expect.arrayContaining(["receivesOperationalUpdates", "receivesTrackingLink", "doNotContact"]),
      );
    }
  });
});
