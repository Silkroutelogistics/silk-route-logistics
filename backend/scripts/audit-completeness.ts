/**
 * audit-completeness.ts — Static-code scanner for SRL data-plumbing-vs-UI gaps.
 *
 * Run from repo root or backend/:
 *   cd backend && npx ts-node scripts/audit-completeness.ts
 *
 * Output: markdown report to stdout AND written to docs/audit-reports/audit-<ISO-date>.md.
 *
 * Three passes (v1, 2026-05-02):
 *   Pass 1 — Orphan endpoints. Backend PUT/PATCH/DELETE routes with no
 *            apparent frontend caller. Catches v3.8.j-class gaps
 *            (EditLoadModal Item 3, FacilitiesTab edit Item 8.2.3,
 *            customer inactivation v3.8.l, dispatch switching v3.8.k).
 *
 *   Pass 2 — Orphan schema fields. Prisma model fields with low or zero
 *            references in frontend .tsx files. Catches operating-hours
 *            form gap (Item 8.2.2), CustomerContact role-routing gap
 *            (Item 8.3), and similar fields-exist-but-UI-doesnt-write-them
 *            patterns.
 *
 *   Pass 4 — List-row action completeness. For each .map(...=><tr/<div>)
 *            list render, check for Edit and Delete actions. Flag
 *            Delete-only rows. Catches FacilitiesTab-class gaps directly.
 *
 *   (Pass 3 — Form-vs-schema diff. Deferred to v2 — needs explicit
 *            form→model mapping table and JSX prop extraction.)
 *
 * Heuristic, not AST. False positives expected. Read the report
 * critically — every finding is a CANDIDATE for backlog logging, not
 * a definitive bug.
 *
 * Triage note (added 2026-05-02 after Tier C reclassification):
 * "No caller found" is a triage SIGNAL, not an auto-classification.
 * It does NOT mean "internal-only fired" or "safe to ignore." Every
 * orphan endpoint needs human verification of caller intent before
 * bucketing — grep `backend/src/` AND `frontend/src/` for the route
 * path AND for any service function the route delegates to. An HTTP
 * endpoint can be dormant from a UI perspective while its underlying
 * service function is alive and used internally (see tagService
 * `assignTag` — called by `autoTagEntity` rule engine at line 80,
 * but POST/DELETE /tags/assign endpoints have zero callers).
 */

import * as fs from "fs";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKEND_ROUTES = path.join(REPO_ROOT, "backend/src/routes");
const FRONTEND_SRC = path.join(REPO_ROOT, "frontend/src");
const BACKEND_SRC = path.join(REPO_ROOT, "backend/src");
const PRISMA_SCHEMA = path.join(REPO_ROOT, "backend/prisma/schema.prisma");
const REPORT_DIR = path.join(REPO_ROOT, "docs/audit-reports");

// Schema fields too generic to flag as orphans — they appear in every
// model and would produce noise.
const COMMON_FIELDS = new Set([
  "id", "name", "email", "phone", "status", "type", "createdAt",
  "updatedAt", "deletedAt", "userId", "customerId", "carrierId",
  "loadId", "address", "city", "state", "zip", "notes", "data",
  "title", "description", "amount", "rate", "weight", "code",
  "url", "company", "firstName", "lastName", "role", "tier",
]);

// HTTP verbs treated as mutating (need a frontend writer).
const MUTATING_VERBS = ["put", "patch", "delete"] as const;

// ─── Shared file helpers ───────────────────────────────────────────────

function walkFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        stack.push(full);
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  }
  return out;
}

