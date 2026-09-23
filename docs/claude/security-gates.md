# §17 — security gate verification methodology

Moved out of `CLAUDE.md` on 2026-09-23. **Load this when adding or changing a
role-based gate, an approval gate, or session issuance.** It exists so a security
feature is not shipped without empirically verifying the gate fires, and it names the
two permanent fixtures to test against.

It also records a limitation worth knowing before you trust a probe: on an auth-gate
failure the redirect wipes the response body from DevTools, so the status code is the
security signal and the message is UX. That is the same shape as §19 Sub-pattern 16 —
a check that appears to observe more than it does.

Section numbers unchanged; see `README.md`.

---

## §17 SECURITY GATE VERIFICATION METHODOLOGY

Documents the smoke-verification pattern used for v3.8.e.1 (SHIPPER approval gate) so future security gates can be verified the same way.

### When to apply

Any sprint that adds or modifies role-based access controls, approval gates, status-based authorization, or session-issuance logic. Prevents shipping security features without empirical verification of the gate firing.

### Permanent test fixtures

Two SHIPPER users in production DB serve as permanent test fixtures:

- **`shipper@acmemfg.com`** (Robert Mitchell / Acme Manufacturing) — kept at `onboardingStatus = PENDING` indefinitely. Use for verifying SHIPPER-gate behavior on PENDING users without disturbing real shipper accounts.
- **`wasihaider3089@gmail.com`** (Wasi / Haider Logistics) — kept at `APPROVED`. Use for positive-path testing.

Do not flip the Acme fixture to APPROVED. Do not delete it.

### Verification methodology (from v3.8.e.1 smoke)

1. Open incognito browser window (clean session state)
2. Open DevTools → Network tab → check "Preserve log"
3. Navigate to login flow
4. Attempt login as PENDING user (Acme fixture, OR temporarily-flipped real account)
5. Submit credentials and OTP
6. Capture status code on the relevant verify-OTP request
7. Expected: 403 status, user not redirected to dashboard, no session token issued
8. If using a temporarily-flipped real account: revert via SQL after test

**Important:** "Preserve log" only preserves request entries through navigation/redirect; response bodies may be GC'd. The 403 status alone is the security signal — message body verification is UX, not security.

### Known limitation

Response body inspection on auth-gate failures is unreliable in DevTools because the failure typically triggers a redirect that wipes response data from the network panel. UX message rendering should be verified separately — either via backend logs (Render dashboard) or as part of the proper "application under review" page when that ships in S-3.

---

