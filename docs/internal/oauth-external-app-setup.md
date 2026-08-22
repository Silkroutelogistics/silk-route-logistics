# Carrier OAuth — the external app, and why it cannot be one of the three we already have

**Status: BLOCKED on this setup. Arc 30 stopped cleanly at its Step 0 gate.**

Carrier "Sign in with Google" (§13.3 Item 217 B3) is designed and specified and
cannot be built until an **External** OAuth client exists. This is the console
work that unblocks it. It is Wasi's to do — it needs a Google Cloud account with
billing and org access, and it ends in a verification review Google runs on its
own schedule.

Last reviewed: 2026-08-22, Arc 30.

---

## The finding that matters most

**The carrier app must be a NEW client. It cannot reuse the staff SSO client,
and trying would silently break staff SSO.**

`ssoService.ts` refuses any identity whose `hd` claim is not
`silkroutelogistics.ai`, at [`ssoService.ts:106`](../../backend/src/services/ssoService.ts).
The code's own comment says it plainly:

> Covers both a personal gmail.com account (no hd at all) and any other domain

That is precisely the population carriers are drawn from — `gmail.com`,
`outlook.com`, and their own company domains. So one of two things would happen
if the staff client were reused:

- every carrier is refused `sso.wrong_domain`, or
- somebody removes the `hd` check to make carriers work, and **the guarantee that
  only SRL Workspace accounts can reach staff SSO is gone** — the guarantee the
  concurrent session proved by breaking it in its Leg 8 adversarial sweep.

The second is the dangerous one, because it looks like a small edit and it is a
security regression. Separate client, separate consent screen, separate
credentials.

---

## What already exists (so the fourth one is named unambiguously)

| Client | Env prefix | Purpose | Credentials set? |
|---|---|---|---|
| Maps | `GOOGLE_MAPS_API_KEY` | geocoding; not OAuth at all | yes |
| Lead Hunter Gmail | `GOOGLE_OAUTH_*` | reply tracking on outreach | — |
| **Staff Workspace SSO** | `GOOGLE_SSO_*` | AE/admin sign-in, `hd`-locked, **Internal** | **no — shipped but dormant** |
| **Carrier sign-in** | `GOOGLE_CARRIER_*` | ← this document | **no** |

**Naming.** The Arc 30 brief called these `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
Recommending `GOOGLE_CARRIER_*` instead, and flagging the deviation rather than
making it silently: a bare `GOOGLE_CLIENT_ID` in a codebase that already holds
three prefixed Google clients is exactly the ambiguity this gate exists to
refuse, and the next reader would have to open three files to learn which client
it belongs to. If you prefer the bare name, say so and it will be used.

**Note while you are in the console:** `GOOGLE_SSO_*` is also unset, so staff SSO
is shipped and dormant. Both clients are most easily created in one sitting.
That is the other session's item, not this one — but you will be on the right
screen for it.

---

## Console setup

### 1. Project

Use a **separate Google Cloud project** from the staff SSO one, or at minimum a
separate OAuth client within it. A separate project is cleaner: the consent
screens are configured per project, and the carrier screen is public-facing
while the staff screen is not.

### 2. OAuth consent screen — **User type: External**

This is the setting that distinguishes this client from the staff one. Internal
restricts sign-in to the SRL Workspace; External is what allows a carrier at
`gmail.com` or `acmetrucking.com` to sign in at all.

| Field | Value |
|---|---|
| App name | Silk Route Logistics |
| User support email | operations@silkroutelogistics.ai |
| App logo | the SRL compass mark (`frontend/public/logo-compass.png`) |
| Application home page | https://silkroutelogistics.ai |
| Privacy policy | https://silkroutelogistics.ai/privacy |
| Terms of service | https://silkroutelogistics.ai/terms |
| Authorised domain | silkroutelogistics.ai |
| Developer contact | whaider@silkroutelogistics.ai |

Both policy pages are live and were content-audited in v3.8.amk, so they will
pass review on their content. The logo must be square and under 1MB.

### 3. Scopes — request the minimum, deliberately

```
openid
.../auth/userinfo.email
.../auth/userinfo.profile
```

**Nothing else.** These three are non-sensitive, which is what keeps the
verification review light. Adding any Gmail, Drive or Calendar scope moves this
into sensitive/restricted review — weeks, plus a security questionnaire, plus
possibly a third-party assessment. Carrier sign-in needs identity and nothing
more; `email` and `email_verified` are the only claims the linking rule reads.

### 4. Credentials → OAuth client ID → **Web application**

**Authorised redirect URIs** — all of them, exactly:

```
https://api.silkroutelogistics.ai/api/carrier-auth/oauth/google/callback
http://localhost:5000/api/carrier-auth/oauth/google/callback
```

Production first; the localhost entry is for development. Port 5000 matches the
backend's default; if you run it elsewhere, add that port too — Google matches
redirect URIs exactly, including port, and a mismatch fails with
`redirect_uri_mismatch` at the callback rather than at sign-in, which is a
confusing place to debug.

The path deliberately sits under `/carrier-auth/` so it inherits the carrier
mount rather than the staff `/auth/sso/google/callback` one.

**Authorised JavaScript origins** are not needed — this is a server-side
authorization-code flow, not implicit.

### 5. Publish, and expect the review

An External app starts in **Testing**, where only accounts on an explicit test-user
list can sign in — up to 100. That is usable for the Arc 30 dev proof and for a
first pilot carrier without publishing anything.

**Publish to Production** when it goes to real carriers. With only the three
non-sensitive scopes above, this is normally quick — often no manual review at
all. Budget a few days rather than assuming same-day, and do not schedule a
carrier onboarding push against an unpublished app.

**Do not add sensitive scopes later without re-reading this.** Adding one to a
published app re-triggers review and can suspend sign-in for existing carriers
mid-flight.

### 6. Microsoft (optional, second)

Google first — it covers most carriers. If Microsoft is wanted, Azure AD app
registration, **Accounts in any organizational directory and personal Microsoft
accounts**, redirect URI
`https://api.silkroutelogistics.ai/api/carrier-auth/oauth/microsoft/callback`,
scopes `openid email profile`. Env prefix `MICROSOFT_CARRIER_*`.

