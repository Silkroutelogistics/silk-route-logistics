/**
 * Proof for the fail-safe load number generator (item 2): the real SQL, the real
 * advisory lock and the real setval, on Postgres. The unit tests run on a
 * stand-in; a stand-in cannot show that Prisma accepts `SELECT
 * pg_advisory_xact_lock(...)` through $executeRaw, that the CASE guard survives
 * the planner, or that two connections serialise on the lock.
 *
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= DATABASE_URL=<local> \
 *   npx tsx scripts/_arc-load-number-failsafe-proof.ts
 *
 * Needs the migration chain applied and the seed run: it renumbers a few seeded
 * loads and puts them back. Local containers only; any other host is refused.
 */
import { hostOf, isLocalHost } from "./prisma-target-guard";

const url = process.env.DATABASE_URL ?? "";
if (!url || !isLocalHost(hostOf(url))) {
  console.error("[failsafe-proof] REFUSED: a local DATABASE_URL only.");
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

(async () => {
  const { prisma } = await import("../src/config/database");
  const { generateLoadNumber, highestLoadNumberAtOrAboveFloor } = await import("../src/lib/documentNumber");
  const setSeq = (v: number) => prisma.$executeRawUnsafe(`SELECT setval('load_number_seq', ${v}, true)`);
  const loads = await prisma.load.findMany({ take: 6, orderBy: { createdAt: "asc" }, select: { id: true, loadNumber: true, referenceNumber: true } });
  if (loads.length < 6) throw new Error("needs six seeded loads: run the seed first");
  const renumber = (i: number, loadNumber: string, referenceNumber: string) =>
    prisma.load.update({ where: { id: loads[i].id }, data: { loadNumber, referenceNumber } });
  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 121498`);

    // Production's shape: 5001-5003 issued below the floor, the last legacy load,
    // an L- number and a non-numeric value the cast must never reach.
    await renumber(0, "5001", "P-A");
    await renumber(1, "5002", "P-B");
    await renumber(2, "5003", "P-C");
    await renumber(3, "SRL-121497", "P-D");
    await renumber(4, "L2228322560", "SRL-ABC");
    check("the highest-number query runs on real rows, and nothing at or above the floor is 0",
      (await highestLoadNumberAtOrAboveFloor(prisma as any)) === 0);

    await setSeq(5002);
    const first = await generateLoadNumber();
    check("FAIL-SAFE: the sequence at 5002 issues 121498", first === "121498", `got ${first}`);
    await renumber(5, "121498", "121498");
    const second = await generateLoadNumber();
    check("after 121498 the next is 121499, with no second lift", second === "121499", `got ${second}`);

    await setSeq(5003);
    await renumber(5, loads[5].loadNumber ?? "P-F", loads[5].referenceNumber);
    const prod = await generateLoadNumber();
    check("production as it stands (sequence at 5003, 5003 issued) also issues 121498", prod === "121498", `got ${prod}`);

    // A number held only in referenceNumber, in the retired SRL- spelling.
    await renumber(5, "P-F2", "SRL-121600");
    await setSeq(121497);
    const twin = await generateLoadNumber();
    check("a number held in referenceNumber as SRL-121600 is never issued again", twin === "121601", `got ${twin}`);
    await renumber(5, loads[5].loadNumber ?? "P-F", loads[5].referenceNumber);

    // Eight creators who all find the sequence unmoved, on eight connections. A
    // barrier holds every lift until all eight have drawn below the floor, so the
    // redraw under the lock is the only thing standing between them and a
    // duplicate. Without it this case passed with the redraw removed, because the
    // first lift could finish before the others drew (recorded, v1 of this proof).
    await setSeq(5002);
    let arrived = 0;
    let release!: () => void;
    const allDrawn = new Promise<void>((r) => (release = r));
    const gated: any = new Proxy(prisma as any, {
      get(t: any, p) {
        if (p === "$transaction") return async (fn: any, opts: any) => { if (++arrived === 8) release(); await allDrawn; return t.$transaction(fn, opts); };
        const v = t[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`only ${arrived} of 8 reached the lift`)), 30_000));
    const got = await Promise.race([Promise.all(Array.from({ length: 8 }, () => generateLoadNumber(gated))), timeout]);
    check("all eight creators drew below the floor and reached the lift", arrived === 8, `${arrived}`);
    const sorted = got.map(Number).sort((a, b) => a - b);
    check("eight concurrent creators on an unmoved sequence issue eight distinct numbers from 121498",
      new Set(got).size === 8 && sorted[0] === 121498 && sorted.every((n) => n >= 121498), sorted.join(","));
  } finally {
    for (let i = 0; i < loads.length; i++) {
      await prisma.load.update({ where: { id: loads[i].id }, data: { loadNumber: `P-RESET-${i}`, referenceNumber: `P-RESETR-${i}` } }).catch(() => {});
    }
    for (let i = 0; i < loads.length; i++) {
      await prisma.load.update({ where: { id: loads[i].id }, data: { loadNumber: loads[i].loadNumber, referenceNumber: loads[i].referenceNumber } }).catch((e: any) => console.error("restore failed", loads[i].id, e?.message));
    }
    await prisma.$disconnect();
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
