/**
 * Where a mailbox was proven from is SERVER-EXTRACTED, never client-supplied.
 *
 * WHY THIS IS PINNED. The verifying IP and country are a fraud signal: the AE
 * carrier panel renders them as a three-point geo baseline and raises a
 * country-mismatch alert when registration and verification disagree. A signal
 * an applicant can set is not a signal — it is a field that reads as evidence
 * while being whatever the applicant typed.
 *
 * The risk is real rather than theoretical because the verify endpoints accept a
 * JSON body. `{ token, verifiedFromCountry: "US" }` is a request somebody will
 * eventually send, and the only thing stopping it being believed is that the
 * service reads the connection instead of the body.
 *
 * ALSO PINNED: the schema must not declare these fields. validateBody replaces
 * req.body with the parsed result, so an UNDECLARED field is stripped — that
 * stripping is what makes the wire version unreachable, and declaring them
 * "just to be tidy" would quietly undo it.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");

/** CRLF-safe — this repo checks out with autocrlf. */
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

const GEO_FIELDS = ["verifiedFromIp", "verifiedFromCountry", "verifiedUserAgent"];

describe("verification origin is server-extracted", () => {
  const service = read("services/onboardingDraftService.ts");

  it("markVerified derives the IP from the request, not from any body field", () => {
    const m = service.match(/async function markVerified\([\s\S]*?\n\}/);
    expect(m, "markVerified not found — update this guard rather than deleting it").not.toBeNull();
    const body = m![0];

    // Tripwire: if the write disappears the assertions below pass vacuously.
    expect(/verifiedFromIp/.test(body), "markVerified no longer writes the origin").toBe(true);

    expect(
      /extractClientIp\s*\(/.test(body),
      "markVerified must call extractClientIp — the origin has to come from the connection",
    ).toBe(true);
    expect(
      /resolveCountry\s*\(/.test(body),
      "markVerified must resolve the country from the extracted IP, not accept one",
    ).toBe(true);

    // The give-away shape: reading any geo value off a body/params object.
    //
    // `\\??\\s*[.\\[]` — the optional-chaining `?.` is NOT optional in this
    // pattern by accident. The first version required `body` followed directly
    // by `.` or `[`, so the injection `(req as any).body?.verifiedFromCountry`
    // sailed straight through and this test reported PASS on code that accepted
    // an applicant-supplied country. A guard blind to the codebase's dominant
    // syntax is the instrument failure this repo has banked repeatedly; caught
    // here only because the injection was actually run.
    for (const f of GEO_FIELDS) {
      expect(
        new RegExp(`(body|params|query|data)\\s*\\??\\s*[.\\[]\\s*["']?${f}`).test(body),
        `markVerified reads ${f} from request data. It must be extracted server-side; ` +
          `an applicant-supplied origin is not a fraud signal.`,
      ).toBe(false);
    }
  });

  it("both verification paths capture it — code and link cannot diverge", () => {
    // One writer, two callers. If a future refactor inlines the update into one
    // path, the other silently stops recording and the AE panel shows an origin
    // for some carriers and not others with no way to tell which.
    const calls = service.match(/markVerified\(draft, req\)/g) || [];
    expect(
      calls.length,
      "both verifyCode and verifyLink must pass req to markVerified",
    ).toBe(2);
  });

  it("the register schema does NOT declare the geo fields", () => {
    const schema = read("validators/carrier.ts");
    for (const f of GEO_FIELDS) {
      expect(
        new RegExp(`\\b${f}\\b`).test(schema),
        `carrierRegisterSchema declares ${f}. It must not: validateBody strips ` +
          `undeclared keys, and that stripping is what makes a wire-supplied origin ` +
          `unreachable. Declaring it re-opens the hole.`,
      ).toBe(false);
    }
  });

  it("registration reads the origin from the DRAFT, and only after the receipt is proven", () => {
    const ctrl = read("controllers/carrierController.ts");

    expect(
      /verifiedDraft/.test(ctrl),
      "registerCarrier no longer reads the verified draft — update this guard",
    ).toBe(true);

    // Order matters: the receipt is what binds this submission to a mailbox.
    // Looking the draft up first would check a browser-supplied address against
    // whatever draft happened to match it.
    const receiptAt = ctrl.indexOf("verifyReceipt(");
    const draftAt = ctrl.indexOf("const verifiedDraft");
    expect(receiptAt, "verifyReceipt call not found").toBeGreaterThan(-1);
    expect(draftAt, "verifiedDraft lookup not found").toBeGreaterThan(-1);
    expect(
      draftAt > receiptAt,
      "the draft is read BEFORE the receipt is verified — the receipt must gate it",
    ).toBe(true);
  });

  it("registration no longer sends a second verification email", () => {
    const ctrl = read("controllers/carrierController.ts");
    expect(
      /sendEmailVerificationEmail\s*\(/.test(ctrl),
      "registerCarrier sends a verification email again. The mailbox is already " +
        "proven by the Arc 32 gate; a second one left emailVerifiedAt null and " +
        "blocked Compass auto-approve until the carrier clicked it.",
    ).toBe(false);
  });
});
