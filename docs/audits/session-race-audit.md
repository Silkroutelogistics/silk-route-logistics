# Session race — Phase A audit (read-only)

**Baseline:** `e3ece558` · 2026-09-01 · **no source changed in this phase.**
**CLOSED:** `8be7a561` → `e98476af`. Conditional delete `b70cdab7` (v3.8.ayj),
grace window `0df0f142` (v3.8.ayk), blacklist-invariant guard `e98476af`
(unversioned). Recommendation (a) was ratified and shipped with both
companions. §13.3 Item 255 carries the closing account.
**Trigger:** `SESSION_IDLE_EXPIRED` on a freshly minted token, surfaced by an
intermittent E2E failure on `6a0ff6ee` (row 4a), which had nothing to do with
that commit.

---

## Headline: the transient 401 is the mild half

The reported symptom is a fresh login being told *"Your session has ended."* That
is real. But tracing the refusal path found a second, worse outcome from the same
window: **the refusal can permanently kill the session it just refused.**

That raises this from an annoyance to a defect worth fixing, and it changes what
the fix has to cover.

---

## 1. The mechanism, end to end

### The write (fire-and-forget)

`middleware/auth.ts` → `registerSession(userId, token, role, rememberMe, persistSession)`:

- writes the **in-memory** `activeSessions` Set **synchronously**
- issues the **persisted** row as `void createSession(...).catch(log.error)` —
  deliberately not awaited, with the reason stated in place: *"a login that
  already succeeded must not fail on a bookkeeping write, and the policy fails
  closed: a missing row costs a re-auth, never an unbounded session."*

`lib/sessionStore.ts` → `createSession` does one `prisma.staffSession.upsert`
keyed on `tokenHash`, setting `lastSeenAt = now`.

**The response is sent before that upsert resolves.**

### The read

`middleware/auth.ts` → `tryAuthenticateToken(token, isBackgroundPoll)`:

| Order | Step | Line |
|---|---|---|
| 1 | `isTokenBlacklisted(token)` | ~285 |
| 2 | verify JWT, load user | ~266-300 |
| 3 | `prisma.staffSession.findUnique({ where: { tokenHash } })` | ~341 |
| 4 | `resolveSessionPolicy({ iatMs, now, lastActivityAt, sessionMissing, policyRolloutAtMs })` | ~345 |
| 5 | on `!ok`: `removeSession()`, **`prisma.staffSession.delete()`**, `logAuthEvent`, 401 | ~352-355 |

`lib/sessionPolicy.ts` → the branch that fires:

```
if (args.sessionMissing || lastActivityAt === null) {
  ... preRollout ? SESSION_REVOKED_POLICY_ROLLOUT : SESSION_IDLE_EXPIRED
}
```

**A missing row is read as "idle expired".** For a token issued seconds ago that
reading is simply false — a token cannot have been idle for 30 minutes when it is
20 seconds old. The code is conflating *not written yet* with *long abandoned*.

### What the token carries

`{ userId }` plus JWT-standard `iat` and `exp`. **There is no `jti` anywhere in
the codebase.** So `iat` is the only issuance evidence available, at
**second granularity**.

`iatMs` is **already** an input to `resolveSessionPolicy` (it drives absolute
expiry), so a grace window needs no new plumbing.

### Callers of the idle check

Exactly two, both inside `authenticate`: the `Bearer` header branch (~388) and
the cookie branch (~415). Nothing else consults it.

**DRIVER is unaffected** — `middleware/driverAuth.ts` reads its own cookie, has
no `staffSession` lookup, and enforces no idle window (§13.3 Item 244.6).

---

## 2. The window

### To hit the transient 401

1. A login mints a token and calls `registerSession`.
2. The response is sent; the upsert is still in flight.
3. The client's next authenticated request arrives.
4. `findUnique` returns `null` → `sessionMissing` → `SESSION_IDLE_EXPIRED` → 401.

### To hit the PERMANENT kill

The refusal path deletes unconditionally:

```
await prisma.staffSession.delete({ where: { tokenHash } }).catch(() => {});
```

If the in-flight upsert lands **between step 3's `findUnique` and step 5's
`delete`**, the delete removes the row that was just written. Every subsequent
request then finds nothing, refuses again, and deletes nothing. **The token is
dead until the user logs in again**, rather than working on the retry.

The delete is pointless in this branch anyway: `findUnique` had already returned
`null`, so there was nothing to remove. It can only ever destroy a row written
concurrently.

### Why CI sees it and production rarely does

The race is lost when the client's next request beats a database round trip.

- **E2E**: token minted and used from the same runner against localhost. RTT ~1ms
  against an upsert of several ms. The test loses the race often — three passes
  and one failure across this sprint's pushes.
- **Browser login**: RTT to Render is typically 50-300ms, usually more than
  enough for the upsert. Rare, not impossible — a cold pool, a slow query, or a
  client that fires immediately on the login response can all lose it.

### Scope: which paths are exposed

**13 `registerSession` call sites.** Twelve pass `persistSession` defaulted to
`true` and are therefore fire-and-forget:

| File | Sites |
|---|---|
| `controllers/authController.ts` | 6 (password login, OTP verify, TOTP verify, refresh rotation, password change, one more) |
| `routes/auth.ts` | 2 (admin token mint, `/auth/e2e-token`) |
| `routes/carrierAuth.ts` | 4 (carrier login, OTP verify, TOTP verify, one more) |

**`routes/ssoAuth.ts` is the exception and is already immune.** It passes
`persistSession: false` and then `await`s its own `prisma.staffSession.upsert`
before responding. One login path already does the safe thing.

