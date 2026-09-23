# §19 — fire accounts and registries

Moved out of `CLAUDE.md` on 2026-09-23. **The rules stayed.** What moved here is the
evidence behind them: the individual fire accounts, the cumulative registries, and the
maturity observation.

The split is by whether a session applying a pattern needs the text loaded. It needs
the trigger, the mechanic and the going-forward rule — all of which remain in §19.
It does not need thirteen accounts of Sub-pattern 16 firing resident in order to apply
Sub-pattern 16. Those accounts are still worth keeping, because a pattern with no
recorded fire is an assertion, and several of these are the only written record of how
a rule was earned.

Section numbers unchanged; see `../README.md`.

---

- **FIRE #2 — the other end of the same pipe (2026-08-19, v3.8.asr, P0).** Sprint 48.b caught *frontend-writes vs validator*. This fire is *validator vs handler-reads*, same `z.object().strip()` mechanic, and it was worse because it broke a transition outright rather than rendering an em-dash. v3.8.aso added a 422 gate requiring `tonuFaultSide` on a TONU flip and read it off `req.body`. `validateBody` replaces `req.body` with the Zod result (`middleware/validate.ts:21`) and `updateLoadStatusSchema` declared only `status`, so the field was **always undefined** and the gate rejected EVERY TONU — including ones sending a valid fault side. **TONU became impossible to record, and it shipped.** The same stripping had been silently eating `reason`/`cancellationReason` for far longer, so every voided CarrierPay note read "no reason provided" whatever the AE typed.
- **Why the tests did not catch it:** unit tests covered `resolveTonuBilling` (the policy) and `recordTonuObligation` (the writer). Both were green and both were correct. Nothing covered the **wire between them**, and that is exactly where the field vanished. A green unit suite over both ends says nothing about the middle.
- **Trigger, extended:** any handler that reads a field off `req.body` which its `validateBody` schema does not declare. Not just frontend↔validator drift — **validator↔handler drift is the same bug wearing different clothes**, and it is quieter because there is no type error and no runtime error. The value simply is not there.
- **Going-forward check, cheap:** when adding or changing a field the handler reads, grep the route's schema for that field name before writing the handler logic. When adding a gate that rejects on a missing field, write one test that parses a body *containing* it — the test that would have caught this is four lines long.
- **Guard shipped:** [`backend/__tests__/unit/validators/updateLoadStatusSchema.test.ts`](backend/__tests__/unit/validators/updateLoadStatusSchema.test.ts) pins that the schema carries every field the handler reads, in both directions.
- **Filing note:** recorded here rather than as a new lens in §20.3. That list is scoped by §20.1 to public marketing pages and explicitly excludes internal/backend surfaces, so a Zod-stripping lens belongs to the §19 methodology library — and Sub-pattern 5 already *is* this lens. A second entry would have split one pattern across two homes, which is the cross-canonical misfiling already banked in the sub-rule c candidate list.
- **FIRE #3 — the contract crossed the network, and only one side was told (2026-08-31, v3.8.awq, P0).** The first two fires were both inside one process: frontend-writes vs validator, then validator vs handler-reads. This one is the same shape across the CORS boundary, and it was invisible in a way neither of those was. Arc 11 added `x-step-up-token` on the CLIENT — `useStepUp` replays the original write with it once a code is accepted — and `Access-Control-Allow-Headers` was never updated. The browser refused the preflight and **blocked every step-up-gated write before it was sent**: the Quick Pay election and `PATCH /carrier-compliance/insurance`, neither of which had ever worked from a browser since the gate shipped. Measured on production: `Access-Control-Request-Headers: content-type,x-step-up-token` answered `Content-Type,Authorization,X-Requested-With`.
- **Why no signal existed at all.** The request never reached the server, so there was no log line, no error rate, no failed request to count — the *absence* of a request is not something any backend instrument can observe. It surfaced only because a carrier sent a screenshot. Both of this session's production defects were found that way, and neither moved a monitor.
- **And the message named the wrong subsystem, which is what made it expensive.** `submitCode` wrapped the verify call and the replay in ONE try. A blocked preflight throws with no response, so `e.response.data.error` was undefined and the hook fell through to *"We could not confirm that code"* — telling a carrier entering a correct code that the code was wrong, on the one screen where all they can do is re-read it. **A diagnostic that points away from the defect converts a one-line fix into a production incident.** Split into two catches: past the verify call the server has accepted the code, and nothing failing afterwards may blame it.
- **What identified it before any code was read.** The step-up endpoint returns *"That code did not match…"* and `requireStepUp` returns *"Enter the code from your authenticator app…"* — both with an `error` field. The carrier saw NEITHER, only the frontend's generic fallback. That could only mean the verify succeeded and something after it failed with no response body, which points at the network layer rather than the auth layer.
- **Trigger, extended again:** any contract whose two ends live in different deployables — a custom request header and its CORS allow-list, a cookie name and its `sameSite`/domain, a field name and its serializer. The in-process fires at least fail loudly at the boundary; this class fails in the *browser*, before either side runs.
- **Guard shipped:** [`backend/__tests__/unit/middleware/corsAllowedHeaders.test.ts`](backend/__tests__/unit/middleware/corsAllowedHeaders.test.ts) walks `frontend/src` for every custom `x-*` request header and asserts each is in `ALLOWED_REQUEST_HEADERS`, deriving the requirement from source rather than a second list that would drift the same way. It also pins that BOTH CORS surfaces build from one constant — the explicit `app.options("*")` handler runs first and is what a browser reads, `cors(corsOptions)` covers the real request, and they had been separate literals agreeing only because nobody had added a header since. Paired with [`frontend/src/hooks/useStepUp.test.ts`](frontend/src/hooks/useStepUp.test.ts) for the diagnostic half. Injection-verified in both directions.

