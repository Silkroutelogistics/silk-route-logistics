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
  const mk = async (tag: string, n: number) => {
    const u = await prisma.user.create({
      data: {
        email: `${tag}-${stamp}@arc23.invalid`, passwordHash: "x",
        firstName: "T23", lastName: tag, role: "CARRIER",
        company: `${tag} Trucking LLC`, phone: "+12695550199",
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

  const subject = await mk("subj", 1);
  const other = await mk("othr", 2);
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
  check("confirming does NOT write chameleonRiskLevel",
    riskBefore === riskAfter,
    `${riskBefore ?? "null"} -> ${riskAfter ?? "null"} (unchanged; that field is read as a BLOCK, see Item 229)`);

  const { complianceCheck } = await import("../src/services/complianceMonitorService");
  const verdict = await complianceCheck(subject.id);
  const authorityNoise = (verdict.blocked_reasons || []).filter((r: string) => !r.startsWith("AUTHORITY_"));
  check("CONFIRMING NEVER AUTO-BLOCKS the carrier",
    !authorityNoise.some((r: string) => r.toLowerCase().includes("chameleon")),
    `non-authority blocks: ${authorityNoise.length ? authorityNoise.join(" | ") : "none"}`);

  // ── 6. vacuity tripwire ──────────────────────────────────────────────
  const mine = await prisma.chameleonMatch.count({ where: { carrierId: subject.id } });
  const mineOpen = await prisma.chameleonMatch.count({ where: { carrierId: subject.id, status: "OPEN" } });
  check("the zero above is real, not an empty seed",
    mine === 2 && mineOpen === 0,
    `this run seeded ${mine} matches for the subject, ${mineOpen} still OPEN — the count moved because the reviews landed`);

  server.close();
  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "REVIEW AFFORDANCE WORKS — the count falls, confirmed stays visible, nothing auto-blocks" : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
