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
 */

import * as fs from "fs";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKEND_ROUTES = path.join(REPO_ROOT, "backend/src/routes");
const FRONTEND_SRC = path.join(REPO_ROOT, "frontend/src");
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
}

function extractEndpoints(): Endpoint[] {
  const files = walkFiles(BACKEND_ROUTES, [".ts"]);
  const endpoints: Endpoint[] = [];
  // Match: router.put("/:id/foo/:bar", ...
  // Match: router.patch('/customers/:id/facilities/:facilityId', ...
  const re = /router\.(put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  for (const file of files) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      re.lastIndex = 0;
      if (m && MUTATING_VERBS.includes(m[1].toLowerCase() as any)) {
        endpoints.push({
          verb: m[1].toUpperCase(),
          path: m[2],
          file,
          line: i + 1,
        });
      }
    }
  }
  return endpoints;
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
  orphanEndpoints: Endpoint[],
  schemaFields: SchemaField[],
  orphanFields: Array<SchemaField & { refs: number }>,
  listRenders: ListRender[],
): string {
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
  lines.push(`| 1 — Orphan endpoints (PUT/PATCH/DELETE w/o caller) | ${endpoints.length} | **${orphanEndpoints.length}** |`);
  lines.push(`| 2 — Orphan schema fields (low frontend refs) | ${schemaFields.length} | **${orphanFields.length}** |`);
  lines.push(`| 4 — List rows (Delete-only, no Edit) | — | **${listRenders.length}** |`);
  lines.push("");

  // ── Pass 1 detail
  lines.push(`## Pass 1 — Orphan endpoints`);
  lines.push("");
  lines.push(`Backend mutating routes (\`PUT\` / \`PATCH\` / \`DELETE\`) where no frontend file appears to call them. False positives possible — heuristic checks for static parts of the URL + matching \`api.<verb>\` call in the same file. Manually verify before logging as a backlog item.`);
  lines.push("");
  if (orphanEndpoints.length === 0) {
    lines.push(`✅ No orphan endpoints found.`);
  } else {
    lines.push(`| Verb | Path | Source |`);
    lines.push(`|---|---|---|`);
    for (const ep of orphanEndpoints) {
      lines.push(`| ${ep.verb} | \`${ep.path}\` | \`${relPath(ep.file)}:${ep.line}\` |`);
    }
  }
  lines.push("");

  // ── Pass 2 detail
  lines.push(`## Pass 2 — Orphan schema fields`);
  lines.push("");
  lines.push(`Prisma model fields with **zero references** in any \`frontend/src/**/*.tsx\` file. Common boilerplate names (id, status, name, email, etc.) excluded. A non-zero count doesn't guarantee the field is *captured by a form* — it just means the name appears somewhere; manual check needed for that.`);
  lines.push("");
  if (orphanFields.length === 0) {
    lines.push(`✅ No fields with zero frontend refs (after excluding common names).`);
  } else {
    lines.push(`| Model | Field | Type | Schema line |`);
    lines.push(`|---|---|---|---|`);
    for (const f of orphanFields) {
      lines.push(`| \`${f.model}\` | \`${f.field}\` | ${f.type} | \`schema.prisma:${f.line}\` |`);
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
  const orphanEndpoints = endpoints.filter((ep) => !endpointHasCaller(ep, frontendFiles, frontendCache));
  console.error(`[audit] Pass 1: ${orphanEndpoints.length} orphan endpoint(s).`);

  console.error("[audit] Pass 2 — checking schema field references...");
  const schemaFields = extractSchemaFields().filter((f) => !COMMON_FIELDS.has(f.field));
  const orphanFields: Array<SchemaField & { refs: number }> = [];
  for (const f of schemaFields) {
    const refs = fieldReferenceCount(f.field, frontendFiles, frontendCache);
    if (refs === 0) {
      orphanFields.push({ ...f, refs });
    }
  }
  console.error(`[audit] Pass 2: ${orphanFields.length} orphan field(s) (of ${schemaFields.length} non-common fields).`);

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
  console.error(`[audit] Total findings: ${orphanEndpoints.length + orphanFields.length + listRenders.length}`);

  // Echo to stdout for piping
  process.stdout.write(report);
}

main();