###### Cumulative fire registry (Sprint 44a → Sprint 50)

| Sprint | Fires | Origin item | Mechanic |
|---|---|---|---|
| 44a (pre-canonical) | 1 | Item 8.10 (Phase 1) | ProspectVertical narrow grep → 81-of-87 enums via `pg_type` query |
| 44b Phase 3 | 1 | Item 72 | `cp src/config` runtime grep on `__dirname` reads |
| 44b Phase 4 | 1 | Item 73 | `--exit-code` flag absent in Prisma 6.x via CLI `--help` |
| 44c | 1 | Item 74 | URL plural/singular 9-hit grep across 4 files |
| 44d | 1 | Item 78 | `expiresAt` missing from frontend mutation vs validator |
| 45a | 2 | Items 80 + 90 | Q3 carrier email 3-precedent verification + `tender.declineReason` field absence |
| 45-RC (combined arc) | 2 | Item 48 close | Phase A2 pixel verification rate breakdown page 4 + Phase B sub-phase 3 directive package.json claim |
| 46 | 2 | Items 71 + 95 | Audit + Phase B0 NODE_ENV root cause empirical reproduction |
| 47 | 1 | Item 99 | `cp -r` POSIX nesting empirical verification |
| 47.b | 1 | Item 105 activation | Ligature surface post-deploy (Sub-pattern 3 protocol firing) |
| 48 | 1 | Item 115 | Skill-vs-industry-practice CARRIER body section reconciliation |
| 48.b | 1 | Item 116 | Frontend formData key alignment (audit-both-ends fire) |
| 49 | 1 | Item 136 + grep-regex sub-pattern | Phase B0 schema grep incomplete on `Window` vs `Time` field naming |
| 49.b | 1 | Item 139 | Signature block conditional render visual verification |
| 50 | 1 | Sub-pattern 9 promotion | Pre-push text-extraction pdf-parse smoke |

**Total: 17 prospective fires.** Footnote: Sprint 45 arc partitioned conservatively — Sprint 45a counted as 2 fires (sub-rule c gates on Q3 carrier email + `declineReason` schema check), Sprint 45-RC-PRE rolled into the Sprint 45-RC arc (single combined entry), Sprint 45-RC counted as 2 fires (Phase A2 pixel verification + Phase B sub-phase 3 directive correction). Strict per-commit count would total 19; canonical count 17 per Sprint 50 closure documentation reflects the partitioning choice.

**FOURTH FIRE — a "NOT built" list, and I walked into it in the same session I cited the pattern (2026-08-31, v3.8.awr).**

The three canonical fires were all §13.3 backlog rows. This one is §21.1's
**"Ratified-pending — NOT built"** list, and the shape is worse, because of what
that kind of list is *for*.

v3.8.asb built `POST /api/carrier-auth/quickpay-pilot-request` — APPROVED-only,
idempotent, re-requestable from DECLINED or WITHDRAWN, notifying the desk — and
wired it to the carrier portal. It applied the pilot migration in the same arc.
Nobody returned to the list. For two weeks §21.1 read:

> *"There is no carrier-side request endpoint... Until
> `POST /carrier-auth/quickpay-request` lands, the portal routes those carriers
> to operations@."*

I read that as current, **quoted it to Wasi twice as a live gap**, offered to
build it, and was told to close it. The audit that should have preceded the
build found the endpoint already there, already called from
`activation/page.tsx`. One more step and I would have shipped a second endpoint
for a working feature.

Two of the three claims in that list were stale; the third — *approval alone does
not enable Quick Pay* — was verified and is still true. **Correcting a stale list
by deleting it is the opposite failure**, so the guard pins the surviving claim
as well as the retired ones.

> **A "NOT built" list is the most dangerous documentation to leave unmaintained,
> because it is read precisely when someone is deciding whether to build
> something. A stale entry there does not merely misinform — it commissions
> duplicate work.**

**Widened trigger.** Sub-pattern 15 was scoped to §13.3 rows. It covers **any
prose claim about what the code does or does not contain** — §21 ratified-pending
lists, §16 blockers, §14 ledger entries, README capability lists. All are read as
current and none is verified by anything.

