/**
 * ARC 23 PHASE 1 — the chameleon review affordance, proved live.
 *
 * Item 228.3: the card rendered matches read-only, so they accrued OPEN forever
 * and the count an AE saw never fell. A fraud signal nobody can act on decays
 * into background noise — the same decay Item 192 fixed for risk emails, here
 * reached by an unwired endpoint rather than a flooding cron.
 *
 * The load-bearing assertion is NOT "the endpoint returns 200". It is that the
 * OPEN count an AE reads actually falls, that a confirmed match stays visible
 * rather than vanishing, and that confirming does NOT auto-block the carrier.
 *
 * Presence is not function (§19 Sub-pattern 16): every claim goes through the
 * real router over HTTP with a real admin session, never through a reproduction
 * of what the endpoint does.
 *
 * SAFETY: rehearsal container only; both outbound keys explicitly EMPTY.
 * reviewChameleonMatch is a pure DB write — no Resend, no OpenPhone on this path.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("55432") && !url.includes("55433") && !url.includes("55434")) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container."); process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: rehearsal DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55823;
const BASE = `http://127.0.0.1:${PORT}/api`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((resolve) => {
    const srv = app.listen(PORT, "127.0.0.1", () => resolve(srv));
  });
  console.log(`app: real router mounted on :${PORT}\n`);

  const stamp = Date.now();
  // v3.8.bbw — every fixture user is `<tag>-<stamp>@arc23.invalid`, so they
  // all share a DOMAIN. Under the domain-only EMAIL rule that made every pair
  // here a match, and this proof was green for a reason it never asserted.
  // The evidence subj and othr share is now a PHONE, stated per fixture; dom
  // shares nothing but the domain and must NOT match.
  const mk = async (tag: string, n: number, phone: string) => {
    const u = await prisma.user.create({
      data: {
        email: `${tag}-${stamp}@arc23.invalid`, passwordHash: "x",
        firstName: "T23", lastName: tag, role: "CARRIER",
        company: `${tag} Trucking LLC`, phone,
      },
    });
    return prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `${tag} Trucking LLC`,
        mcNumber: `MC-T23-${tag}-${stamp}`.slice(0, 30),
        dotNumber: `${String(stamp).slice(-6)}${n}`,
        onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
        equipmentTypes: ["DRY_VAN"], operatingRegions: ["Midwest"],
      },
    });
  };

  const sharedPhone = `+1269555${String(stamp).slice(-4)}`;
  const subject = await mk("subj", 1, sharedPhone);
  const other = await mk("othr", 2, sharedPhone);
  const domainOnly = await mk("dom", 3, `+1269556${String(stamp).slice(-4)}`);
  const admin = await prisma.user.create({
    data: { email: `adm-${stamp}@arc23.invalid`, passwordHash: "x", firstName: "T23", lastName: "Admin", role: "ADMIN" },
  });

  // Two OPEN matches: one an AE will clear, one an AE will confirm.
  const toClear = await prisma.chameleonMatch.create({
    data: { carrierId: subject.id, matchedCarrierId: other.id, matchType: "ADDRESS", riskScore: 55, status: "OPEN" },
  });
  const toConfirm = await prisma.chameleonMatch.create({
    data: { carrierId: subject.id, matchedCarrierId: other.id, matchType: "EIN", riskScore: 90, status: "OPEN" },
  });

  const cookie = `srl_token_ae=${jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`;
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const signals = async () => {
    const r = await fetch(`${BASE}/carriers/${subject.id}/security-signals`, { headers: H });
    if (!r.ok) return { matches: [] as any[], status: r.status };
    const j: any = await r.json();
    return { matches: (j.chameleonMatches || []) as any[], status: r.status };
  };
  const openCount = (m: any[]) => m.filter((x) => x.status === "OPEN").length;

  // ── 1. baseline ──────────────────────────────────────────────────────
  const s0 = await signals();
  check("the card's own endpoint reports both matches OPEN",
    s0.status === 200 && s0.matches.length === 2 && openCount(s0.matches) === 2,
    `HTTP ${s0.status}, ${s0.matches.length} listed, ${openCount(s0.matches)} OPEN`);

  const riskBefore = (await prisma.carrierProfile.findUnique({ where: { id: subject.id } }))!.chameleonRiskLevel;

  // ── 2. clear one ─────────────────────────────────────────────────────
  const rClear = await fetch(`${BASE}/carriers/chameleon-matches/${toClear.id}/review`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ status: "DISMISSED", notes: "Shared virtual-office address; unrelated owners. Verified by phone." }),
  });
  check("an admin can clear a match through the real endpoint", rClear.status === 200, `HTTP ${rClear.status}`);

  const s1 = await signals();
  check("THE COUNT FALLS — this is the whole point of the arc",
    openCount(s1.matches) === 1,
    `OPEN went ${openCount(s0.matches)} -> ${openCount(s1.matches)}`);
  check("a cleared match stops nagging (drops off the card)",
    !s1.matches.some((m) => m.id === toClear.id),
    `cleared match listed: ${s1.matches.some((m) => m.id === toClear.id)}`);

  // ── 3. confirm the other ─────────────────────────────────────────────
  const rConfirm = await fetch(`${BASE}/carriers/chameleon-matches/${toConfirm.id}/review`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ status: "CONFIRMED_FRAUD", notes: "Same EIN as an existing MC; owner operating a second authority." }),
  });
  check("an admin can confirm a match as real risk", rConfirm.status === 200, `HTTP ${rConfirm.status}`);

  const s2 = await signals();
  check("OPEN reaches zero once the queue is worked",
    openCount(s2.matches) === 0, `${openCount(s2.matches)} OPEN remaining`);
  check("A CONFIRMED MATCH STAYS VISIBLE — it used to vanish, which was backwards",
    s2.matches.some((m) => m.id === toConfirm.id && m.status === "CONFIRMED_FRAUD"),
    `confirmed match listed: ${s2.matches.some((m) => m.id === toConfirm.id)}`);

  // ── 4. the note and reviewer are recorded ────────────────────────────
  const row = await prisma.chameleonMatch.findUnique({ where: { id: toConfirm.id } });
  check("the reviewer, the timestamp and the note are all persisted",
    row?.reviewedById === admin.id && !!row?.reviewedAt && !!row?.reviewNotes,
    `reviewedBy=${row?.reviewedById === admin.id}, at=${!!row?.reviewedAt}, note=${(row?.reviewNotes || "").slice(0, 34)}...`);

  // auditLog() writes prisma.auditLog, not auditTrail — the two parallel audit
  // tables of §13.3 Item 61. It is fire-and-forget inside res.json, so the row
  // can land microseconds after the response; poll briefly rather than race it.
  let audit = null as null | { action: string; entity: string };
  for (let i = 0; i < 20 && !audit; i++) {
    audit = await prisma.auditLog.findFirst({
      where: { entity: "ChameleonMatch" }, orderBy: { createdAt: "desc" },
      select: { action: true, entity: true },
    });
    if (!audit) await new Promise((r) => setTimeout(r, 100));
  }
  check("an audit row lands (the route carried no auditLog before this arc)",
    !!audit, audit ? `AuditLog ${audit.action} on ${audit.entity}` : "no AuditLog row after 2s");

  // ── 5. deductions, not verdicts ──────────────────────────────────────
  const riskAfter = (await prisma.carrierProfile.findUnique({ where: { id: subject.id } }))!.chameleonRiskLevel;
  // Arc 24 (§14, Item 231) reversed the Arc 23 posture: confirming a match
  // RECOMPUTES the level from the standing rows and KEEPS the block. The two
  // assertions below asserted the retired posture and had been red since.
  check("confirming recomputes chameleonRiskLevel from the standing rows (Item 231)",
    riskAfter === "HIGH",
    `${riskBefore ?? "null"} -> ${riskAfter ?? "null"} (a CONFIRMED_FRAUD at 90 is HIGH; that field is read as a BLOCK)`);

  const { complianceCheck } = await import("../src/services/complianceMonitorService");
  const verdict = await complianceCheck(subject.id);
  const authorityNoise = (verdict.blocked_reasons || []).filter((r: string) => !r.startsWith("AUTHORITY_"));
  const chameleonBlock = authorityNoise.find((r: string) => r.toLowerCase().includes("chameleon"));
  check("a CONFIRMED match BLOCKS the carrier, and the block names its exit (Item 231)",
    !!chameleonBlock && /security signals/i.test(chameleonBlock),
    chameleonBlock ? chameleonBlock.slice(0, 110) + "…" : `no chameleon block among: ${authorityNoise.join(" | ") || "none"}`);

  // ── 6. vacuity tripwire ──────────────────────────────────────────────
  const mine = await prisma.chameleonMatch.count({ where: { carrierId: subject.id } });
  const mineOpen = await prisma.chameleonMatch.count({ where: { carrierId: subject.id, status: "OPEN" } });
  check("the zero above is real, not an empty seed",
    mine === 2 && mineOpen === 0,
    `this run seeded ${mine} matches for the subject, ${mineOpen} still OPEN — the count moved because the reviews landed`);

  // ── 7. the matcher itself: PHONE is evidence, a shared mail domain is not ──
  // (v3.8.bbv/bbw) Runs LAST so the review flow above is undisturbed. The
  // subj–othr pair already carries a CONFIRMED_FRAUD row, so the rescan adds
  // no row for it, retires nothing, and the level it writes is what the
  // review path reads.
  const { buildFingerprint, checkChameleon, recomputeChameleonRiskLevel } = await import("../src/services/chameleonDetectionService");
  await buildFingerprint(other.id); await buildFingerprint(domainOnly.id);
  const scan = await checkChameleon(subject.id);
  const othrMatch = scan.matches.find((m) => m.matchedCarrierId === other.id);
  check("subj matches othr on PHONE and on PHONE ALONE — the shared domain is not evidence",
    !!othrMatch && othrMatch.fields.length === 1 && othrMatch.fields[0] === "PHONE",
    othrMatch ? `fields=${othrMatch.fields.join(",")}` : "no match for othr at all");
  check("a carrier sharing ONLY the mail domain does NOT match",
    !scan.matches.some((m) => m.matchedCarrierId === domainOnly.id),
    `matched ids: ${scan.matches.map((m) => m.matchedCarrierId === domainOnly.id ? "dom" : "othr").join(",") || "none"}`);
  const rowsAfterScan = await prisma.chameleonMatch.count({ where: { carrierId: subject.id } });
  const openAfterScan = await prisma.chameleonMatch.count({ where: { carrierId: subject.id, status: "OPEN" } });
  check("the rescan neither duplicates the judged pair nor reopens it",
    rowsAfterScan === 2 && openAfterScan === 0, `${rowsAfterScan} rows, ${openAfterScan} OPEN`);
  const recomputed = await recomputeChameleonRiskLevel(subject.id);
  check("parity: the scan wrote the level a review would compute",
    scan.riskLevel === recomputed && recomputed === "HIGH", `scan=${scan.riskLevel} recompute=${recomputed}`);

  server.close();
  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "REVIEW AFFORDANCE WORKS — the count falls, confirmed stays visible and blocks (Item 231), the matcher reads inboxes not domains (bbv)" : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
