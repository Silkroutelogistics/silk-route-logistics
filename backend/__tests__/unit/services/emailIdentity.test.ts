/**
 * System emails speak as ROLES, never as persons.
 *
 * WHY THIS IS PINNED. A generated email signed with a person's name reads as
 * correspondence that person wrote. They did not — a cron did, or a controller
 * did, at 3am, to an address nobody read out loud. When the recipient replies
 * "as discussed with Wasi", there was no discussion. Worse, it puts one
 * individual's name on a compliance demand issued by the company, which is a
 * liability shape as much as a tone problem.
 *
 * THE ONE EXEMPTION, and it is a real one. Lead Hunter outreach IS
 * person-to-person: a founder writing to a prospect, deliberately, per §3.10 and
 * §12. Those emails SHOULD carry his name and his signature block, because a
 * human wrote the template intending to be the sender. The allowlist below is
 * exactly that surface and nothing else.
 *
 * WHAT THIS GUARD CAN AND CANNOT DO. It catches THE name — the founder's, the
 * one that has actually appeared in a template. It cannot detect an arbitrary
 * personal name a future template might hardcode, because "is this string a
 * person" is not decidable by grep. Read it as a tripwire on the known
 * regression, not as proof that no name exists anywhere.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const NAME = "Wasi Haider";

/**
 * The Lead Hunter outreach surface. Personal identity is CORRECT here.
 * Adding a path to this list is asserting "a human intends to be the sender of
 * this mail" — if that is not literally true, the fix is the template, not this
 * list.
 */
const PERSONAL_IDENTITY_ALLOWED = [
  "email/builder.ts",              // CEO_NAME / GMAIL_SIGNATURE — Lead Hunter SOT
  "config/signatures/whaider.html", // the Gmail signature asset for the same path
];

/** CRLF-safe — this repo checks out with autocrlf. */
const read = (p: string) => fs.readFileSync(p, "utf8").split("\r\n").join("\n");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|html)$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

describe("system emails speak as roles, never persons", () => {
  it("the scan actually reaches the source tree", () => {
    // Vacuity tripwire. A walk that returns nothing makes every assertion below
    // pass while checking nothing at all.
    expect(files.length, "walked src and found no .ts/.html files").toBeGreaterThan(200);
    const hits = files.filter((f) => read(f).includes(NAME)).map(rel);
    // And the scan can genuinely SEE the name — if this drops to zero the
    // matcher is broken, not the codebase clean.
    expect(hits.length, "the scan found the name nowhere at all — matcher broken?").toBeGreaterThan(0);
  });

  it("the founder's name appears ONLY on the Lead Hunter outreach surface", () => {
    const offenders = files
      .filter((f) => read(f).includes(NAME))
      .map(rel)
      .filter((r) => !PERSONAL_IDENTITY_ALLOWED.includes(r));

    expect(
      offenders,
      `A system-generated email carries a personal name:\n  ${offenders.join("\n  ")}\n` +
        `Sign as the department that owns the mailbox it sends from — ` +
        `"Compliance Department, Silk Route Logistics Inc." for compliance@, ` +
        `"Operations, Silk Route Logistics Inc." for operations@. ` +
        `If a human genuinely intends to be the sender, add the path to ` +
        `PERSONAL_IDENTITY_ALLOWED and say why.`,
    ).toEqual([]);
  });

  it("every allowlisted path still exists and still carries the name", () => {
    // An allowlist entry that no longer matches anything is dead permission:
    // it grants an exemption to a file that moved, and quietly widens nothing
    // while looking like it protects something.
    for (const r of PERSONAL_IDENTITY_ALLOWED) {
      const full = path.join(SRC, r);
      expect(fs.existsSync(full), `allowlisted path is gone: ${r}`).toBe(true);
      expect(read(full).includes(NAME), `allowlisted ${r} no longer carries the name — drop it`).toBe(true);
    }
  });

  it("the COI verification email signs as a department", () => {
    const s = read(path.join(SRC, "services/insuranceVerificationService.ts"));
    expect(/<strong[^>]*>Compliance Department<\/strong>/.test(s),
      "the COI signature no longer leads with the department").toBe(true);
    expect(s.includes("ENTITY_NAME"), "the signature dropped the legal entity line").toBe(true);
  });

  it("the COI salutation addresses the agency, not the agent as a person", () => {
    const s = read(path.join(SRC, "services/insuranceVerificationService.ts"));
    expect(/Dear \$\{agentName\}/.test(s),
      "the salutation greets the agent by personal name again").toBe(false);
    expect(s.includes("insuranceAgencyName"), "the agency name is no longer read").toBe(true);
    // The agent's name is still recorded — it identifies who was contacted.
    expect(s.includes("agentName"), "the agent name vanished from the audit lines too").toBe(true);
  });
});

describe("names are trimmed at the validator, not patched at the render", () => {
  it("firstName and lastName trim before the length check", () => {
    const s = read(path.join(SRC, "validators/carrier.ts"));
    for (const f of ["firstName", "lastName"]) {
      expect(
        s.includes(`${f}: z.string().trim()`),
        `${f} is not trimmed. A stored "John " renders as "Thank you, John ." on ` +
          `the success screen, in the confirmation email, and on every PDF — ` +
          `trim at the source rather than at each render.`,
      ).toBe(true);
    }
  });
});
