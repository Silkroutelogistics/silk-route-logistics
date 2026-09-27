/**
 * Rehearsal for scripts/renumber-load-5003.ts, LOCAL ONLY, on a seeded container: a load 5003
 * holding production's shape, the sequence where production has it (last_value 5003); then a rate
 * confirmation and a tracking token each keep the number, a dry run writes nothing, execute
 * renumbers through the generator, and a second run does nothing.
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= DATABASE_URL=<local> npx tsx scripts/_arc-renumber-5003-rehearsal.ts
 */
import path from "path";
import { spawnSync } from "child_process";
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { RECORDED_BY } from "./_bknTipaltiPlan";

if (!isLocalHost(hostOf(process.env.DATABASE_URL ?? ""))) { console.error("REFUSED: a local DATABASE_URL only"); process.exit(2); }
const B = path.resolve(__dirname, "..");
const ID = "rehearsal-load-5003";
let p: any; // the shared client (ownPrismaClientCensus)
let pass = 0, fail = 0; const check = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`); };
const run = (...args: string[]) => {
  const r = spawnSync("npx", ["tsx", "scripts/renumber-load-5003.ts", ...args], { cwd: B, encoding: "utf8", shell: process.platform === "win32",
    env: { ...process.env, RESEND_API_KEY: "", OPENPHONE_API_KEY: "", QUO_API_KEY: "", PRISMA_TARGET: "" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const strip = (row: any, drop: string[]) => Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== null && !["id", "createdAt", "updatedAt", ...drop].includes(k)));
const seq = async () => (await p.$queryRawUnsafe("SELECT last_value, is_called FROM load_number_seq"))[0];
const numbers = async () => p.load.findUnique({ where: { id: ID }, select: { loadNumber: true, referenceNumber: true, srlBolNumber: true } });

(async () => {
  p = (await import("../src/config/database")).prisma;
  const { formatDocumentNumber, generateLoadNumber } = await import("../src/lib/documentNumber");
  const { loadNumberSeqInfo } = await import("../src/lib/loadNumberSeqInfo");
  await p.auditTrail.deleteMany({ where: { entityId: ID } });
  await p.load.deleteMany({ where: { OR: [{ id: ID }, { loadNumber: "5003" }, { referenceNumber: "5003" }] } });
  const src = await p.load.findFirst({ where: { deletedAt: null } });
  await p.load.create({ data: { ...strip(src, ["loadNumber", "referenceNumber", "shipperCode", "srlBolNumber", "trackingToken", "carrierId", "posterId", "status"]),
    id: ID, loadNumber: "5003", referenceNumber: "5003", srlBolNumber: "5003", status: "POSTED", posterId: RECORDED_BY } });
  await p.$executeRawUnsafe("CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 121498");
  await p.$executeRawUnsafe("SELECT setval('load_number_seq', 5003, true)");
  const untouched = async () => (await numbers())?.loadNumber === "5003" && Number((await seq()).last_value) === 5003;

  const rc = await p.rateConfirmation.create({ data: { loadId: ID, formData: {}, createdById: RECORDED_BY } });
  let r = run("--execute");
  check("a rate confirmation keeps the number: refused, nothing written", r.code === 2 && /STAYS: 1 rate confirmation/.test(r.out) && (await untouched()), `exit ${r.code}`);
  await p.rateConfirmation.delete({ where: { id: rc.id } });

  const tok = await p.shipperTrackingToken.create({ data: { loadId: ID, token: "RHRSL5003TOK", shipperId: src.customerId, accessLevel: "STATUS_ONLY", expiresAt: new Date(Date.now() + 864e5) } });
  r = run("--execute");
  check("a printed BOL (tracking token) keeps the number: refused, nothing written", r.code === 2 && /STAYS: 1 shipper tracking token/.test(r.out) && (await untouched()), `exit ${r.code}`);
  await p.shipperTrackingToken.delete({ where: { id: tok.id } });

  const planned = (await loadNumberSeqInfo(p)).next;
  r = run();
  check("dry run: plans the generator's next number and writes nothing", r.code === 0 && r.out.includes(`PLAN 5003 -> ${planned}`) && /DRY RUN/.test(r.out) && (await untouched()), `exit ${r.code}, planned ${planned}`);

  r = run("--execute");
  const after = await numbers();
  const n = String(planned);
  check("execute: renumbered to the planned number", r.code === 0 && r.out.includes(`EXECUTED: 5003 -> ${n}`) && after?.loadNumber === n && after?.referenceNumber === n, JSON.stringify(after));
  check("the BOL number follows the load number", after?.srlBolNumber === formatDocumentNumber(n, "BOL"), String(after?.srlBolNumber));
  check("one audit row names the renumber", (await p.auditTrail.count({ where: { entityId: ID, changedFields: { path: ["actionDetail"], equals: "RENUMBER_OUT_OF_SERIES_LOAD" } } })) === 1);
  check("one load-activity line tells the AE", (await p.loadActivity.count({ where: { loadId: ID, eventType: "load_renumbered" } })) === 1);
  check("the next load continues after it", (await generateLoadNumber()) === String(Number(n) + 1));

  r = run("--execute");
  check("a second run does nothing", r.code === 0 && /nothing to do: no live load holds 5003/.test(r.out) && (await p.auditTrail.count({ where: { entityId: ID } })) === 1, `exit ${r.code}`);
  await p.$disconnect(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await p?.$disconnect(); process.exit(1); });