---

## Handing the values over

Four env vars, on Render and in local `backend/.env`:

```
GOOGLE_CARRIER_CLIENT_ID=<from the console>
GOOGLE_CARRIER_CLIENT_SECRET=<from the console>
GOOGLE_CARRIER_REDIRECT_URI=https://api.silkroutelogistics.ai/api/carrier-auth/oauth/google/callback
GOOGLE_CARRIER_ALLOW_TESTING_MODE=true    # while the app is unpublished; remove after
```

**Send the secret through something other than chat.** Render's dashboard
directly is best — it never needs to exist anywhere else.

Per §19 Sub-pattern 11, an `env()` addition has to land in **four** places, and
the fourth is the one that gets forgotten: local `.env`, the Render dashboard,
the CI workflow env blocks for any job that reads it, and `CLAUDE.md §2.2`. The
Zod schema in `backend/src/config/env.ts` is where they are declared; follow the
`GOOGLE_SSO_*` entries directly above as the pattern.

---

## What gets built the moment these exist

Specified in §13.3 Item 217 and unchanged by this document. Recorded here so the
work is not re-derived:

- **Sign-in only.** OAuth replaces the password. **TOTP still fires afterwards
  for every enrolled carrier** — OAuth is one factor, not two.
- **Authorization code + PKCE + state.** State verified server-side; a forged
  state is refused and recorded.
- **Linking requires `email_verified: true` AND a matching verified SRL email.**
  Provider + subject are persisted at first link, and **every subsequent login
  matches on subject, never on email** — an email can be reassigned by a
  Workspace admin, a subject cannot.
- **NEVER mint a User.** An OAuth identity with no existing account is routed to
  registration and completes full onboarding, TOTP wall included. This is the
  pinned constraint: without it, OAuth becomes a way around onboarding, and the
  concurrent session's staff SSO refuses auto-provisioning for the same reason.
- **Password coexists.** Unlinking requires step-up, and removing the last
  remaining sign-in method is refused.
- **Every event through `auth_events`**, reusing the conventions in
  `lib/authEvents.ts` rather than forking them.
- **Compass identity inputs (B3g)** — provider, subject, `hd`/`tid`, `linkedAt`,
  plus three additive signals. **Neutrality is pinned: no existing carrier's
  score moves at launch, and never having linked OAuth never costs points.**

---

## Why the arc stopped here rather than building it dark

A sign-in path that cannot be exercised end to end is a sign-in path nobody has
seen work. It would sit in the auth surface — the highest-risk area in this
repo — unexercised until the day it carries a real carrier, and the first person
to test it would be that carrier.

Arc 27 is the argument. A change to the carrier auth mount was correct in
isolation, compiled, passed CI, and locked every carrier out of production for
27 hours because no path exercised the front door. Building an unusable OAuth
flow into that same mount, with no way to run it, would be repeating that with
the lesson already written down.
