/**
 * ARC 26 — BLANKET OVERRIDE IS EVALUATE-THEN-RELEASE; HARD FLOORS ABSOLUTE.
 *
 * Before this, `complianceCheck` returned at the top the moment a blanket
 * override existed:
 *
 *     if (activeBlanketOverride) {
 *       return { allowed: true, blocked_reasons: [], blocked_codes: [], warnings: [...] };
 *     }
 *
 * So the gate waived the two things this codebase declares un-waivable. The
 * override endpoint 409s HARD_FLOOR_NOT_OVERRIDABLE rather than mint against a
 * <12-month authority; the modal disables submit on AGREEMENT_TERMINATED. Both
 * were true and both were bypassable — mint a blanket override instead, and the
 * gate skipped the check that produced the floor in the first place. Three
 * places agreed with each other and the fourth, the one that decides, did not.
 *
 * The empty `blocked_codes` mattered independently: the frontend learns which
 * blocks are non-waivable from that array, so a blanket override didn't just
 * release the floor, it hid the fact that a floor had ever fired.
 *
 * Proves, in both directions:
 *   1. terminated + blanket   → STILL BLOCKED, code returned
 *   2. authority <12mo + blanket → STILL BLOCKED, code returned
 *   3. insurance lapse + chameleon-unreviewed + blanket → both released, both NAMED
 *   4. blanket expiry → the blocks come back
 *   5. floors and waivables together → floor blocks, waivable released, one verdict
 *   6. waterfall parity: the batched path applies floors identically
 *
 * SAFETY: rehearsal container only (port 5544x); outbound keys explicitly EMPTY.
 * No email, no SMS, no shipper notify is reachable — the guard refuses to start
 * otherwise, and refuses on a key that is merely *unset* rather than empty,
 * because dotenv would fill an unset key from backend/.env, which holds the
 * production Resend key. That exact near-miss is Arc 15.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  if (!/5544[0-9]/.test(process.env.DATABASE_URL || "")) {
    console.error("REFUSING: not an Arc 26 rehearsal container.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    if (process.env[k] !== "") {
      console.error(`REFUSING: ${k} must be explicitly EMPTY (is: ${process.env[k] === undefined ? "unset" : "set"}).`);
      process.exit(1);
    }
  }
  console.log("guard: rehearsal DB on 5544x; RESEND + OPENPHONE explicitly empty\n");
}
guard();

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const { complianceCheck, complianceCheckMany } = await import("../src/services/complianceMonitorService");

  const stamp = Date.now();
  let seq = 0;

  /** A carrier that passes every check, so each case isolates ONE failure. */
  const mkCarrier = async (tag: string) => {
    const i = ++seq;
    const u = await prisma.user.create({
      data: {
        email: `a26-${tag}-${stamp}@arc26.invalid`,
        passwordHash: "x", firstName: "A26", lastName: tag, role: "CARRIER",
        company: `A26 ${tag}`,
        // Unique per carrier — a shared phone makes the chameleon detector
        // legitimately match them to each other, which is how Arc 24 wasted a run.
        phone: `+1269${String(stamp).slice(-5)}${String(i).padStart(2, "0")}`,
      },
    });
    return prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `A26 ${tag}`,
        mcNumber: `MC-A26-${tag}-${stamp}`.slice(0, 30),
        dotNumber: `${String(stamp).slice(-5)}${String(700 + i)}`,
        onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
        equipmentTypes: ["DRY_VAN"], operatingRegions: ["Midwest"],
        insuranceExpiry: new Date(Date.now() + 365 * 864e5),
        lastVettingScore: 85, lastVettingRisk: "LOW",
        // Well past the 18-month minimum unless a case overrides it.
        authorityGrantedDate: new Date(Date.now() - 5 * 365 * 864e5),
      },
    });
  };

  const signBca = (carrierId: string, extra: Record<string, unknown> = {}) =>
    prisma.carrierAgreement.create({
      data: {
        carrierId, templateName: "broker-carrier", version: "arc26",
        status: "SIGNED", signedAt: new Date(), signedByName: "A26", ...extra,
      },
    });

  const admin = await prisma.user.create({
    data: { email: `a26-adm-${stamp}@arc26.invalid`, passwordHash: "x", firstName: "A26", lastName: "Adm", role: "ADMIN" },
  });

  const blanket = (carrierId: string, ms = 3600_000) =>
    prisma.complianceOverride.create({
      data: {
        carrierId, adminId: admin.id, checkCode: null,
        reason: "Arc 26 blanket — evaluate-then-release.",
        expiresAt: new Date(Date.now() + ms),
      },
    });

  const codes = (v: { blocked_codes: Array<{ code: string }> }) => v.blocked_codes.map((c) => c.code);

  // ══ 1. TERMINATED AGREEMENT + BLANKET → still blocked ══════════════
  {
    const c = await mkCarrier("term");
    await signBca(c.id, {
      status: "TERMINATED", terminatedAt: new Date(),
      terminationReason: "Arc 26 proof — terminated then blanket-overridden.",
    });
    const before = await complianceCheck(c.id);
    await blanket(c.id);
    const after = await complianceCheck(c.id);

    check("1a. a terminated agreement blocks before any override",
      !before.allowed && codes(before).includes("AGREEMENT_TERMINATED"),
      `allowed=${before.allowed} codes=[${codes(before)}]`);

    check("1b. TERMINATED + BLANKET → STILL BLOCKED (the gate no longer skips the check)",
      !after.allowed,
      `allowed=${after.allowed} — before Arc 26 this was true, and the carrier could be tendered`);

    check("1c. the non-waivable code is RETURNED, not swallowed by an empty array",
      codes(after).includes("AGREEMENT_TERMINATED"),
      `codes=[${codes(after)}] — the old return sent blocked_codes:[] so the UI never learned a floor fired`);

    check("1d. the gate and the modal now agree",
      after.blocked_codes.every((bc) => bc.code !== "AGREEMENT_TERMINATED" || bc.overridable === false),
      `AGREEMENT_TERMINATED overridable=false, and the modal disables submit on exactly that`);
  }

  // ══ 2. AUTHORITY <12 MONTHS + BLANKET → still blocked ══════════════
  {
    const c = await mkCarrier("young");
    await signBca(c.id);
    await prisma.carrierProfile.update({
      where: { id: c.id },
      // ~6 months: under the 12-month floor, so not even scoped-overridable.
      data: { authorityGrantedDate: new Date(Date.now() - 183 * 864e5), approvedAt: new Date() },
    });
    await blanket(c.id);
    const after = await complianceCheck(c.id);

    check("2a. AUTHORITY <12mo + BLANKET → STILL BLOCKED",
      !after.allowed && codes(after).includes("AUTHORITY_TOO_YOUNG"),
      `allowed=${after.allowed} codes=[${codes(after)}]`);

    check("2b. the gate agrees with the endpoint that 409s HARD_FLOOR_NOT_OVERRIDABLE",
      after.blocked_codes.some((bc) => bc.code === "AUTHORITY_TOO_YOUNG" && bc.overridable === false),
      `overridable=false — the endpoint refuses to mint for this, and now the gate refuses to honour one`);
  }

  // ══ 3. TWO WAIVABLES + BLANKET → both released AND both named ══════
  {
    const c = await mkCarrier("waive");
    await signBca(c.id);
    await prisma.carrierProfile.update({
      where: { id: c.id },
      data: {
        insuranceExpiry: new Date(Date.now() - 10 * 864e5), // lapsed
        chameleonRiskLevel: "HIGH",                          // unreviewed
      },
    });

    const before = await complianceCheck(c.id);
    check("3a. two independent waivable blocks fire before the override",
      !before.allowed && before.blocked_reasons.length >= 2,
      `${before.blocked_reasons.length} blocks: ${before.blocked_reasons.map((r) => r.slice(0, 40)).join(" | ")}`);

    await blanket(c.id);
    const after = await complianceCheck(c.id);

    check("3b. BOTH ARE RELEASED — the blanket still does its job",
      after.allowed && after.blocked_reasons.length === 0,
      `allowed=${after.allowed}, remaining blocks=${after.blocked_reasons.length}`);

    check("3c. and both are NAMED in `released`, not waived invisibly",
      after.released.length === before.blocked_reasons.length &&
        after.released.some((r) => /insurance/i.test(r)) &&
        after.released.some((r) => /chameleon|identity/i.test(r)),
      `released(${after.released.length}) = ${after.released.map((r) => r.slice(0, 45)).join(" | ")}`);

    check("3d. the AE sees WHAT was waived in the warning, not a bare allowed:true",
      after.warnings.some((w) => /released \d+ block/i.test(w)),
      `warning: "${after.warnings.find((w) => /released/i.test(w))?.slice(0, 110)}"`);
  }

  // ══ 4. FLOOR + WAIVABLE TOGETHER → partition, one verdict ══════════
  {
    const c = await mkCarrier("mixed");
    await signBca(c.id, {
      status: "TERMINATED", terminatedAt: new Date(), terminationReason: "Arc 26 mixed case.",
    });
    await prisma.carrierProfile.update({
      where: { id: c.id }, data: { insuranceExpiry: new Date(Date.now() - 10 * 864e5) },
    });
    await blanket(c.id);
    const v = await complianceCheck(c.id);

    check("4a. the floor survives the override and keeps the carrier blocked",
      !v.allowed && codes(v).includes("AGREEMENT_TERMINATED"),
      `allowed=${v.allowed} kept=[${v.blocked_reasons.map((r) => r.slice(0, 40))}]`);

    check("4b. the waivable one is released ALONGSIDE it — partition, not all-or-nothing",
      v.released.some((r) => /insurance/i.test(r)),
      `released=[${v.released.map((r) => r.slice(0, 45))}]`);

    check("4c. the AE is told the floor is not waivable by any override",
      v.warnings.some((w) => /not waivable by any override/i.test(w)),
      `warning: "${v.warnings.find((w) => /not waivable/i.test(w))?.slice(0, 110)}"`);
  }

  // ══ 5. EXPIRY → the blocks come back ═══════════════════════════════
  {
    const c = await mkCarrier("expiry");
    await signBca(c.id);
    await prisma.carrierProfile.update({
      where: { id: c.id }, data: { insuranceExpiry: new Date(Date.now() - 10 * 864e5) },
    });
    const ov = await blanket(c.id);
    const live = await complianceCheck(c.id);
    check("5a. while live, the waivable block is released",
      live.allowed && live.released.length === 1,
      `allowed=${live.allowed} released=${live.released.length}`);

    await prisma.complianceOverride.update({
      where: { id: ov.id }, data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const dead = await complianceCheck(c.id);
    check("5b. ON EXPIRY the block returns and `released` empties — 24h means 24h",
      !dead.allowed && dead.released.length === 0 && dead.blocked_reasons.length === 1,
      `allowed=${dead.allowed} blocks=${dead.blocked_reasons.length} released=${dead.released.length}`);
  }

  // ══ 6. WATERFALL PARITY on the NEW semantics ═══════════════════════
  // The batched path must apply the floors identically. It shares
  // complianceCheck, so this is a claim about the prefetch bundle feeding it
  // the same facts — which is exactly the thing a refactor breaks silently.
  {
    const floorC = await mkCarrier("wf-floor");
    await signBca(floorC.id, {
      status: "TERMINATED", terminatedAt: new Date(), terminationReason: "Arc 26 waterfall floor.",
    });
    await blanket(floorC.id);

    const waiveC = await mkCarrier("wf-waive");
    await signBca(waiveC.id);
    await prisma.carrierProfile.update({
      where: { id: waiveC.id }, data: { chameleonRiskLevel: "HIGH" },
    });
    await blanket(waiveC.id);

    const batched = await complianceCheckMany([floorC.id, waiveC.id]);
    const serialFloor = await complianceCheck(floorC.id);
    const serialWaive = await complianceCheck(waiveC.id);

    check("6a. the batched path applies the FLOOR identically — no inherited skip",
      batched.get(floorC.id)?.allowed === false &&
        (batched.get(floorC.id)?.blocked_codes || []).some((c) => c.code === "AGREEMENT_TERMINATED"),
      `batched allowed=${batched.get(floorC.id)?.allowed} codes=[${codes(batched.get(floorC.id)!)}]`);

    check("6b. the batched path RELEASES the waivable identically",
      batched.get(waiveC.id)?.allowed === true && (batched.get(waiveC.id)?.released.length || 0) === 1,
      `batched allowed=${batched.get(waiveC.id)?.allowed} released=${batched.get(waiveC.id)?.released.length}`);

    check("6c. batched and serial agree verdict-for-verdict on both",
      batched.get(floorC.id)?.allowed === serialFloor.allowed &&
        batched.get(waiveC.id)?.allowed === serialWaive.allowed &&
        JSON.stringify(batched.get(floorC.id)?.released) === JSON.stringify(serialFloor.released) &&
        JSON.stringify(batched.get(waiveC.id)?.released) === JSON.stringify(serialWaive.released),
      `one gate, both paths — allowed and released match on the floor case and the waivable case`);
  }

  // ══ 7. the probe actually exercised the override branch ════════════
  // Without this a bug that made every override lookup return nothing would
  // still print a clean sheet, because "no override" also blocks a floor.
  {
    const c = await mkCarrier("tripwire");
    await signBca(c.id);
    await prisma.carrierProfile.update({
      where: { id: c.id }, data: { insuranceExpiry: new Date(Date.now() - 10 * 864e5) },
    });
    const noOv = await complianceCheck(c.id);
    await blanket(c.id);
    const withOv = await complianceCheck(c.id);
    check("7. TRIPWIRE: the same carrier flips on the override alone",
      !noOv.allowed && withOv.allowed && noOv.released.length === 0 && withOv.released.length === 1,
      `no-override allowed=${noOv.allowed}/released=${noOv.released.length}; with-override allowed=${withOv.allowed}/released=${withOv.released.length}`);
  }

  // ══ 8. AUTO-DISPATCH END TO END — a floor keeps a carrier out ══════
  // Case 6 proves the batched VERDICT. This proves the thing that matters
  // operationally: that a floor-blocked carrier holding a blanket override is
  // actually absent from the candidate set the waterfall scores. Auto-dispatch
  // is the path with no human in it, so a floor leaking here is worse than a
  // floor leaking on a screen someone reads.
  {
    const { getEligibleCarriers } = await import("../src/services/waterfallScoringService");

    const floorC = await mkCarrier("wf-e2e-floor");
    await signBca(floorC.id, {
      status: "TERMINATED", terminatedAt: new Date(), terminationReason: "Arc 26 e2e floor.",
    });
    await blanket(floorC.id);

    const okC = await mkCarrier("wf-e2e-ok");
    await signBca(okC.id);
    await prisma.carrierProfile.update({
      where: { id: okC.id }, data: { chameleonRiskLevel: "HIGH" },
    });
    await blanket(okC.id);

    const ctx = {
      equipmentType: "DRY_VAN", originState: "MI", destState: "IL",
      originCity: "Detroit", destCity: "Chicago", weight: 20000,
    } as any;
    const eligible = await getEligibleCarriers(ctx);
    const ids = new Set(eligible.map((c: { id: string }) => c.id));

    check("8a. a TERMINATED carrier holding a blanket override is ABSENT from auto-dispatch",
      !ids.has(floorC.id),
      `present=${ids.has(floorC.id)} — the floor holds on the path with no human in it`);

    check("8b. and a WAIVABLE-only carrier holding one IS scored — the release still works",
      ids.has(okC.id),
      `present=${ids.has(okC.id)} of ${ids.size} eligible`);

    // Without this the pair above could both pass on an empty candidate set:
    // "the floor carrier is absent" is trivially true when nobody is present.
    check("8c. TRIPWIRE: the candidate set was non-empty, so 8a means something",
      ids.size >= 1,
      `${ids.size} carrier(s) survived scoring — 8a is an exclusion, not an empty list`);
  }

  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0
    ? "EVALUATE-THEN-RELEASE — floors absolute, waivables named, both paths agree"
    : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