function readFile(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function relPath(file: string): string {
  return path.relative(REPO_ROOT, file).replace(/\\/g, "/");
}

// ─── Pass 1: Orphan endpoints ──────────────────────────────────────────

interface Endpoint {
  verb: string;
  path: string;
  file: string;
  line: number;
  /**
   * The `// audit-pass1:` verdict written beside the route, if any.
   *
   * Arc 2 triaged 26 endpoints and wrote each verdict into the code. This tool
   * matched paths and ignored those comments, so every one of them resurfaced
   * as UNRESOLVED on the next run — the triage had no memory, and re-deciding
   * settled questions is how a finding list stops being read at all.
   */
  disposition?: string;
}

/**
 * Read the `// audit-pass1: VERDICT — reason` note attached to a route.
 *
 * Looks only at the lines immediately above, so a note cannot drift onto a
 * route it was never about. A dispositioned endpoint is still LISTED, with its
 * reason shown — it is moved out of UNRESOLVED, never hidden. An annotation
 * that could silence a finding would be worse than no annotation at all.
 */
function readDisposition(lines: string[], routeLine: number): string | undefined {
  for (let k = routeLine - 1; k >= Math.max(0, routeLine - 3); k--) {
    const t = lines[k].trim();
    if (!t.startsWith("//")) break;
    // Matched with string methods, not a literal regex: the escaping is one
    // more thing to get wrong for no benefit, and it got wrong once already.
    const idx = t.indexOf("audit-pass1:");
    if (idx >= 0) return t.slice(idx + "audit-pass1:".length).trim();
  }
  return undefined;
}

function extractEndpoints(): Endpoint[] {
  const files = walkFiles(BACKEND_ROUTES, [".ts"]);
  const endpoints: Endpoint[] = [];
  // Matches both shapes:
  //   router.put("/:id/foo", handler)                 — path on the same line
  //   router.put(\n  "/:id/foo",\n  authorize(...),   — path on the NEXT line
  //
  // The single-line-only version of this regex hid 25 mutating routes from
  // Pass 1, so every count this pass has ever reported was over a partial
  // corpus. It surfaced when a route was reformatted to multi-line for an
  // added middleware and silently vanished from the inventory. §13.3 Item 230.
  const verbRe = /router\.(put|patch|delete)\s*\(/i;
  const pathRe = /["'`]([^"'`]+)["'`]/;
  for (const file of files) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const v = verbRe.exec(lines[i]);
      if (!v) continue;
      // The path is the first quoted string at or after the verb. Look on this
      // line first, then the next two — far enough for a wrapped call, near
      // enough that an unrelated string below cannot be mistaken for a path.
      const after = lines[i].slice(v.index + v[0].length);
      let p = pathRe.exec(after);
      for (let k = 1; k <= 2 && !p; k++) if (lines[i + k] !== undefined) p = pathRe.exec(lines[i + k]);
      const m = p ? [v[0], v[1], p[1]] : null;
      if (m && MUTATING_VERBS.includes(m[1].toLowerCase() as any)) {
        endpoints.push({
          verb: m[1].toUpperCase(),
          path: m[2],
          file,
          line: i + 1,
          disposition: readDisposition(lines, i),
        });
      }
    }
  }
  return endpoints;
}

// ─── Pass 1 matching, v2 (Arc 3 Phase 5) ───────────────────────────────
//
// v1 asked "does every static segment of the route appear in this file,
// immediately preceded by a slash or a ${...}". That reads a call like
//
//     api.patch(`/carrier-drivers/${id}/${action}`)   // action: "deactivate"
//
// as having no caller, because the literal "deactivate" appears only as
// `action: "deactivate"` where the preceding character is a quote. Both
// carrier-driver deactivate/reactivate endpoints were reported as orphans while
// being live in production — the finding that prompted this rewrite.
//
// v2 compares SEGMENTS instead of scanning for substrings. A route path is
// matched against the tail of a caller path, segment by segment, where either
// side may be dynamic (`:id` on the route, `${...}` on the caller). Tail rather
// than whole, because a route declares `/:id/deactivate` while the caller writes
// the mounted `/carrier-drivers/${id}/${action}`.
//
// The result is graded rather than boolean:
//
//   EXACT      every literal segment of the route met a matching literal in the
//              caller. As close to proof as a grep gets.
//   PATTERN    the route matched, but at least one of its literal segments lined
//              up with a `${...}` slot. The caller MAY hit this route — it
//              depends on a runtime value. Live until shown otherwise.
//   UNRESOLVED nothing matched. This is the only grade worth calling an orphan.
//
// Grading matters because a binary answer invites the reader to treat a
// heuristic as a verdict, which is exactly how two live endpoints ended up on a
// list titled "orphan".

type Confidence = "EXACT" | "PATTERN" | "UNRESOLVED" | "DISPOSITIONED";

interface GradedEndpoint extends Endpoint {
  confidence: Confidence;
  caller?: string;
}

interface Segment {
  dynamic: boolean;
  text: string;
}

function toSegments(p: string): Segment[] {
  return p
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => {
      // `:id` on the backend, `${...}` (possibly with surrounding text) on the
      // frontend. A segment that merely CONTAINS an interpolation is dynamic —
      // `v${n}` could be anything at runtime.
      if (s.startsWith(":") || s.includes("${")) return { dynamic: true, text: s };
      return { dynamic: false, text: s };
    });
}

/** Every api.<verb>(`...`) path literal in the frontend, by verb. */
function extractFrontendCalls(
  frontendFiles: string[],
  frontendCache: Map<string, string>,
): Map<string, { path: string; file: string }[]> {
  const byVerb = new Map<string, { path: string; file: string }[]>();
  const re = /api\.(put|patch|delete)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
  for (const file of frontendFiles) {
    const content = frontendCache.get(file) ?? readFile(file);
    if (!frontendCache.has(file)) frontendCache.set(file, content);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const verb = m[1].toUpperCase();
      const list = byVerb.get(verb) ?? [];
      // Drop a querystring — it is not part of the route.
      list.push({ path: m[2].split("?")[0], file });
      byVerb.set(verb, list);
    }
  }
  return byVerb;
}

/**
 * Does this caller path's tail match the route, and how confidently?
 * Returns null when it does not match at all.
 */
function matchRoute(routeSegs: Segment[], callerSegs: Segment[]): Confidence | null {
  if (routeSegs.length === 0) return "PATTERN"; // Mount-root route; nothing to compare.
  if (callerSegs.length < routeSegs.length) return null;

  const tail = callerSegs.slice(callerSegs.length - routeSegs.length);
  let sawPatternOnly = false;

  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i];
    const c = tail[i];
    if (r.dynamic) continue;            // route param accepts whatever the caller passes
    if (c.dynamic) { sawPatternOnly = true; continue; } // caller may or may not produce it
    if (r.text !== c.text) return null; // two literals that disagree — different route
  }
  return sawPatternOnly ? "PATTERN" : "EXACT";
}

/**
 * The mount a route file is served under, guessed from its filename:
 * carrierDrivers.ts → "carrier-drivers". Used to stop a PATTERN match from
 * pairing a route with an unrelated caller.
 *
 * Without this, a route like `/:id/deactivate` (two segments, one dynamic)
 * matches the tail of ANY two-segment caller path — the first run of v2 happily
 * attributed carrier-driver deactivate to a customer-contacts call. A wrong
 * caller is worse than no caller: it reads as evidence.
 *
 * Compared with a trailing "s" trimmed off both sides, since a file named
 * routingGuide.ts is mounted at /routing-guides.
 */
function mountHint(file: string): string {
  const base = path.basename(file, ".ts");
  return base.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function depluralize(s: string): string {
  return s.endsWith("s") ? s.slice(0, -1) : s;
}

function callerLooksMounted(callPath: string, hint: string): boolean {
  const wanted = depluralize(hint);
  return toSegments(callPath).some((seg) => !seg.dynamic && depluralize(seg.text.toLowerCase()) === wanted);
}

function classifyEndpoint(
  ep: Endpoint,
  callsByVerb: Map<string, { path: string; file: string }[]>,
): { confidence: Confidence; caller?: string } {
  const routeSegs = toSegments(ep.path);
  const candidates = callsByVerb.get(ep.verb) ?? [];
  const hint = mountHint(ep.file);

  let best: { confidence: Confidence; caller?: string } = { confidence: "UNRESOLVED" };
  for (const call of candidates) {
    const verdict = matchRoute(routeSegs, toSegments(call.path));
    if (!verdict) continue;

    // A route whose own literals all matched real literals is self-evidencing.
    // Anything weaker has to also look like it is aimed at this route's mount.
    if (verdict === "PATTERN" && !callerLooksMounted(call.path, hint)) continue;

    const caller = `${relPath(call.file)} → ${call.path}`;
    if (verdict === "EXACT") return { confidence: "EXACT", caller };
    // Among PATTERN matches keep the most specific caller — the one with the
    // most path segments. `/carrier-drivers/${id}/${action}` and
    // `/carrier-drivers/${id}` both match `/:id/deactivate`, and only the first
    // is the real caller; showing the shorter one sends the reader to the wrong
    // line.
    if (
      best.confidence === "UNRESOLVED" ||
      toSegments(call.path).length > toSegments((best.caller ?? "").split(" → ")[1] ?? "").length
    ) {
      best = { confidence: "PATTERN", caller };
    }
  }
  return best;
}

function endpointHasCaller(ep: Endpoint, frontendFiles: string[], frontendCache: Map<string, string>): boolean {
  // Static parts of the route — drop :param tokens, split on /, keep non-empty.
  const staticParts = ep.path
    .split("/")
    .filter((p) => p.length > 0 && !p.startsWith(":"));
  if (staticParts.length === 0) return true; // Can't search, assume caller exists.

  // Build a regex that finds api.<verb>(`...<part1>.*<part2>...`)
  // Tolerant — accept template literals with ${...} between parts.
  const verb = ep.verb.toLowerCase();
  const verbRegex = new RegExp(`api\\.${verb}\\b`, "i");

  for (const file of frontendFiles) {
    const content = frontendCache.get(file) ?? readFile(file);
    if (!frontendCache.has(file)) frontendCache.set(file, content);
    if (!verbRegex.test(content)) continue;

    // Check that all static parts appear within the file (not necessarily on
    // same line — a multi-line template literal can span). Naive: just check
    // each part appears somewhere in the file.
    const allPartsPresent = staticParts.every((p) => {
      // Match part as whole-segment or template-literal-adjacent
      const partRegex = new RegExp(`(?:/|\\$\\{[^}]+\\})${escapeRegex(p)}(?:/|\`|"|'|\\?|\\$)`);
      return partRegex.test(content);
    });
    if (allPartsPresent) {
      // Final check: api.<verb>(...) appears in the same file as the parts
      // — this is heuristic but reduces noise from unrelated reads.
      return true;
    }
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Pass 2: Orphan schema fields ──────────────────────────────────────

interface SchemaField {
  model: string;
  field: string;
  type: string;
  line: number;
}

function extractSchemaFields(): SchemaField[] {
  if (!fs.existsSync(PRISMA_SCHEMA)) return [];
  const content = readFile(PRISMA_SCHEMA);
  const lines = content.split("\n");
  const fields: SchemaField[] = [];
  let currentModel: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      continue;
    }
    if (line.trim() === "}") {
      currentModel = null;
      continue;
    }
    if (!currentModel) continue;
    if (line.trim().startsWith("//") || line.trim() === "") continue;
    if (line.trim().startsWith("@@")) continue;
    const fieldMatch = line.match(/^\s+(\w+)\s+(\w+\??)/);
    if (fieldMatch) {
      const [, field, type] = fieldMatch;
      // Skip relation fields (capitalized type) — they're not data fields.
      if (/^[A-Z]/.test(type) && !["String", "Int", "Float", "Boolean", "DateTime", "Json", "Decimal", "Bytes", "BigInt"].includes(type.replace("?", ""))) {
        continue;
      }
      fields.push({ model: currentModel, field, type, line: i + 1 });
    }
  }
  return fields;
}

