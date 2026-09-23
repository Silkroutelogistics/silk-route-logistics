/**
 * The bill of lading is gated on a signed rate confirmation — permanently.
 *
 * WHY THIS EXISTS AS A TEST. The gate (pdfController: CARRIER + no CONFIRMED
 * LoadTender -> 403 RC_NOT_SIGNED) was verified once by hand on 2026-09-22 and
 * the result was WRONG: the probe ran against a reused container whose loads
 * could not render, so the endpoint answered 500 and the refusal was never
 * reached. A 500 and a 403 are the same colour to anyone reading "not 200",
 * which is how a working gate got recorded as unverifiable. On a cleanly
 * seeded container the same probe returns 403 for the carrier and a 44,985-byte
 * PDF for the AE. A one-time probe cannot tell those two runs apart; this can.
 *
 * THE AE CONTROL IS THE LOAD-BEARING HALF. Asserting the carrier gets 403
 * proves nothing on its own -- a load that cannot render refuses everybody.
 * The control asks for the SAME load as an AE, who bypasses the gate by
 * design, and requires a real PDF back. Carrier refused + AE served is the
 * only pair that isolates the gate from a broken load.
 *
 * READ-ONLY. Mints sessions and issues GETs; creates and mutates nothing, so
 * it is safe ahead of the stateful lifecycle spec under a single worker.
 */
import { test, expect } from "@playwright/test";

const API = process.env.E2E_API_URL || "http://localhost:3110/api";
const CARRIER_EMAIL = "test-carrier@srl.invalid";
const ADMIN_EMAIL = "whaider@silkroutelogistics.ai";

async function mint(request: any, email: string): Promise<string> {
  const r = await request.post(`${API}/auth/e2e-token`, { data: { email } });
  if (!r.ok()) {
    throw new Error(
      `e2e-token mint failed for ${email}: ${r.status()} — ` +
      "backend must run with E2E_BYPASS_OTP=true",
    );
  }
  const body = await r.json();
  if (!body?.token) throw new Error(`e2e-token returned no token for ${email}`);
  return body.token;
}

test.describe("BOL access gate", () => {
  test("a carrier without a signed rate confirmation is refused, and an AE is not", async ({ request }) => {
    const carrierToken = await mint(request, CARRIER_EMAIL);
    const carrierAuth = { Authorization: `Bearer ${carrierToken}` };

    const listRes = await request.get(`${API}/carrier-loads/my-loads`, { headers: carrierAuth });
    expect(listRes.status(), "carrier can list its own loads").toBe(200);

    const listBody = await listRes.json();
    const loads: Array<{ id: string; loadNumber?: string }> =
      Array.isArray(listBody) ? listBody : (listBody?.loads ?? listBody?.data ?? []);
    expect(loads.length, "seeded carrier owns at least one load").toBeGreaterThan(0);

    // Every answer must be a decision, never a crash. A 500 here is what made
    // the 2026-09-22 hand-check unreadable.
    const refused: string[] = [];
    let served = 0;
    for (const load of loads.slice(0, 5)) {
      const r = await request.get(`${API}/pdf/bol-load/${load.id}`, { headers: carrierAuth });
      const status = r.status();
      expect(
        [200, 403],
        `BOL for ${load.loadNumber ?? load.id} answered ${status}; a 500 means the ` +
        "handler threw before the gate and the refusal was never evaluated",
      ).toContain(status);

      if (status === 403) {
        const body = await r.json();
        expect(body.error, "the refusal names its reason so the carrier knows what to do").toBe("RC_NOT_SIGNED");
        expect(body.action?.href, "the refusal points somewhere the carrier can act").toBeTruthy();
        refused.push(load.id);
      } else {
        served++;
      }
    }

    // Vacuity tripwire. If the seed ever gives every carrier load a CONFIRMED
    // tender this fails loudly rather than passing while asserting nothing.
    expect(
      refused.length,
      `no seeded carrier load lacked a CONFIRMED tender (served ${served}), so the ` +
      "gate was never exercised — update the fixture, do not delete this assertion",
    ).toBeGreaterThan(0);

    // THE CONTROL. Same load, AE session: the gate does not apply and a real
    // PDF must come back. Without this, a load that simply cannot render would
    // satisfy the assertion above.
    const adminToken = await mint(request, ADMIN_EMAIL);
    const ae = await request.get(`${API}/pdf/bol-load/${refused[0]}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(
      ae.status(),
      "an AE must be served the SAME load the carrier was refused — otherwise the " +
      "403 proves the load is broken, not that the gate fired",
    ).toBe(200);
    expect((await ae.body()).length, "the AE gets a real PDF, not an empty body").toBeGreaterThan(1000);
  });
});
