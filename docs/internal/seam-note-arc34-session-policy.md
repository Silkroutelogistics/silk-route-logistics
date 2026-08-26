# Seam note — Arc 34 supersedes the staff-password session decision

**To:** the session working on `auth/sso` and `bench/carrier`
**From:** Arc 34 (uniform session lifetime)
**Date:** 2026-08-24
**Status:** delivered BEFORE the Arc 34 Phase 2 commit, deliberately — this
overturns a decision you documented, and you should see it before it lands
rather than in a diff afterwards.

---

## Your work is correct and is not being called a bug

`authController.ts:412` and `:855` carry this:

> Deliberately writes NO staff_sessions row. The password path has no
> remember-me, and the session policy's fail-closed branch turns an absent row
> into exactly the ruled 24h cap from iat. Adding a row here would be a
> regression, not a fix.

**That is right under the policy it was written for.** No row → fail closed →
24h cap from `iat`. Nothing is missing, and the fail-closed design in
`resolveStaffSessionPolicy` is what makes it safe rather than lucky.

I want that on the record because I got here by first reporting the opposite.
Three times, across three reports, I described the staff-password path as having
a missing writer. It does not have one **on purpose**, and your comment says so
in advance. See the §19 entry for how a broken grep produced that.

## What changes, and why it is a policy change rather than a fix

Arc 34 ratifies one policy for all four portals: **30-minute idle, 12-hour
absolute.**

Idle cannot be derived from a token. It needs `lastActivityAt` on a persisted
row. So under the new policy the staff-password path **does** need a row — not
because the old reasoning was wrong, but because the rule it served has been
replaced.

Concretely:

| | old policy | Arc 34 |
|---|---|---|
| staff-password absolute | 24h from `iat` | 12h from `iat` |
| staff-password idle | in-memory Map (resets every deploy) | 30m from the persisted row |
| SSO remember-me idle | 7d rolling | **30m** — remember-me shortens re-auth only |
| carrier / shipper | 60m in-memory (unenforced in practice) | 30m persisted |
| driver | none | 30m persisted |

## What Arc 34 touches in your work, precisely

1. **`StaffSession` gains a `portal` discriminator.** The model and table keep
   their names. A rename reads better and would hand you a conflict across four
   unmerged commits on `bench/carrier` that reference `staffSession`; the name
   is the smaller cost.
2. **Your SSO upsert is EXTENDED, not duplicated.** One creation pattern, five
   call sites. No parallel writer.
3. **Your comments at `authController.ts:412` and `:855` are rewritten, not
   deleted** — each becomes a supersession record carrying both decisions and
   their dates, so a future reader can see what was true when, rather than
   finding a comment that contradicts the code beside it.
4. **`resolveStaffSessionPolicy` and all 24 of its tests are untouched.** Arc 34
   adds `resolveSessionPolicy` alongside it and moves the middleware over. Yours
   stays callable and green.

## One thing you should know about your own evidence

Your Stage 5 verification stands **if it was gathered over SSO**. If any of it
came from a password login, that session had no row, so it exercised the
in-memory fallback rather than the persisted path — the fallback your module's
docstring exists to replace. Worth a glance at how those runs signed in.

## What would make me wrong

If the 24h cap on the password path is a deliberate product commitment rather
than a default — something promised to staff, or required by a control — then
Arc 34's 12h is a tightening that needs its own ratification and this note is
the wrong way round. Say so and Arc 34 will scope itself to
carrier/shipper/driver, which it can do without touching a line you wrote.

---

## UPDATE 2026-08-26 — shipped as v3.8.aut, and what actually changed

The note above described the plan. Two things about it turned out to be wrong,
and you should have both.

**The middleware did not simply "move over" — for staff it ran BOTH policies,
legacy first, and legacy decided.** A proof harness ran red at 12/16 with every
failure on a staff token and every carrier and shipper assertion passing. Your
branch's throttled touch wrote `lastSeenAt = now` immediately before the uniform
policy re-read that same row, so staff idle was unenforceable; the touch was
also ungated by the background-poll marker. And `bypassLegacyIdle` was an early
return, so a remembered session never reached the uniform policy at all.

Same fixture, same 31-minute backdate, same request, differing only in role:

| | HTTP | lastSeenAt after |
|---|---|---|
| ADMIN (staff) | 200 | refreshed to 0m |
| CARRIER (non-staff) | 401 | row deleted by the refusal path |

So the legacy evaluation is gone from the request path entirely. **The promise
in this note held**: `resolveStaffSessionPolicy` still exists, is still
exported, and all 24 of your cases still pass unmodified. It simply no longer
decides anything.

**Seven of your middleware cases in `staffSessionSweep.test.ts` were rewritten,
none deleted.** Five went red on the removal. Two kept passing FOR THE WRONG
REASON — "dies at the 30-day ceiling" now dies at 12 hours, "dies after 8 idle
days" now dies after 30 minutes — which would have left them green while
asserting a rule that no longer exists. Each carries both decisions and their
dates. Your file's own injection discipline was honoured: neuter the policy and
8 of 16 go red.

Your comments at `authController.ts:412` and `:855` are now dated supersession
records carrying both decisions, as promised. The 24h cap they relied on is
12h, and fail-closed now means REFUSED rather than capped, because idle cannot
be derived from a token — which is why the password path needs the row it
deliberately did not write.