function fieldReferenceCount(field: string, frontendFiles: string[], frontendCache: Map<string, string>): number {
  // Count files where the field name appears (not raw occurrences — files,
  // because false positives are easier to spot at file granularity).
  const re = new RegExp(`\\b${escapeRegex(field)}\\b`);
  let count = 0;
  for (const file of frontendFiles) {
    const content = frontendCache.get(file) ?? readFile(file);
    if (!frontendCache.has(file)) frontendCache.set(file, content);
    if (re.test(content)) count++;
  }
  return count;
}

/**
 * Why a field has no frontend reference.
 *
 * Pass 2 originally counted frontend files only, so every backend-only field —
 * audit columns, cron bookkeeping, denormalised mirrors — surfaced as an
 * "orphan" beside genuinely dead ones. That buries the signal, and it also
 * contradicts this file's own triage note, which says to grep backend/src AND
 * frontend/src before bucketing anything.
 *
 *   UNREFERENCED — nothing outside schema.prisma mentions it. The real finding.
 *   BACKEND_ONLY — the server uses it; no UI surfaces it. Usually correct, and
 *                  occasionally a missing screen, so it is reported, not hidden.
 */
export type FieldCategory = "UNREFERENCED" | "BACKEND_ONLY";

function categorizeField(
  field: string,
  frontendRefs: number,
  backendRefs: number,
): FieldCategory | null {
  if (frontendRefs > 0) return null; // surfaced somewhere; not this pass's problem
  return backendRefs > 0 ? "BACKEND_ONLY" : "UNREFERENCED";
}

