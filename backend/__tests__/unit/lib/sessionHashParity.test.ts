/**
 * Arc 34 — the two token-hash derivations must agree, forever.
 *
 * sessionStore.sessionTokenHash writes the row; middleware getTokenHash reads
 * it. The first cut of the writer returned the full 64-char digest while the
 * reader truncates to 32, so every row would have been written under a key the
 * reader could never find: fail-closed on every request, every portal, a total
 * lockout. They are duplicated rather than shared because middleware/auth
 * imports sessionStore and the cycle would be worse — so this pins them.
 */
import { describe, it, expect } from "vitest";
import { sessionTokenHash } from "../../../src/lib/sessionStore";
import { getTokenHash } from "../../../src/middleware/auth";

describe("session token hash parity", () => {
  it("writer and reader derive the same key", () => {
    for (const t of ["a", "", "x".repeat(500), "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def"]) {
      expect(sessionTokenHash(t)).toBe(getTokenHash(t));
    }
  });

  it("tripwire: the derivation is the truncated one, not the full digest", () => {
    // Guards against both drifting together to something else.
    expect(sessionTokenHash("a")).toHaveLength(32);
  });
});
