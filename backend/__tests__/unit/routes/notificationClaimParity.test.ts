/**
 * A surface may not claim someone was notified unless something was sent.
 *
 * WHY. The Quick Pay approval banner said "the carrier has been notified" on
 * every 200. The handler sent no email at all — it wrote an in-portal row and
 * swallowed its own failure — so the sentence was true only in the sense that a
 * row existed somewhere the carrier might one day look. An AE who reads
 * "notified" and moves on is the actual harm: they stop chasing a carrier who
 * was never told, and the carrier waits for a message that was never sent.
 *
 * WHAT THIS GUARD CAN AND CANNOT DO. It pins the specific claims that exist
 * today against the handlers behind them. It cannot prove a general property
 * about all future copy — "does this sentence assert a send" is not decidable by
 * grep. Read it as a tripwire on the known class, and add a case when a new
 * surface starts claiming.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BE = path.resolve(__dirname, "../../../src");
const FE = path.resolve(__dirname, "../../../../frontend/src");

/** CRLF-safe — this repo checks out with autocrlf. */
const read = (p: string) => fs.readFileSync(p, "utf8").split("\r\n").join("\n");

describe("a claim of notification traces to an actual send", () => {
  const ctrl = read(path.join(BE, "controllers/carrierController.ts"));
  const page = read(path.join(FE, "app/dashboard/carriers/page.tsx"));

  it("the Quick Pay approval actually sends an email", () => {
    // Tripwire: if the handler name moves, every assertion below passes while
    // measuring a file that no longer contains the thing under test.
    expect(ctrl.includes("approveQuickPayEnrollment"), "handler is gone — update this guard").toBe(true);
    // Assert the CALL inside the handler, not the identifier anywhere in the
    // file. The first version of this checked `includes("sendQuickPayApprovedEmail")`
    // and the IMPORT LINE alone satisfied it — so deleting the actual call left
    // the guard green. Presence is not function; a guard whose subject is a call
    // has to look for the call, in the scope that should make it.
    const handler = ctrl.slice(ctrl.indexOf("export async function approveQuickPayEnrollment"), ctrl.length);
    expect(
      handler.slice(0, 6000).includes("await sendQuickPayApprovedEmail({"),
      "the Quick Pay approval no longer CALLS the email sender. The console " +
        "claims the carrier was notified; something has to make that true.",
    ).toBe(true);
  });

  it("the handler reports what each channel did, rather than a bare 200", () => {
    expect(
      /notified:\s*emailSent \|\| notifSent/.test(ctrl),
      "the approve response no longer reports whether anything was delivered",
    ).toBe(true);
  });

  it("the banner is conditional on that report, not on the request succeeding", () => {
    expect(
      /notified\s*$|\?\.notified/m.test(page) || page.includes("?.notified"),
      "the approval banner no longer reads the response's notified flag",
    ).toBe(true);
    expect(
      page.includes("could NOT reach the carrier"),
      "the banner has no copy for the case where the send failed — which means " +
        "it claims delivery unconditionally again",
    ).toBe(true);
  });

  it("the send failure is logged loudly rather than swallowed", () => {
    expect(
      /approval EMAIL failed/.test(ctrl),
      "a failed approval email no longer logs — it is invisible again",
    ).toBe(true);
  });

  it("the Quick Pay figures are read from config, never written into the email", () => {
    const email = read(path.join(BE, "services/emailService.ts"));
    const fn = email.slice(email.indexOf("sendQuickPayApprovedEmail"));
    // A literal percentage in a fee sentence is a pricing statement that goes
    // stale silently the first time §8 moves — and goes stale in writing, to a
    // carrier, which is the expensive kind.
    for (const bad of ["3%", "2%", "1%", "5%", "4%"]) {
      expect(
        fn.slice(0, 4000).includes(`>${bad}<`),
        `the Quick Pay email hardcodes ${bad}. Read it from TIER_CONFIG.`,
      ).toBe(false);
    }
    expect(ctrl.includes("getTierConfig("), "the handler no longer reads the tier config").toBe(true);
  });

  // ── the other two lifecycle transitions ──────────────────────────────────
  //
  // Approve was fixed in v3.8.avl. Decline had the identical defect one door
  // over — "the carrier has been told" on every 200, with nothing sent — and
  // withdraw takes a payment facility away from someone who was using it while
  // telling them only if they happen to open the portal. Both send now, and
  // both banners follow the report rather than the 200.
  //
  // Each assertion looks for the CALL inside its own handler, not the
  // identifier anywhere in the file: the import line alone once satisfied this
  // guard, which is how a deleted call stayed green.

  const handlerOf = (name: string) => {
    const i = ctrl.indexOf(`export async function ${name}`);
    expect(i, `handler ${name} is gone — update this guard`).toBeGreaterThan(-1);
    return ctrl.slice(i, i + 6000);
  };

  it("declining actually sends the carrier an email", () => {
    expect(
      handlerOf("declineQuickPayEnrollment").includes("await sendQuickPayDeclinedEmail({"),
      "the decline no longer CALLS the email sender. The console says the " +
        "carrier was told and given a reason; something has to make that true.",
    ).toBe(true);
  });

  it("withdrawing actually sends the carrier an email", () => {
    expect(
      handlerOf("withdrawQuickPayEnrollment").includes("await sendQuickPayWithdrawnEmail({"),
      "the withdrawal no longer CALLS the email sender. A carrier losing Quick " +
        "Pay would learn it only by opening the portal.",
    ).toBe(true);
  });

  it("both report per-channel delivery rather than a bare 200", () => {
    for (const h of ["declineQuickPayEnrollment", "withdrawQuickPayEnrollment"]) {
      expect(
        /notified:\s*emailSent \|\| notifSent/.test(handlerOf(h)),
        `${h} no longer reports whether anything was delivered`,
      ).toBe(true);
    }
  });

  it("both banners are conditional on that report", () => {
    expect(
      page.includes("Declined — but we could NOT reach the carrier"),
      "the decline banner has no copy for a failed send, so it claims delivery " +
        "unconditionally again",
    ).toBe(true);
    expect(
      page.includes("Withdrawn — but we could NOT reach the carrier"),
      "the withdrawal banner has no copy for a failed send",
    ).toBe(true);
  });

  it("neither send failure is swallowed", () => {
    for (const [h, label] of [
      ["declineQuickPayEnrollment", "decline"],
      ["withdrawQuickPayEnrollment", "withdraw"],
    ] as const) {
      expect(
        handlerOf(h).includes(`[QuickPayPilot] ${label} EMAIL failed`),
        `a failed ${label} email no longer logs — it is invisible again`,
      ).toBe(true);
    }
  });

  it("neither email hardcodes a Quick Pay figure", () => {
    // Same rule as the approval email: a percentage written into a template is
    // a pricing statement in writing to a carrier, and it goes stale silently.
    const email = read(path.join(BE, "services/emailService.ts"));
    for (const fn of ["sendQuickPayDeclinedEmail", "sendQuickPayWithdrawnEmail"]) {
      const body = email.slice(email.indexOf(fn), email.indexOf(fn) + 4000);
      for (const bad of ["3%", "2%", "1%", "5%", "4%"]) {
        expect(body.includes(`>${bad}<`), `${fn} hardcodes ${bad}`).toBe(false);
      }
      expect(body.includes("netDays"), `${fn} does not read Net terms from config`).toBe(true);
    }
  });
});