// ─── Pass 4: List action completeness ──────────────────────────────────

interface ListRender {
  file: string;
  line: number;
  hasEdit: boolean;
  hasDelete: boolean;
  snippet: string;
}

function findListRenders(frontendFiles: string[], frontendCache: Map<string, string>): ListRender[] {
  const out: ListRender[] = [];
  // Match a .map(... => <tag... ) call, then capture ~30 lines of the JSX.
  // Heuristic — find lines containing `.map(` followed by `=>` and `<` within
  // ~5 lines, then grab the next 60 lines as a candidate JSX block.
  const startRegex = /\.map\s*\(\s*\(?[^)]*\)?\s*=>\s*[\(<]/;
  for (const file of frontendFiles) {
    const content = frontendCache.get(file) ?? readFile(file);
    if (!frontendCache.has(file)) frontendCache.set(file, content);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!startRegex.test(lines[i])) continue;
      // Take 40 lines as the candidate JSX window
      const window = lines.slice(i, Math.min(i + 40, lines.length)).join("\n");
      // Skip windows that don't render an HTML row container
      if (!/<(tr|li|article|aside|section|div[^>]*\bclassName=[^>]*(?:row|item|card|tile|entry))/i.test(window)) {
        continue;
      }
      const hasEdit = /\b(?:Edit|onEdit|setEditing|update[A-Z])/i.test(window);
      const hasDelete = /\b(?:Remove|Delete|onDelete|delete[A-Z]|del\.mutate|deleteMutation)/i.test(window);
      // Only flag rows that have Delete but no Edit, AND the row is non-trivial
      // (some onClick or link inside)
      if (hasDelete && !hasEdit) {
        out.push({
          file,
          line: i + 1,
          hasEdit,
          hasDelete,
          snippet: lines[i].trim().slice(0, 100),
        });
      }
    }
  }
  return out;
}

