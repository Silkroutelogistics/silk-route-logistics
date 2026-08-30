# Render env checklist — one dashboard sitting

Every environment variable the platform is currently waiting on, with the exact
name the code reads and what stays broken until it is set. Written to be worked
top to bottom in a single visit to
[the Render dashboard](https://dashboard.render.com/web/srv-d64iqtffte5s73894h8g)
→ **Environment**.

Ordered by what it costs to leave unset.

---

## 1. Object storage — **ranks first, and it destroys data**

Everything else on this page blocks something. This one **loses something a
carrier already handed you**.

`storageService.ts` decides it is configured by exactly this test:

```ts
const useS3 = !!(env.S3_BUCKET_NAME && env.AWS_ACCESS_KEY_ID);
```

Both, or it is off. There is no partial state.

| Variable | Required | Notes |
|---|---|---|
| `S3_BUCKET_NAME` | **yes** | one half of the configured test |
| `AWS_ACCESS_KEY_ID` | **yes** | the other half |
| `AWS_SECRET_ACCESS_KEY` | **yes** | not part of the test, but every call fails without it |
| `AWS_REGION` | no | defaults to `us-east-1`. Set to `auto` for Cloudflare R2 |
| `S3_ENDPOINT` | no | unset = AWS S3. Set it for any S3-compatible provider (R2 and similar) |

**What is broken right now.** In production `uploadFile()` **refuses** rather
than writing to the container's ephemeral disk — deliberately, because the
alternative silently destroys every W-9, COI, POD and executed agreement on the
next deploy. So a carrier completing registration today has their documents
recorded as `UPLOAD_FAILED`, the AE sees a red banner naming the files, admins
are notified, and **the bytes are gone**. The application still succeeds, which
is correct: a carrier must not lose a completed application because our
environment is wrong.

**How to check without guessing.** `GET /api/health` reports it as a read of the
service's own config, not an inference:

```json
"storage": { "configured": true, "provider": "s3" }
```

`provider` is `s3`, `s3-compatible` (S3_ENDPOINT set), or `local-disk`.
**`local-disk` in production is the broken state.**

**After setting it, the platform is not proven — run the upload proof.** A
registration with one PDF, confirming both a `Document` row and the object
itself, then delete the test artifacts. Configured is not the same as working;
a wrong bucket name or a key without `PutObject` reports `configured: true` and
fails on the first real upload.

---

## 1b. `GEMINI_API_KEY` — storage keeps the paperwork, this **reads** it

Numbered `1b` because it belongs immediately after storage by impact, not because
it is optional. Storage means a COI arrives. This means somebody other than a
human has to look at it.

**Name verified against the code**, not from memory: declared at `env.ts:16`, read
at `coiReaderService.ts:59` as `process.env.GEMINI_API_KEY`.

**What is broken right now.** Without the key `coiReaderService` falls back to a
path its own comment calls *"very limited — mainly for when no AI key is
configured"*. Certificates are stored and shown to the AE, and **nothing extracts
coverage amounts, expiry dates, or agent details**. Every insurance figure on a
carrier is whatever they typed into Step 3, unchecked against the document they
attached — which is precisely the check the parser exists to perform.

**How to check.** `GET /api/health` reports it as a read of the same env name the
reader branches on:

```json
"parser": { "configured": true }
```

Boot log says so either way, at ERROR level in production.

> **Setting this key does NOT make parsing happen, and this is the important
> part.** The reader has exactly one entry point — `POST /carriers/:id/read-coi`
> ([`routes/carriers.ts:231`](../../backend/src/routes/carriers.ts#L231)) — and
> **no frontend calls it**. Nothing fires on upload, nothing fires on an AE
> action, no cron touches it. The downstream half is wired (extracted fields feed
> the Compass *Insurance Minimums (Internal)* and *Insurance Expiry Proximity*
> checks, and the COI verification email); the **trigger** is missing. The key is
> necessary and not sufficient. Full chain verdict in CLAUDE.md §13.3.

---

## 2. `RENDER_DEPLOY_HOOK_URL` — CI cannot gate deploys without it

Blocks **five `hold/` branches and one pending migration**, because none of them
can be released while a push deploys straight to production without CI having
passed first.

Full procedure, including the ordering that matters: **[render-deploy-gate-setup.md](render-deploy-gate-setup.md)**.

Order is load-bearing:

1. Create the deploy hook in the Render dashboard
2. Add it as GitHub secret `RENDER_DEPLOY_HOOK_URL`, confirm the deploy job goes green
3. **Only then** turn Render auto-deploy off

Doing 3 before 2 leaves a window where nothing deploys at all.

Until the secret exists the deploy job emits a warning and skips — the run stays
green, and Render's own auto-deploy still ships the commit. That is deliberate;
it was failing loudly for a week and the seven consecutive red emails taught
nobody anything except to ignore CI mail.

---

## 3. `GOOGLE_*` — carrier "Sign in with Google"

Blocks the carrier OAuth build entirely. **Not deferred — blocked**: a sign-in
path that cannot be exercised end to end is one nobody has seen work, sitting in
the highest-risk surface in the repo until a real carrier is the first to try it.

**Needs a NEW OAuth client of type External.** The existing staff SSO client
cannot be reused: `ssoService.ts` refuses any identity whose `hd` claim is not
`silkroutelogistics.ai`, which is exactly the population carriers come from.
Reusing it means either every carrier is refused, or somebody deletes the `hd`
check and staff SSO stops being Workspace-only.

| Variable | Notes |
|---|---|
| `GOOGLE_CARRIER_CLIENT_ID` | recommended name — see below |
| `GOOGLE_CARRIER_CLIENT_SECRET` | |

**Naming deviation, flagged rather than made silently.** The original brief said
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. There are already three other Google
clients in this codebase (`GOOGLE_MAPS_API_KEY`, `GOOGLE_OAUTH_*` for Lead Hunter
Gmail, `GOOGLE_SSO_*` for staff Workspace SSO), so a bare `GOOGLE_CLIENT_ID`
among them is exactly the ambiguity the setup gate exists to refuse.

Scopes: `openid`, `userinfo.email`, `userinfo.profile` — **and nothing else.**
Those three are non-sensitive, which keeps Google's verification light. One Gmail
or Drive scope moves it to restricted review with a security questionnaire, and
adding a sensitive scope to a *published* app re-triggers review and can suspend
sign-in for carriers mid-flight.

Full setup: **[oauth-external-app-setup.md](oauth-external-app-setup.md)**.

---

## 4. `SENTRY_DSN` — error telemetry

Sentry is already wired (`Sentry.init`, `enabled: !!SENTRY_DSN`) and activates
the moment the DSN is present. Nothing to build; production currently has zero
error telemetry.

---

## Already set — do not change

`DATABASE_URL` (pooled) and `DIRECT_URL` (**must not** contain `-pooler`) are
both configured and verified. `check-direct-url.js` fails the build in under a
second if `DIRECT_URL` is missing or points at the pooler, so a mistake here is
loud rather than a ten-second migration timeout with no explanation.
See CLAUDE.md §2.2.

---

## After the sitting

| Check | Expected |
|---|---|
| `GET /api/health` → `storage.configured` | `true`, provider not `local-disk` |
| Upload proof run and artifacts deleted | done |
| CI deploy job | green, and actually triggering the deploy |
| Auto-deploy in Render | off, **only after** the job is confirmed green |