**Guard shipped:**
[`quickPayPilotDocClaims.test.ts`](backend/__tests__/unit/routes/quickPayPilotDocClaims.test.ts)
turns the section's claims into assertions against source — the endpoint exists,
the portal calls it, the migration is live rather than pending, the still-true
claim is still stated, and `approve` still does not write `quickPayEnabled`.
Strikethrough spans are excluded so correction history keeps working. Injection-
verified three ways: reinstating the stale claim unstruck, deleting the true one,
and renaming the endpoint away each turn it red.

**And the cheap habit that would have saved the whole detour:** before acting on
a doc's claim that something is missing, grep for it. One command, ahead of a
sprint's worth of duplicate work.

**Prevention value:** stops sprint scope-padding from stale-row signals. Today's v3.8.akw Item 51+52+53 "bundle of three" would have been three sprints' worth of work if not caught at Phase A audit — instead it's one ~15-LOC source change + two docs-only closures. Saves multi-sprint cycle on stale signals.

**FOURTH FIRE — a green suite on a runtime the repo says it does not support (2026-08-21, Arc 12→13).**

The frontend job failed on `webidl.util.markAsUncloneable is not a function` after a new jsdom landed. The obvious reading is a dependency problem. It was not.

All three CI jobs pinned `node-version: 20`, while `backend/package.json` had declared `engines.node: ^24.0.0` since v3.8.alg and local development ran 24. **Every green CI run since that engines bump was green on a Node the repo declares unsupported** — the check ran, and it was not checking the thing its name implied. jsdom did not cause it; jsdom was simply the first dependency with an engine floor high enough to notice.

The runner had also been saying so out loud on every run: *"actions target Node.js 20 but are being forced to run on Node.js 24"*. An annotation, not a failure, so it read as noise for weeks.

Two things make this a Sub-pattern 16 instance rather than an ordinary version bump. The green was **real but mis-aimed** — tests genuinely passed, on the wrong runtime. And the contradiction was **already written down in two files that disagreed**, which is Pattern 6 sub-rule b (spatial contradiction) feeding 16: `engines` and the CI pin could not both be right, and nobody had read them together.

**FIFTH FIRE — and the first where the guard's own subject was what broke (2026-08-21/22, Arcs 27-28).**

Arc 15 added `authenticate` to the `/carrier-auth` mount so the 2FA wall would gate. The mount-parity test asserted the STRING `authenticate` appears on each mount line. It did. **The string being present is what broke carrier login for 27 hours** — that mount is the only carrier mount holding routes deliberately written *without* `authenticate`, and a mount-level guard cannot know that.

Every prior fire was a guard failing to observe a thing that was wrong. This one is a guard **confirming the presence of the very thing that was wrong**, and reporting it as health. Naming it: **presence-as-malfunction.** The guard was not merely blind — it was pointed at the defect and green because of it.

**What made it survive 27 hours** is the part worth keeping. CI was green (the change compiled and tested). `/api/health` was 200 throughout. Error rates were flat, because **a 401 is not an error**. Every automated signal the platform owned agreed the system was healthy while its front door was locked, and a human walking the site is what found it.

**GOING-FORWARD RULE: a guard whose subject is a middleware, mount, gate or boundary must EXERCISE it — send a request and read the answer.** A text assertion over a mount line can only ever prove a string is written there, and this fire proves the string can be the bug. Arc 27's replacement builds the real chain and asserts both directions: the public routes reachable, the protected ones refused. Arc 28 extends the same principle to production with a 15-minute probe that asserts response **shape**, because the broken login and the fixed login both return 401 and only the body tells them apart.

**GOING-FORWARD RULE, now canonical: any change to a dependency or to an `engines` field re-checks the CI runtime pin IN THE SAME COMMIT.** Not afterwards, and not on the next failure. A dependency with an engine floor is a claim about the runtime, and the pin is where that claim is either honoured or silently contradicted. Cheap: one grep of `node-version` against `engines`.

**Corollary worth stating**, since it is what made this survivable: the deploy job's `needs` had frontend in it, so the failure **skipped the deploy** rather than shipping. A gate that fails loudly on the right signal is worth more than one that has been green for weeks on the wrong one.

**SIXTH FIRE — the guard measured the right thing on the wrong axis (2026-08-30, v3.8.avh).**

`font-drift.js` was built to stop typography drift and held at **zero violations** for three commits while every heading in the React app rendered Playfair at weight **600**, in **italic** — both explicitly forbidden by the skill. It was green the whole time, correctly: it asserts the FAMILY, and the family was right. Weight and style drifted freely underneath a guard whose name reads like it covers them.

**Nothing automated found it. The founder did, from a screenshot**, asking whether three highlighted headings matched the design skill.

