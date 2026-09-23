# §16 — first-carrier onboarding blockers

Moved out of `CLAUDE.md` on 2026-09-23. **Load this for launch, onboarding or counsel
work.** Six items that must clear before the first carrier signs; two of them are
counsel review of agreements carriers are signing today.

Section numbers unchanged; see `README.md`.

---

## §16 FIRST-CARRIER ONBOARDING BLOCKERS (pre-launch, must resolve before first carrier signs)

1. **Michigan commercial attorney review of the Broker-Carrier Agreement** (Foster Swift / Dirk Beckwith). The 11-section body exists in-house at `backend/src/data/agreements.ts` (`BCA_VERSION 2026-06-27-v1`) and carriers sign it today; it has not been through counsel. Swap the reviewed body into that file and bump the version — no code change. The earlier framing of this blocker as "create a standalone `.docx`" is retired: the body exists and the PDF is generated from it.
2. **Michigan commercial attorney review of the Caravan Quick Pay Agreement** ($400–$800 budget; send with #1 as one counsel pass). The 10-section body exists in-house (see `QP_VERSION` in `backend/src/data/agreements.ts` for the version to send; do not quote it from memory) and is what a carrier signs today. **Send the always-billable TONU with it:** the 2026-08-15 ratification bills the customer $200 on any cancellation with no notice test, which is a liquidated charge and should be reviewed as one before it is ever billed. See §5.
3. **DAT load board registration** activation
4. **Carrier onboarding welcome email final verification** before first real carrier touches it (v3 language confirmed at `routes/carriers.ts:614` in v3.7.h; re-verify before go-live)
5. **`compliance@silkroutelogistics.ai` alias monitoring cadence** confirmed (published on CarrierFraudBanner since v3.7.e)
6. **Insurance verification** — contingent broker coverage via PFA Protects + LOGISTIQ Broker Shield. Confirm policies active, not just in application state.

7. ~~**Agreement-termination policy — WHO and WITH WHAT NOTICE.**~~ **RATIFIED 2026-08-21, moved to §14.** Admin-only (ADMIN + CEO), effective immediately, carrier notified with the reason. Whether the *paper* should promise notice before termination is counsel's domain and rides with #1 — it is not a platform blocker, because the platform can add a notice window later without changing what it already supports. The mechanism, the constraint that it never deletes, and the reason immediacy is defensible now are recorded in §14 as ratified policy rather than held here as an open question.

---