### Does the window affect any other session-backed check?

| Check | Affected? | Why |
|---|---|---|
| **Absolute expiry** | **No** | Derived from the token's own `iat`; needs no row. |
| **Concurrent-session limit** | **No** | Enforced against the in-memory `activeSessions` Set, which `registerSession` writes **synchronously**. (It is per-process, which is a separate weakness, not this one.) |
| **Revocation** | **Yes, but covered** | Revocation is visible as a missing row — indistinguishable from not-yet-written. However every revocation path ALSO blacklists, and the blacklist is checked FIRST. See below. |

---

## 3. The two fixes, against the code as found

### (a) Grace window on `iat`

Treat `sessionMissing` as non-fatal when the token was issued within N seconds.

**Size: smaller, by a wide margin.** `iatMs` is already an input to
`resolveSessionPolicy`, which is a pure, separately-tested function. The change
is a handful of lines in one place plus cases. No call site changes, no signature
changes, no new plumbing.

**Closes the window: conditionally.** Completely for any write delay under N,
which in practice is every delay. A pathological delay beyond N reopens both
failure modes. There is no N that is provably sufficient — but see the framing
below, which makes a generous N cheap.

**Revocation gap: NO, in the current code — and this is the load-bearing
finding.**

`isTokenBlacklisted` runs at line ~285, **before** the row read at ~341. Every
revocation path blacklists:

| Path | Blacklists | Deletes row |
|---|---|---|
| logout (`authController:631`, `carrierAuth`) | yes | yes (`revokeSession`) |
| password change (`authController:675`, `carrierAuth:507`) | yes | — |
| refresh rotation (`authController:612`) | yes | — |
| `sweepExpiredSessions` | — | yes, but only rows past the absolute or idle cutoff, which a seconds-old token cannot be |

So a token revoked during the grace period is still refused, by the blacklist,
one step earlier. **The grace window does not create a revocation gap.**

That conclusion **depends on an invariant** — *every revocation path blacklists,
and the blacklist is checked before the row read* — which is true today and
nothing enforces. If (a) ships, that invariant must be pinned by a guard, or a
future revocation path that only deletes the row would silently open the gap this
audit says does not exist.

**The framing that makes (a) principled rather than a patch.** A missing row is
currently read as "idle expired". For a token younger than the idle window that
reading is *false on its face*: a 20-second-old token has not been idle for 30
minutes. The grace does not weaken the idle rule — it stops the code asserting
something it cannot know. Recommended N is small (**30 seconds**) rather than the
full idle window: it is generously above any plausible write delay while keeping
the revocation reasoning tight even if the blacklist invariant were later broken.

### (b) Await the write

**Size: larger.** `registerSession` returns `void` and is called from 12 sites.
Making the persist awaited means either making it `async` and awaiting at all 12,
or having each site await a returned promise. Either way it is a signature change
with a 12-site fan-out.

**Closes the window: completely and unconditionally.** No N to tune, no
pathological case.

**Cost, and it is the one the original author deliberately avoided.** Login
latency gains a database round trip, and — more importantly — *a login can now
fail on a bookkeeping write*. The comment in `registerSession` names that
explicitly as the thing fire-and-forget exists to prevent. A timeout-with-fallback
variant (await briefly, fall back to fire-and-forget) preserves the login but
reintroduces the window exactly when the write is slow, which is precisely when
the race is lost. That variant closes nothing in the case that matters.

**Precedent:** `ssoAuth.ts` already awaits, so this is not a novel design.

---

## 4. Recommendation

**Ship (a), the grace window, WITH two companions.**

1. **Grace window in `resolveSessionPolicy`.** A token whose `iat` is within
   **30 seconds** of now passes the missing-row branch. Small, in the pure
   function, no call-site churn, and it corrects a statement the code cannot
   support rather than relaxing a rule.

2. **Guard the blacklist invariant.** (a) is only safe because revocation is
   caught earlier. Pin both halves: that `isTokenBlacklisted` precedes the
   session-row read, and that every path calling `revokeSession` also calls
   `blacklistToken`. Without this, the audit's "no revocation gap" conclusion
   silently expires.

3. **Stop the unconditional delete — independently worth doing.** In the refusal
   branch, only delete when a row was actually read (`sessionRow !== null`).
   Today the delete runs even when `findUnique` returned `null`, where it can
   only destroy a row written concurrently. **This removes the permanent-kill
   half on its own**, whichever fix ships, and is a two-line change.

**Why not (b):** it is the larger change, it reintroduces the failure mode the
existing comment deliberately designed out, and its timeout variant fails in
exactly the slow-write case the race depends on. Its one advantage —
unconditional closure — is worth less once (3) removes the permanent-kill
outcome, because what remains is a recoverable 401 on a retry rather than a dead
session.

**Not recommended:** adding a `jti`. It would give stronger issuance evidence
than `iat`, but nothing in the codebase uses one, `iat` is sufficient for a
seconds-scale grace, and introducing a claim across 13 mint sites is a larger
change than either option here.

---

## Phase B shape, if (a) is ratified

- Grace window + guard + conditional delete.
- **DB proof reproducing the race deterministically**: delay the `createSession`
  upsert artificially, then make a fresh-token request and assert it succeeds;
  assert a token blacklisted during the grace is still refused; assert a
  genuinely idle token past the window is still refused; assert the refusal path
  does not delete a row it never read.
- **Adversarial**: remove the grace and the fresh-token case must fail; remove
  the conditional on the delete and the permanent-kill case must reproduce.