This is the distinguishing shape in the Sub-pattern 16 family. Fires one to five were guards that failed to *observe* — a stale assertion, a text check on a mount line, a regex reading prose. This one observed perfectly and observed **one axis of a three-axis property**. Family, weight and style are independent; proving one says nothing about the others.

> **A guard proves the property it asserts, not the property you meant.**

Two corollaries worth carrying:
- **Name a guard for what it asserts, not for the goal it serves.** "Font drift" implied coverage it never had; "font FAMILY drift" would have left the gap visible in its own filename.
- **When a property decomposes, enumerate the axes before trusting a guard over it.** Typography decomposes into family / weight / style / size. Three of those were unguarded while one was.

**SEVENTH FIRE — the same blind spot, twice, in the guard written to close it (2026-08-30, v3.8.avj and the arc's close-out).**

The sixth fire's own fix carried the sixth fire's shape, in two layers, and each was found the same way — by rendering, never by the guard.

**Layer one, React.** `serif-weight-drift.js` was written to close the weight axis and it passed a heading that declared *no* weight, on the reasoning that Playfair 400 is sanctioned. True, and the wrong test: Tailwind's preflight resets headings to `font-weight: inherit`, so 46 portal page titles took the body's 400 while the skill puts page titles at 700. **The new guard was green on the very axis it was built for.** Caught by rendering `/carrier/login` after the deploy — computed 400 where a synthetic probe had returned 700.

**Layer two, static CSS.** The same check on the static side asserted weight in {400, 700} and passed `.headline { font-weight: 400 }` — the class on four homepage section heads. Caught by the homepage *control*, the probe whose whole job was to prove nothing had changed.

> **Legality of a value is not the same question as the pattern for the element.**

That sentence is the finer edge of the sixth fire's rule. Enumerating the axes is not enough; each axis then has a *legal range* and a *correct value for this element*, and a guard that checks only the range is exactly as green and exactly as blind.

Three corollaries:
- **The control is not ceremony.** It was there to prove absence of change and it produced the arc's fourth finding. A probe that can only confirm is worth less than one that can also surprise you.
- **A guard's first version is the one most likely to carry the bug it was written against** — it is authored under the same mental model that missed the thing. Injection-verify it against the *original* defect, not a synthetic one.
- **Render, then believe.** Every finding in this arc past the first came from a browser. Four separate times the build was clean, the guard was green, and production was wrong.

**EIGHTH FIRE — the probe collided with its own control (2026-08-31, e-signature audit).**

Testing whether a signed Rate Confirmation renders its signature, the fixture
used `"Jordan Probe"` as the signature name — and the carrier's person-name in
the same fixture was also *Jordan Probe*. The string appeared in the PDF, the
probe reported the signature RENDERED, and that would have shipped as a finding
contradicting the truth.

Re-run with `carrierSignature: "QQSIGNATUREQQ"` — a value that can only have
come from the field under test — every signature field came back NOT RENDERED,
while a control string from elsewhere in the same document still rendered. The
second run is the one that counts.

> **A value that also appears outside the field under test verifies nothing.**
> **The probe must use a string whose only possible source is that field.**

This is Sub-pattern 16 pointing at the fixture rather than the guard: the check
ran, it observed a real string in a real artifact, and it was measuring
something other than what its name said. Same shape as a guard satisfied by an
import line, or a text assertion matching prose in its own comment — and the
same remedy, which is to make the observation unambiguous by construction
rather than to look harder at an ambiguous one.

Corollary, since it generalises past PDFs: **when asserting that X put a value
somewhere, the value must be unique to X.** Reusing a realistic-looking name
across two roles in one fixture is the most natural way to write the test and
the most reliable way to make it lie.

**NINTH FIRE — a chained command that never ran, reported as success by the tool
that ran it (2026-08-31, same day, and also mine).**

The commit that added the Prisma target guard also routed
`package.json#prisma.seed` through it as `guard && ts-node prisma/seed.ts`. Its
test asserted `pkg.prisma.seed` **contains** `"prisma-target-guard.ts"`. It did.
CI went red on the E2E suite.

**`prisma db seed` does not run its command through a shell.** The string was
tokenised, and the guard was handed `&&`, `npx`, `ts-node`, `prisma/seed.ts` as
ARGUMENTS. It read `argv[2] === "seed"`, passed, exited 0 — and Prisma printed
*"The seed command has been executed."* The seed never ran.

**The tell was a timestamp, not an error.** Guard finished at `05:43:33.350`;
Prisma declared success at `05:43:33.375`. Twenty-five milliseconds, against
five seconds and eleven `✅ E2E fixtures:` lines on the previous green run.
Nothing failed. No fixtures existed, so `/api/auth/e2e-token` returned 404 and
every E2E test failed one layer downstream of the real cause.

> **A guard that asserts a command STRING cannot know whether the command RAN.**
> **`&&` is a shell operator; a runner that does not use a shell turns it into
> an argument, and the half after it silently disappears.**

Two further things this cost, both worth keeping:

- **The audit layer would have prevented it entirely.** `prisma/seed.ts` has had
  its own `assertNotProduction()` since v3.8.auf — fails closed, refuses the
  production host, runs before the TRUNCATE. Reading the file I was "protecting"
  would have shown the protection already existed and was stronger. Sub-pattern
  15: check whether the thing already has a guard before adding one.
- **The fix is structural, not another assertion.** The chain was deleted rather
  than tested harder. A bug class that cannot occur beats a bug class that is
  watched for — and the seed's intrinsic guard cannot be defeated by how the
  command is invoked, which is exactly the property the chain lacked.

**And the replacement test caught itself doing the same thing.** Its first draft
anchored on `indexOf("TRUNCATE")`, which matched the header comment's phrase
*"before the TRUNCATE below"* at byte 677 — prose, 2.4kB above the code it
describes. It now anchors on `$executeRawUnsafe(\`TRUNCATE TABLE`, the executed
statement. **Anchor on what runs, never on a word that also appears in a comment
about what runs.**



Closed by `serif-weight-drift.js`, which asserts the other two axes *and* the loaders themselves, so a re-added 600 fails CI upstream of any component that could use it.

**TENTH FIRE — "configured is not functional", and it was green through a public outage (2026-08-31, v3.8.awf/awg).**

Google retired `gemini-2.0-flash`. It was hardcoded in four files, so Marco Polo
(the PUBLIC homepage chatbot), the shipper portal assistant and the COI parser
all died at the same instant. `/api/health` reported `parser: {"configured": true}`
throughout, because that field asked whether `GEMINI_API_KEY` was **set**. The
credential was set. The model was gone.

**A field named for a capability was reporting a credential.** I wrote that field
myself, two arcs earlier, in the commit whose whole purpose was to make storage
and parser readiness visible.

The chatbot compounded it by failing GRACEFULLY: it caught the error and replied
*"I'm having trouble connecting right now"* — a 200, a well-formed body, flat
error rates, no alert, and a sentence a visitor reads as a transient blip. Broken
and working were indistinguishable by every signal the platform owned. **Window
unknown**, because nothing recorded a first failure — there was no failure to
record. Found only because a document-chain proof went looking at the parser.

> **A health field must observe the capability, not the credential.** Anything
> that answers by reading an env var is reporting its own configuration back to
> itself.

Now: `{ configured, functional, model, checkedAt }`, where `functional` comes
from a real call, cached with a short TTL, refreshed in the background so health
stays fast and never throws. **`functional` is `null` until checked — never
optimistically `true`**, because an optimistic default is how this happened.
Storage got the same treatment: a genuine put/read/delete round trip, since
`useS3` only says credentials existed at boot and cannot see a suspended account
or a rotated key — both of which this codebase has hit.

Proven by pinning the retired model and reading the endpoint: `configured: true`
(where the old field stopped and declared health) alongside `functional: false`
and the 404 naming its own successor.


**ELEVENTH FIRE — a signal that reads the same whether the thing exists or not (2026-08-31, docs-only close-out).**

Arc PARSER's close-out told the founder to open
`/api/monitoring/document-chain/selftest`. **That path does not exist.** The
monitoring router's sole mount is `/admin`, so the real URL is
`/api/admin/document-chain/selftest` — and the wrong one went out in a commit
message and a close-out summary.

**What makes it a Sub-pattern 16 fire is not the typo. It is that I verified
it.** I curled the wrong path, got `401 {"error":"No token provided"}`, and
wrote down "the route exists and is admin-gated". The 401 was real. It came
from somewhere else entirely.

Measured on production when the doubt was finally raised:

```
GET /api/admin/document-chain/selftest  → 401 {"error":"No token provided"}
GET /api/admin/no-such-route-xyz        → 401 {"error":"No token provided"}
GET /api/totally-made-up-namespace/x    → 401 {"error":"No token provided"}
```

Byte-identical, sharing one `etag`. The cause is a catch-all:
`router.use("/", tenderRoutes)` sits at `routes/index.ts:315`, `tenders.ts:12`
is `router.use(authenticate)`, and `/admin` is mounted at `:349`. Any tokenless
request not matched by an earlier mount falls into the tender router and is
refused there, **before routing ever reaches the admin router**.

> **A 401 proves that middleware ran. It says nothing about whether the route
> behind it exists.**

The earlier fires were guards that observed the wrong thing. The sixth measured
family while weight drifted; the seventh checked that a value was legal rather
than correct for its element. **This one is worse in a specific way: the signal
is identical in the healthy and the broken state, so it has zero discriminating
power.** No amount of reading it more carefully would have helped.

**And the instinctive fix inherits the defect.** A monitor probe that hits the
URL tokenless and asserts "JSON 401, not a plain-text `Cannot GET`" is the
obvious way to make a missing admin route an alert. On this API it would be
green whether or not the route existed — a guard written against Sub-pattern 16
that is itself a Sub-pattern 16 instance. It was specified, traced, and **not
shipped** for that reason.

The check that works is a source guard
([`selftestRouteUrls.test.ts`](backend/__tests__/unit/routes/selftestRouteUrls.test.ts)):
it reads the real mount and the real route definitions, composes the URLs, and
fails if the documentation names a path that would not resolve. Injection-verified
both ways — reintroducing `/api/monitoring/` turns it red, and moving the mount
turns it red while naming the new correct URL. It runs in CI, which is also
*earlier* than a monitor could ever be: it fails before the deploy rather than
after.

**Going-forward rule.** Before trusting a probe as an existence test, ask what
the negative case actually returns. If the healthy and broken responses are the
same bytes, the probe is decoration. Establish the discriminating signal first —
by probing a path you *know* is absent — and only then write the assertion.


**TWELFTH FIRE — the test was named for the property it did not check (2026-08-31, v3.8.awp).**

A live carrier logged in, was sent correctly to `/carrier/dashboard/security`,
and sat on a spinner reading *"Redirecting to activation…"* that would never
resolve. Reported from production with a screenshot; nothing errored, nothing
failed a request, and no monitor could have seen it.

Three gates redirect on the carrier layout — status routing, the activation
wall, and enrollment. Enrollment outranks the other two, and the redirect
EFFECT says so:

```js
if (mustEnroll) return;                    // activation effect
```

The render branch did not:

```jsx
{mustActivate && !onActivationPage ? <Redirecting to activation…> : children}
```

`mustActivate = isApproved && requiresActivation`. **No `mustEnroll` term.** So a
carrier who was APPROVED with an unsigned BCA and no authenticator was redirected
to the enrollment screen and then refused it — and that screen is the only thing
that can clear `mustEnroll`. **The deadlock was permanent**, and it was reached by
following the redirect the system itself issued.

**The guard existed and was pointed at the wrong half.**
`it("outranks the activation wall")` asserts `router.replace` was called with
SECURITY and not ACTIVATION. It mounts at `/carrier/dashboard`, never at the
destination, and passes `{null}` as children.

> **A redirect test proves where the arrow points. It cannot prove that anything
> is standing where it lands.** Arriving is not the same as being able to use it.

Injection-verified by restoring the shipped precedence: **exactly one** of the
eleven cases goes red — the new one that mounts at the destination — while the
seven originals stay green. That green is the measurement. Those seven were
written specifically about this precedence and could not see it break.

**Fixed in the VALUE, not at the consumer**: `mustActivate` now carries
`!mustEnroll`, so a consumer added later inherits the precedence instead of
having to remember it. `showOperationalChrome` already had `&& !mustEnroll` —
the chrome logic was written with enrollment in mind and the content branch was
not, which is the entire defect in one line, and precisely the shape that
"one seam, not per consumer" exists to prevent.

**Going-forward rule.** When a test asserts a redirect, mount at the destination
with real children and assert they render. A gate that sends someone somewhere
unusable has not been tested by proving where it sent them.

**Relationship to Sub-pattern 11 (CI-parity).** Sub-pattern 11 asks whether the local gate matches the CI gate. Sub-pattern 16 asks whether *either* gate observes the claim it makes. Passing 11 and failing 16 is exactly the state all six fires above were in.

###### Cumulative fire registry extension (post-Sprint-51.f, three new fires)

3 new fires extend the existing registry from 26 → 29:

| Sprint | Fire # | Origin | Mechanic | Sub-pattern |
|---|---|---|---|---|
| v3.8.akr (Item 8.5 close) | 27 | "match-count is not consumer-count" — 13 AddressBook refs but 0 active consumers | Classify every grep match before inferring active state | #15 (fire 1 of 3) |
| Item 191 backlog correction | 28 | §13.3 row "Priority: ELEVATED" was already CLOSED in §11 v3.8.ajg row 24h prior | Cross-reference §13.3 against §11 history before relying on §13.3 text | #15 (fire 2 of 3) |
| v3.8.akw (Items 51+52+53 audit) | 29 | §13.3 rows 12 days stale relative to Sprint 38/39 actual code | Verify file:line references in §13.3 row against verbatim current code | #15 (fire 3 of 3) — CANONICAL PROMOTION |

**Total post-Sprint-51.f cumulative fires: 29.** Sub-pattern 15 promotion satisfies §19 three-fire validation convention with three independent fires across three sprints in ~24h. The audit-layer distinction emerged organically from the three-fire empirical lineage — Wasi's catch of Item 191 (fire #28) explicitly framed the §13.3-vs-§11 contradiction as a different kind of methodology gap from the execution + ratification layers, which the third fire (fire #29 today) confirmed as a stable structural class.

###### Cumulative fire registry extension (meta-51)

8 new fires (post-meta-50) extend the existing registry from 17 → 25:

| Sprint | Fire # | Origin | Mechanic | Sub-pattern |
|---|---|---|---|---|
| 51.b | 18 | Item 147 | useEffect dep array overwrite on user keystroke | #10 |
| CI hotfix `013883d` | 19 | Item 148 | tsc passes locally, ESLint fails at CI in 26s | #11 |
| 51.c Phase A | 20 | Sprint 51.c | 3-layer architectural disconnect traced (label + endpoint + dataflow) | #12 |
| 51.c version-letter | 21 | Sprint 51.c | abq consumed by CI hotfix; Phase B0 caught directive's `abp → abq` drift | #6 retrospective |
| 51.d | 22 | Item 152 | QP cell `"Standard Net-30"` overflowed 8-cell meta strip width budget | #8.a |
| 51.e Phase A | 23 | Sprint 51.e | Sub-pattern 10 ref-based read pattern applied to new useEffect | #10 application |
| 51.f Phase A | 24 | Sprint 51.f diagnostic | Diff analysis disproved regression hypothesis | #14 |
| 51.f reality | 25 | Sprint 51.f | Three-fire confirmed canonical promotion | #13 third-fire |
| ci-hotfix `5504c81` | 26 | v3.8.ajg → ajh push | Schema added env("DIRECT_URL") but CI workflow env block missed; backend job P1012 in 24s | #11 case study #2 |

**Total post-ajh CI hotfix: 26 prospective fires.** Sub-pattern 11 second fire validates the canonical mechanic + extends it with the four-location checklist for env() reference additions (local .env + Render dashboard + CI workflow + CLAUDE.md §2.2). The arc convention from meta-50/meta-51 holds — case studies are appended to the sub-pattern's docs, registry count increments by 1 per genuine new prospective fire, retrospective recurrences of the same mechanic (not new gap class) bump count but don't generate new sub-patterns. Fire #26 is a recurrence of Sub-pattern 11's canonical mechanic in a new operational context (schema-env vs JSX-lint), worth banking the four-location checklist extension but not promoting to a separate sub-pattern.

###### Iterative refinement at methodology library maturity (observation)

Sprint 47 → Sprint 51.f shipped 18 atomic commits across 9 hotfix iterations (Sprint 47.b, 48.b, 48.c, 49.b, 51.b, 51.c, 51.d, 51.e, 51.f) with zero rollbacks. Each hotfix closed a methodology gap discovered via Phase 4 user verification or post-deploy user usage — NOT a regression introduced by the prior sprint.

When the methodology library is at maturity, iterative refinement IS the methodology. Hotfix cadence is not a sign of failure but the expected operational rhythm: Phase 4 user verification surfaces methodology gaps that Phase B verification gates couldn't catch in-environment (because the gap lives in user mental model, browser state, or production behavior rather than code or content).

Sprint 51 arc (51.b → 51.f, 5 hotfixes) is the canonical case study. Each iteration closed a distinct methodology gap:
- **51.b** — hydration-effect-dep-array (Sub-pattern 10)
- **51.c** — write-read-dataflow disconnect (Sub-pattern 12)
- **51.d** — layout-constraint overflow (Sub-pattern 8.a)
- **51.e** — intent-detection refinement (Sub-pattern 13 second fire)
- **51.f** — always-reset operational model (Sub-pattern 13 third-fire canonical promotion)

The hotfix arc itself produced Sub-pattern 13's three-fire validation lineage — the methodology library generated its first ratification-layer sub-pattern by operating at maturity on a single user-facing surface (QP Override panel) across five iterations.


**THIRTEENTH FIRE — three greens on one job, one of them real, and only the log tells them apart (2026-09-01, `v3.8.aws`→`awy` release).**

The deploy job reported **success** on a run where it had deployed nothing. Not
a bug — the designed behaviour from `v3.8.asv`, which quieted the absent-secret
case to a warning after seven unactionable red emails. But it means
`Deploy to Render = success` is **two different facts wearing one tick**, and
for seven weeks only the decorative one had ever occurred.

Three outcomes inside 56 minutes, all on the same job:

| Run | Deploy job | What it actually did |
|---|---|---|
| 33500745501 (11:06) | **success** | `HOOK:` empty, `present=false` — warned, deployed nothing |
| 33504788375 (11:53) | **skipped** | backend red; the secret was never even read |
| 33505366194 (12:02) | **success** | `Deploy hook secret present.` → `HTTP 200` → a real deploy id |

The first and third are indistinguishable at the API — same job name, same
conclusion string, same colour in the UI. The **only** discriminator is a log
line, and the run that mattered was 47 minutes after the one that did not.

**Counting the tick would have reported the 11:06 run as the first gated deploy.
It deployed nothing.** That is the same shape as the eleventh fire (a 401 that
reads identically whether the route exists or not): a signal with no
discriminating power, which no amount of reading it more carefully improves.

**Going-forward rule: when a job has a quieted branch and a real branch that
share a conclusion, the conclusion is not evidence. Read the line that
distinguishes them, and cite it.** Applies to any check that degrades gracefully
— a skipped upload, a no-op sync, a guard that exits 0 when its input is absent.
The graceful degradation is usually right; what it costs is the ability to tell
success from abstention, and that has to be bought back at the log.

**Corollary, from the same hour.** Production reached `9c6aabfc` while that
commit's CI backend was **failing** and its deploy job had **skipped** — Render's
auto-deploy shipping a red build, which is the residual risk `v3.8.asv` names in
its own comment. A gate that can refuse is worth nothing while a second,
ungated path to production remains open beside it.

### Pending review (next quarterly)
- Pattern 6 sub-rule c: **14 named sub-patterns + 8.a refinement** canonicalized across §19 meta-50 (9 sub-patterns, post-Sprint-50, v3.8.abn) + §19 meta-51 (5 new sub-patterns + 1 refinement, post-Sprint-51.f, v3.8.abv). Surface now spans **2 methodology layers**: execution (sub-patterns 1-12 + 8.a + 14) and ratification (sub-pattern 13). Cumulative fire registry shows **25 prospective fires** across Sprint 44a → Sprint 51.f.
- Next §19 quarterly review trigger: 3+ new sub-patterns banked under any active Pattern (1-7), OR a new methodology layer discovered, OR Pattern 1-5/7 sub-rule canonicalization comparable to Pattern 6's a/b/c. Current sub-rule c surface is at second-canonical-expansion maturity for the operational contexts encountered through Sprint 51.f.
- Patterns 1-5 + 7 active; no pending sub-rule canonicalizations observed outside the sub-rule c surface.
- Methodology library now produces self-documenting outputs at maturity — Sprint 47 → 51.f arc generated meta-51 organically through iterative refinement. Future arcs of comparable depth (10+ atomic commits with 5+ hotfix iterations on a single user-facing surface) likely to produce further canonical promotions; quarterly cadence may shift to triggered-by-arc-completion rather than calendar-based.
- **Sub-rule c fire candidate (NEW sub-pattern) — Cross-canonical-context migration (2026-05-20, v3.8.agm → v3.8.agn one-sprint hotfix):** v3.8.agm Phase 2 shipped /shippers trust strip lifted verbatim from §18.8 (Lead Hunter OUTREACH canonical) — "BMC-84 bonded $75K · $100K contingent cargo through Hancock & Associates". §18 is canonical for OUTREACH EMAIL context; §20 is canonical for PUBLIC PAGE context. §20.1.5 Architectural Reveal Defense bans vendor-stack reveal on public marketing surfaces. Verbatim port across canonicals shipped a Lens 1.5 live violation. Wasi visual audit on deployed v3.8.agm caught it; v3.8.agn hotfix reduced to authority-only ("BMC-84 surety bonded · Carmack-compliant BOL" — drops underwriter name + dollar specifics). Banked also as §20.1.5 banned-content extension. **Pattern:** when porting copy from canonical A to canonical B, re-vet against canonical B's constraints even if canonical A is also project-SOT. Constraint sets don't auto-migrate. **Awaits fire #2 + #3 from independent incidents** before promoting to canonical sub-pattern per sub-rule c three-fire convention. Pairs with Sub-pattern 8 fire candidate #1 (asset-file-header trap) — both are "trusted-source-A on a question that needed source-B" classes.

- **Sub-pattern 8 fire candidate #1 — Asset-file-header-vs-rendered-content + stale-canonical-naming (2026-05-20, v3.8.age → v3.8.agf → v3.8.agg three-sprint chain):** session brief named `/favicon.svg` canonical and pointed at the file's own header comment ("SRL compass mark, high-res Canva PNG export") as proof. Trusted the header without opening the file in a viewer; embedded base64 PNG inside the SVG rendered as a different glyph entirely (v3.8.age shipped wrong). v3.8.agf pivoted to `/logo-compass.png` based on CLAUDE.md §20.1.7's named-canonical reference — also wrong; that file was a stale crop superseded by Wasi's newer 1024px export at `/frontend/public/media/srl-logo-1024.png` (uploaded same day; visual still wrong on deploy). v3.8.agg landed on the actual current canonical AND surfaced that §20.1.7's reference is now stale and needs follow-up correction. Six-sprint iteration chain on a single asset (v3.8.afx → agb → agd → age → agf → agg). **Two distinct sub-rule c violations:** (a) trusted file's own header comment as authoritative; (b) trusted CLAUDE.md §20.1.7 named-canonical without checking whether the named file was current. Both miss types: "authoritative source" requires the LIVE current source, not a stale document or a self-describing header. Pattern: for brand assets specifically, the LIVE export Wasi has uploaded most recently is canonical; CLAUDE.md naming + file headers describe historical state and can drift. **Awaits fire #2 + #3 from independent incidents** before promoting to canonical sub-pattern 8.b refinement per sub-rule c three-fire convention. Banked also as user-memory `feedback_asset_file_header_not_authoritative.md`. Follow-up item: update CLAUDE.md §20.1.7 to point at `/media/srl-logo-1024.png` (queued).

---