describe("registration document loss is recorded, not swallowed", () => {
  const ctrl = read(path.join(BE, "controllers/carrierController.ts"));

  it("a failed upload writes an UPLOAD_FAILED row", () => {
    expect(
      ctrl.includes('status: "UPLOAD_FAILED"'),
      "a storage failure at registration no longer leaves a trace. The AE sees " +
        "DOCUMENTS (0), which is indistinguishable from a carrier who sent nothing.",
    ).toBe(true);
  });

  it("registration documents carry entityType/entityId so the AE can see them", () => {
    // Defect (2): photoId and articlesOfInc wrote rows with neither, so even a
    // SUCCESSFUL upload was invisible to the drawer, which queries on both.
    const block = ctrl.slice(ctrl.indexOf("a failed upload is RECORDED"));
    expect(block.indexOf('entityType: "CARRIER"'), "the persist block sets no entityType").toBeGreaterThan(-1);
    expect(block.indexOf("entityId: profileId"), "the persist block sets no entityId").toBeGreaterThan(-1);
  });

  it("an admin is notified when documents are lost", () => {
    expect(
      ctrl.includes("Carrier documents were NOT stored"),
      "nobody is told when a carrier's documents fail to store",
    ).toBe(true);
  });

  it("the application still succeeds when storage fails", () => {
    // The upload work runs after the response. A carrier must not lose a
    // completed application because our object store is misconfigured.
    const block = ctrl.slice(ctrl.indexOf("a failed upload is RECORDED"));
    expect(
      block.includes("void (async () => {"),
      "the upload work now blocks the response — a storage outage would start " +
        "failing registrations",
    ).toBe(true);
  });
});

describe("post-submit copy matches what the platform actually does", () => {
  const page = read(path.join(FE, "app/onboarding/page.tsx"));

  it("the success screen does not promise a confirmation email", () => {
    // The gate proves the mailbox BEFORE step 1, and the second verification
    // email was removed with it. Telling someone to wait for it means they wait.
    const nextSteps = page.slice(page.indexOf("Next Steps to Begin"));
    expect(
      /Check your inbox for an email titled/.test(nextSteps),
      "the success screen tells carriers to await a verification email that is " +
        "no longer sent",
    ).toBe(false);
  });

  it("neither surface promises credentials that are never issued", () => {
    const ctrl = read(path.join(BE, "controllers/carrierController.ts"));
    for (const [name, src] of [["success screen", page], ["application-received email", ctrl]] as const) {
      expect(
        /receive (your )?login credentials/.test(src),
        `${name} promises login credentials. None are ever sent — the carrier's ` +
          `password is the one they created in the wizard.`,
      ).toBe(false);
    }
  });
});