// ─── Output formatter ──────────────────────────────────────────────────

function pad(n: number, w: number): string {
  return String(n).padStart(w);
}

function buildReport(
  endpoints: Endpoint[],
  orphanEndpoints: GradedEndpoint[],
  schemaFields: SchemaField[],
  orphanFields: Array<SchemaField & { refs: number; backendRefs: number; category: FieldCategory }>,
  listRenders: ListRender[],
): string {
  // Split here rather than taking two arrays, so the report and the console
  // summary cannot disagree about what is in which bucket.
  const unreferenced = orphanFields.filter((f) => f.category === "UNREFERENCED");
  const backendOnly = orphanFields.filter((f) => f.category === "BACKEND_ONLY");
  const now = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# SRL Audit Completeness Report`);
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push(`Tool: \`backend/scripts/audit-completeness.ts\` v1`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Pass | Total scanned | Findings |`);
  lines.push(`|---|---:|---:|`);
  const unresolved = orphanEndpoints.filter((e) => e.confidence === "UNRESOLVED");
  const patterned = orphanEndpoints.filter((e) => e.confidence === "PATTERN");
  // Dispositioned endpoints are LISTED, not hidden. A verdict moves a finding
  // out of the open column; it must never remove it from the page, or the
  // annotation becomes a way to silence a finding rather than answer one.
  const dispositioned = orphanEndpoints.filter((e) => e.confidence === "DISPOSITIONED");
  lines.push(`| 1 — Orphan endpoints (UNRESOLVED only) | ${endpoints.length} | **${unresolved.length}** |`);
  lines.push(`| 1b — Pattern-matched, likely live (verify) | — | ${patterned.length} |`);
  lines.push(`| 2 — Orphan schema fields (low frontend refs) | ${schemaFields.length} | **${orphanFields.length}** |`);
  lines.push(`| 4 — List rows (Delete-only, no Edit) | — | **${listRenders.length}** |`);
  lines.push("");

  // ── Pass 1 detail
  lines.push(`## Pass 1 — Orphan endpoints`);
  lines.push("");
  lines.push(`Backend mutating routes (\`PUT\` / \`PATCH\` / \`DELETE\`) graded by how well a frontend caller could be matched. Matching is segment-based (v2): the route is compared against the TAIL of each caller path, and either side may be dynamic.`);
  lines.push("");
  lines.push(`- **UNRESOLVED** — nothing matched and no verdict is on file. This is the only grade worth calling an orphan.`);
  lines.push("- **DISPOSITIONED** — no caller, but an audit-pass1 verdict sits beside the route in the code. Listed with its reason; not an open question.");
  lines.push(`- **PATTERN** — matched, but a literal route segment lined up with a \`\${...}\` slot in the caller, so whether it is hit depends on a runtime value. Treat as live until shown otherwise.`);
  lines.push(`- **EXACT** matches are not listed here — they have a caller.`);
  lines.push("");
  if (orphanEndpoints.length === 0) {
    lines.push(`✅ No orphan endpoints found.`);
  } else {
    lines.push(`| Confidence | Verb | Path | Source | Possible caller |`);
    lines.push(`|---|---|---|---|---|`);
    for (const ep of [...unresolved, ...dispositioned, ...patterned]) {
      lines.push(
        `| ${ep.confidence} | ${ep.verb} | \`${ep.path}\` | \`${relPath(ep.file)}:${ep.line}\` | ${ep.caller ? "`" + ep.caller + "`" : ep.disposition ? ep.disposition : "—"} |`,
      );
    }
  }
  lines.push("");

  // ── Pass 2 detail
  lines.push(`## Pass 2 — Orphan schema fields`);
  lines.push("");
  lines.push(
    `Prisma model fields with **zero references in \`frontend/src\`**, split by whether the backend uses them. Common boilerplate names (id, status, name, email, etc.) excluded. A non-zero count doesn't guarantee the field is *captured by a form* — it just means the name appears somewhere; manual check needed for that.`,
  );
  lines.push("");
  lines.push(
    `**UNREFERENCED** is the actionable bucket: nothing outside \`schema.prisma\` mentions the field. **BACKEND_ONLY** means the server uses it but no screen surfaces it — usually correct (audit columns, cron bookkeeping), occasionally a missing screen, so it is listed rather than hidden.`,
  );
  lines.push("");
  lines.push(`### UNREFERENCED (${unreferenced.length}) — no reference anywhere outside the schema`);
  lines.push("");
  if (unreferenced.length === 0) {
    lines.push(`✅ None.`);
  } else {
    lines.push(`| Model | Field | Type | Schema line |`);
    lines.push(`|---|---|---|---|`);
    for (const f of unreferenced) {
      lines.push(`| \`${f.model}\` | \`${f.field}\` | ${f.type} | \`schema.prisma:${f.line}\` |`);
    }
  }
  lines.push("");
  lines.push(`### BACKEND_ONLY (${backendOnly.length}) — server-side use, no UI surface`);
  lines.push("");
  if (backendOnly.length === 0) {
    lines.push(`✅ None.`);
  } else {
    lines.push(`| Model | Field | Type | Backend files | Schema line |`);
    lines.push(`|---|---|---|---|---|`);
    for (const f of backendOnly) {
      lines.push(
        `| \`${f.model}\` | \`${f.field}\` | ${f.type} | ${f.backendRefs} | \`schema.prisma:${f.line}\` |`,
      );
    }
  }
  lines.push("");

  // ── Pass 4 detail
  lines.push(`## Pass 4 — List rows with Delete-only actions`);
  lines.push("");
  lines.push(`React \`.map(...)\` list renders that contain a Delete/Remove action but no apparent Edit/Update affordance. Heuristic — flags rows where AE has no path to update what they created.`);
  lines.push("");
  if (listRenders.length === 0) {
    lines.push(`✅ No Delete-only list rows found.`);
  } else {
    lines.push(`| File:Line | Snippet |`);
    lines.push(`|---|---|`);
    for (const r of listRenders) {
      lines.push(`| \`${relPath(r.file)}:${r.line}\` | \`${r.snippet.replace(/\|/g, "\\|")}\` |`);
    }
  }
  lines.push("");

  lines.push(`## Notes`);
  lines.push("");
  lines.push(`- Pass 3 (form-vs-schema diff) deferred to v2 — needs explicit form→model mapping table.`);
  lines.push(`- All findings are *candidates*. Cross-check against existing §13.3 backlog before logging duplicates.`);
  lines.push(`- Re-run after each commit to track delta. Goal is to drive these counts to zero (or down to documented exclusions).`);
  lines.push("");

  return lines.join("\n");
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  console.error("[audit] Walking backend routes...");
  const endpoints = extractEndpoints();
  console.error(`[audit] Found ${endpoints.length} mutating endpoints (PUT/PATCH/DELETE).`);

  console.error("[audit] Walking frontend...");
  const frontendFiles = walkFiles(FRONTEND_SRC, [".tsx", ".ts"]);
  const frontendCache = new Map<string, string>();
  console.error(`[audit] Indexing ${frontendFiles.length} frontend files...`);

  console.error("[audit] Pass 1 — checking endpoint callers...");
  // v2 — grade every endpoint, then keep only the ones without an EXACT caller.
  // PATTERN findings stay in the list but are reported separately: they are
  // likely live and only need a human to confirm the runtime value.
  const callsByVerb = extractFrontendCalls(frontendFiles, frontendCache);
  const gradedRaw: GradedEndpoint[] = endpoints.map((ep) => ({ ...ep, ...classifyEndpoint(ep, callsByVerb) }));
  // An UNRESOLVED endpoint carrying a written verdict is DISPOSITIONED: still
  // reported, still visible, but no longer counted as an open question.
  const graded = gradedRaw.map((e) =>
    e.confidence === "UNRESOLVED" && e.disposition
      ? { ...e, confidence: "DISPOSITIONED" as Confidence }
      : e,
  );
  const orphanEndpoints = graded.filter((e) => e.confidence !== "EXACT");
  const unresolvedCount = orphanEndpoints.filter((e) => e.confidence === "UNRESOLVED").length;
  const patternCount = orphanEndpoints.filter((e) => e.confidence === "PATTERN").length;
  const dispositionedCount = orphanEndpoints.filter((e) => e.confidence === "DISPOSITIONED").length;
  // Tripwire. If the annotation reader silently matched nothing while notes are
  // present in the tree, this pass would quietly go back to re-asking settled
  // questions — the §19 Sub-pattern 16 failure, in a tool whose whole job is
  // reporting. Fail loudly instead.
  const notesInTree = gradedRaw.filter((e) => e.disposition).length;
  if (notesInTree === 0) {
    console.error("[audit] WARNING: no audit-pass1 notes found. The reader may have broken.");
  }
  console.error(
    `[audit] Pass 1: ${unresolvedCount} UNRESOLVED, ${dispositionedCount} DISPOSITIONED (verdict on file), ${patternCount} PATTERN (likely live), ${endpoints.length - orphanEndpoints.length} EXACT.`,
  );

  console.error("[audit] Pass 2 — checking schema field references...");
  const schemaFields = extractSchemaFields().filter((f) => !COMMON_FIELDS.has(f.field));
  // Backend files too — a field the server reads is not an orphan just because
  // no screen shows it. Counting only the frontend made every audit column look
  // dead and buried the handful that genuinely are.
  const backendFiles = walkFiles(BACKEND_SRC, [".ts"]);
  const backendCache = new Map<string, string>();
  const orphanFields: Array<SchemaField & { refs: number; backendRefs: number; category: FieldCategory }> = [];
  for (const f of schemaFields) {
    const refs = fieldReferenceCount(f.field, frontendFiles, frontendCache);
    if (refs > 0) continue;
    const backendRefs = fieldReferenceCount(f.field, backendFiles, backendCache);
    const category = categorizeField(f.field, refs, backendRefs);
    if (category) orphanFields.push({ ...f, refs, backendRefs, category });
  }
  const unreferenced = orphanFields.filter((f) => f.category === "UNREFERENCED");
  const backendOnly = orphanFields.filter((f) => f.category === "BACKEND_ONLY");
  console.error(
    `[audit] Pass 2: ${unreferenced.length} UNREFERENCED, ${backendOnly.length} BACKEND_ONLY (of ${schemaFields.length} non-common fields).`,
  );

  console.error("[audit] Pass 4 — scanning list-row action patterns...");
  const listRenders = findListRenders(frontendFiles, frontendCache);
  console.error(`[audit] Pass 4: ${listRenders.length} Delete-only list row(s).`);

  const report = buildReport(endpoints, orphanEndpoints, schemaFields, orphanFields, listRenders);

  // Ensure report dir exists
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const reportPath = path.join(REPORT_DIR, `audit-${stamp}.md`);
  fs.writeFileSync(reportPath, report);
  console.error(`\n[audit] Report written to: ${relPath(reportPath)}`);
  console.error(`[audit] Total findings: ${unresolvedCount + unreferenced.length + listRenders.length} (Pass 1 counts UNRESOLVED only; Pass 2 counts UNREFERENCED only; ${patternCount} PATTERN listed separately)`);

  // Echo to stdout for piping
  process.stdout.write(report);
}

main();
