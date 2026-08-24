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
