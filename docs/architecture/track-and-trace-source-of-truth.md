# Track & Trace Source-of-Truth — Current-State Documentation

**Version:** 1.0 · 2026-04-30
**Status:** Current-state documentation. Future-state decisions explicitly deferred with named triggers.
**Closes:** Phase 5E gap #3 (T&T source-of-truth / PII scope decision)
**Companion to:** SRL Phase 1 Foundation Document, SOP 3 (Track & Trace Cadence)

---

## Purpose

Document the actual current state of how tracking data flows through SRL today, so future architectural decisions have a clean baseline. This document does NOT decide future-state architecture. Items requiring inputs we don't have yet (ELD integration, customer-facing visibility rules with real customer feedback, Phase 5/6 cutover timing) are explicitly marked as deferred with the trigger that should reopen them.

This is a working artifact. Update when triggers fire.

---

## 1. Today's source of truth

### Where tracking events are written

**Single source of truth:** `Load.trackingEvents[]` (Prisma model field on the `Load` record)

**Write paths active today:**
- AE Console → Track & Trace module → load detail drawer → status advancement button (v3.8.e shipped 2026-04-29)
- Load Board → load row → status advancement button (pre-existing)
- Direct API: `PATCH /loads/:id/status` with `VALID_TRANSITIONS` validation in `loadController.ts:435`

**Auth gating on writes:** BROKER, ADMIN, CEO, DISPATCH roles only. SHIPPER and CARRIER cannot write tracking events directly today.

**Server-side side effects on status change:**
- `logLoadActivity` — writes to activity log
- Check-call schedule updates per `createCheckCallSchedule`
- `Load.updatedAt` timestamp refreshed
- (Reference: `loadController.ts updateStatus` controller method)

### What "tracking event" actually means today

Today's tracking events are status transitions, not GPS positions. A "tracking event" is a record like:
- `BOOKED → DISPATCHED` at timestamp T, written by user U
- `DISPATCHED → AT_PICKUP` at timestamp T+24h, written by user U'

The 9-stage milestone timeline visible on the public /tracking page (Booked / Dispatched / At Pickup / Picked Up / In Transit / At Delivery / Delivered / POD Received / Invoiced) is rendered by mapping `Load.status` and `Load.trackingEvents[]` to the timeline UI.

**There is no GPS data today.** "Last known location" on the /tracking page renders em-dash (—) because no GPS source is wired. This is correct current-state behavior, not a bug.

### Manual update cadence

Per SOP 3 (Track & Trace Cadence):
- **Tier A (Premium customer + new carrier + long-haul):** AE updates status every 2 hours during driver's active HOS window
- **Tier B (Premium customer + proven carrier + long-haul):** Every 4 hours during HOS window
- **Tier C (Standard customer + proven carrier + short-haul):** At pickup, mid-transit, delivery
- **Tier D (Exception):** Hourly until exception resolved

Updates are entered by AE staff via T&T or Load Board UI based on phone calls to driver/dispatch, or carrier app data (Carvan when carriers use it), or carrier TMS API integrations (none active today).

---

## 2. PII scope on public /tracking

### What's visible publicly today

Per v3.8.d serializer (`backend/src/controllers/trackingController.ts`):
- Load reference number (e.g., L2228322560)
- Origin city/state (e.g., "Northlake, TX")
- Destination city/state (e.g., "Lebanon, PA")
- Equipment type (e.g., "Dry Van 53'")
- Commodity description (e.g., "Lozenges")
- Weight aggregate
- Status (current state in 9-stage timeline)
- 4-stage progress strip
- Last known location (em-dash today, no GPS source)
- Estimated delivery window with confidence percentage
- Shipper company name (e.g., "Beekeepers Naturals USA Inc.")
- "Need Help?" footer with SRL contact info

### What's explicitly stripped from public

- **Carrier name** — renders as "—". Public should not see which carrier is hauling (carrier solicitation prevention)
- **Rate** — never serialized to public endpoint
- **Internal references** — internal load notes, AE comments, broker margin
- **PO numbers** — visible on BOL (internal document) but not on /tracking (public surface)
- **Driver name** — never exposed publicly
- **Truck/trailer numbers** — never exposed publicly
- **Carrier MC/DOT** — never exposed publicly
- **Customer's logistics contact name/phone** — protected as customer PII

### Why this scope

The /tracking page is designed for **receivers** (Mainfreight DC personnel, BKN's destination contacts, etc.) who need to know "where is the load" but should not have access to the brokerage relationship details. The QR code on the BOL routes here, so anyone scanning the printed BOL can check status without authentication.

The PII boundary is deliberately drawn so that even if a competitor scanned a BOL QR, they wouldn't gain commercial intelligence (carrier, rate, broker margin, customer pricing structure).

### 2.5 Display granularity vs. industry public-tracker patterns

The public /tracking page's display granularity (what stages to show, in what detail) is a separate concern from PII scope. Worth documenting since it surfaces UX questions distinct from privacy questions.

**Industry split observed (2026-04 spot check of public broker tracking surfaces):**

Among large North American brokers, public-facing tracking falls into two camps:

**Camp 1 — Login-gated (no public page):**
- C.H. Robinson Navisphere requires full account login. No unauthenticated tracking surface for shippers, receivers, or carriers.
- Coyote's primary portal is also account-gated.

**Camp 2 — Public-token (no login required):**
- RXO operates `track.rxo.com` and `rxo.com/track/` accepting tracking numbers with no login
- Coyote operates `tracking.coyote.com` accepting tracking numbers with no login
- SRL's `/tracking?token={loadNumber}` follows the same architectural pattern

Both camps exist in production at scale. SRL's public-token model is a deliberate choice fit for the receiver use case (Mainfreight DC scanning a BOL QR without needing an account). It's not unusual.

**Common patterns observed in Camp 2 public trackers:**

For truckload/FTL freight, public-tracker milestone displays tend toward 4-5 high-level stages rather than the operational 9-stage timeline used internally by ops teams. Common public-tracker stages:

1. Booked / Tendered
2. Picked Up
3. In Transit
4. Delivered
5. POD Received (sometimes omitted)

The intermediate operational stages (Dispatched, At Pickup, At Delivery, Invoiced) are tracked internally but typically not surfaced to public-tracker viewers because:
- Receivers care about the high-level shipment state, not internal ops state
- "Pending" placeholders for future milestones add visual noise without adding information
- Public-tracker viewers usually visit once or twice per load, not continuously — granularity beyond high-level state isn't actionable for them

**Display rendering patterns observed:**

Two common patterns in Camp 2:
- **Achieved-only:** render only milestones that have occurred; future milestones are not shown until they happen. Timeline grows as events fire.
- **Skeleton-with-state:** render all stages with visual treatment indicating which are complete vs. pending. Skeleton is static; state is dynamic.

The skeleton-with-state pattern is what SRL ships today, with the full 9-stage internal timeline rendered to public viewers. This is structurally correct (nothing private leaks) but operationally noisy when most stages are "Pending".

**SRL's current state:**

Public /tracking page renders the full 9-stage skeleton (Booked / Dispatched / At Pickup / Picked Up / In Transit / At Delivery / Delivered / POD Received / Invoiced) with "Pending" status on unfired stages. This was the correct foundational implementation for v3.7.k Phase 5E.a (operational visibility into the full state machine), but emerges as visual noise on receiver-facing surfaces.

**Status:** Display granularity is queued for refinement as a Phase 6 sprint candidate (proposed v3.8.f — Public /tracking timeline simplification to 5-stage display). Current implementation is functionally correct; refinement is UX polish, not architectural change.

**Reference for Phase 6 work:**
- 5-stage public timeline aligns with common Camp 2 broker tracker patterns (RXO, Coyote)
- 9-stage internal timeline preserved in AE Console + Shipper Portal where operational granularity is useful
- No PII scope changes implied by display granularity change — same fields rendered, fewer stage rows

---

## 3. Authentication boundaries

### Public /tracking (no auth)

- Token-based access: `silkroutelogistics.ai/tracking?token={loadNumber}`
- Token = load number (not a rotating secret); enumerable but combined with PII strip, low risk
- No session cookie required
- Correct for receiver/dispatch use case where authentication friction would defeat the purpose

### AE Console (full auth)

- BROKER / ADMIN / CEO / DISPATCH roles
- Sees full Load record including all tracking events, carrier, rate, internal comments
- Sees write controls (status advancement buttons in T&T drawer + Load Board)

### Shipper Portal (`/shipper/dashboard`)

- SHIPPER role + `customer.onboardingStatus = APPROVED` (v3.8.e.1 gate)
- Today: read-only access to own customer's loads
- Sees own loads' status timeline (same data as public /tracking + customer-specific context)
- Does NOT see carrier name, rate, broker margin (same PII boundary as public)

### Carrier Portal (`/carrier/dashboard`)

- CARRIER role + carrier approval gate (pre-existing)
- Sees own carrier's assigned loads
- Sees status of assigned loads (write capability for carrier-app status updates is partial — phone-based AE updates dominate today)

---

## 4. Explicit non-decisions (deferred items)

The following architectural questions are NOT decided in this document. Each has a named trigger that should reopen the question.

### Decision 4.1 — ELD integration vendor

**Question:** Samsara vs Motive vs Geotab vs other for fleet tracking integration?

**Status:** Deferred.

**Trigger to reopen:** SRL acquires its own truck/driver (carrier MC). Per project memory, this is post-E-2 visa approval and tied to BIPD insurance ($750K) acquisition. Current state: pure brokerage, no fleet, no ELD need.

**What current state does NOT preclude:** Adding ELD integration later. The `Load.trackingEvents[]` model is a flexible source-of-truth that can be augmented by GPS pulls without schema migration. Future-state can add automated tracking events alongside manual ones.

### Decision 4.2 — Customer-facing visibility rules refinement

**Question:** Should specific customers see different visibility scopes (e.g., a customer who pays premium for white-glove tracking sees driver name + truck#, while standard customers see today's PII-stripped view)?

**Status:** Deferred.

**Trigger to reopen:** First customer explicitly requests expanded visibility OR first customer explicitly objects to current scope. Today's scope is uniform across all shipper portal users.

**Why not decide now:** Real customer feedback changes the answer. Designing tiered visibility before BKN's first load risks designing for hypothetical needs.

**What current state does NOT preclude:** Adding customer-tier-based visibility later. The serializer in `trackingController.ts` is a single boundary; tiering can be added there based on `customer.tier` or feature flag without rearchitecting upstream data.

### Decision 4.3 — Phase 5/6 cutover for tracking architecture

**Question:** When does T&T move from "manual entry by AE" to "primarily ELD-driven with manual fallback"?

**Status:** Deferred.

**Trigger to reopen:** Either (a) ELD integration ships per Decision 4.1, OR (b) load volume exceeds AE's capacity to manually update at SOP 3 cadence. Capacity question becomes real around 30-50 loads/month with one AE; current pre-launch volume is far below.

**Why not decide now:** Both triggers are months out. Decision quality is higher when the actual volume + ELD pattern emerges.

### Decision 4.4 — Carrier self-service status updates

**Question:** Should carriers be able to write tracking events via Carvan app or carrier portal, instead of AE-mediated phone updates?

**Status:** Deferred.

**Trigger to reopen:** Carrier feedback on phone-call cadence becomes negative (carriers complain about call frequency) OR carrier portal usage data shows carriers actively wanting this capability.

**Today's deliberate choice:** Phone-mediated updates by AE are the default because (a) they create AE-carrier relationship touchpoints (Path 2 quality signal), (b) they catch exceptions early (driver issues, weather, route deviation), (c) they generate data for carrier scorecard. Self-service would lose these.

### Decision 4.5 — Customer self-service tracking updates

**Question:** Should shippers see a write capability (e.g., "delivery exception noted by receiver") on their portal?

**Status:** Deferred.

**Trigger to reopen:** First customer explicitly requests this OR first claim event reveals data that customer wishes had been captured.

**Today's deliberate choice:** Customer portal is read-only. Exceptions and POD-received events are AE-mediated.

---

## 5. Risks in current state

### Risk 5.1 — Manual entry creates lag

**Problem:** AE updates lag behind reality. A driver who picked up at 09:00 may have status updated to "Picked Up" at 09:30 when AE makes the next scheduled call.

**Mitigation today:** SOP 3 Tier A cadence (every 2 hours during HOS) keeps lag bounded. Customer-visible /tracking page shows "last update" timestamp so receivers can calibrate expectations.

**Real consequence:** ETA confidence percentage on /tracking will under-perform reality during transit. Acceptable today; surfaces as a metric to watch when load volume grows.

### Risk 5.2 — Single point of failure on AE availability

**Problem:** If AE is unavailable (out sick, on PTO, asleep), tracking updates pause. SOP 3 doesn't currently document escalation paths for AE unavailability.

**Mitigation today:** Solo founder operation = no redundancy. Acceptable at pre-launch volume (BKN ~5-8 loads/month, manageable for single-operator coverage).

**Trigger to address:** First hire (Pakistan EOR Compliance/AE per project memory, target October 2026). At that point, document handoff/coverage SOP.

### Risk 5.3 — Token enumeration on public /tracking

**Problem:** Token = load number, which follows a sequence. Anyone iterating through load numbers can view status of any load.

**Mitigation today:** PII strip means enumeration yields no commercially useful data — origin/destination city, status, commodity description. This is roughly equivalent to what's visible on a BOL itself, which is not considered confidential by industry norms.

**Real consequence:** Low. The information accessible via enumeration is less than what a competitor would gain by physically intercepting one of our BOLs.

**Trigger to address:** Customer explicitly requests stronger access control (e.g., a high-value commodity customer wants tokens that aren't enumerable). Implementation would shift from `loadNumber` to a separate UUID `trackingToken` field on the Load record.

---

## 6. Architecture decisions made implicitly today (worth surfacing)

These are decisions that were made by code shipping rather than by explicit design conversation. Worth documenting so they're searchable.

### 6.1 — Single source of truth, not eventual consistency

`Load.trackingEvents[]` is the canonical source. The /tracking serializer reads from this. The shipper portal reads from this. AE Console reads from this. There is no separate "public-tracking-snapshot" table or denormalized cache. Single source means no consistency gymnastics; trade-off is read load on the loads table at /tracking serialization time.

This was made implicit by the v3.7.k Phase 5E.a foundation choosing to read directly from Load record.

### 6.2 — Status state machine over free-form events

Status transitions go through `VALID_TRANSITIONS` (loadController.ts:435). You cannot skip from BOOKED to DELIVERED. You cannot go backward. Each transition is validated server-side.

This was made implicit by the original Load schema design pre-Phase 5E.

### 6.3 — Public access via token, not signed URL

Tokens on /tracking are URL parameters, not signed/expiring URLs. Anyone with the URL has access indefinitely.

This was a deliberate choice for receiver use case (Mainfreight DC scanning the BOL six months after delivery for audit purposes should still work). Trade-off: no revocation mechanism. Acceptable given PII strip.

### 6.4 — PII boundary at serializer, not at controller

Decode of HTML entities + PII stripping happens in `trackingController.ts decodeOpt()` at the response serialization boundary. The underlying Load record is unchanged.

This was made explicit by v3.8.d's HTML encoding fix and is the correct location: PII rules belong at the boundary of trust transitions, not at storage.

---

## 7. What this document does NOT address

Out of scope. If any becomes relevant, surface for separate discussion:

- **GPS / geolocation strategy** — no GPS source today. ELD acquisition (Decision 4.1) is the trigger.
- **Real-time push notifications** — current model is pull (receiver visits /tracking). Push (email/SMS at status change) is a separate sprint candidate, currently unscoped.
- **Tracking event history retention** — currently retained indefinitely on Load record. No TTL policy. Worth revisiting when database storage costs become non-trivial.
- **Multi-leg shipments** — single Load = single origin → single destination today. Multi-leg/intermodal would need schema work.
- **POD photo storage / CDN strategy** — POD upload to SRL platform mentioned in SOP 1; storage architecture not addressed here.
- **Audit logging on tracking events** — `logLoadActivity` writes to activity log, but the audit trail's completeness for compliance/legal purposes is not analyzed here.

---

## 8. Update triggers

Update this document when any of the following fire:

- Any §4 deferred decision gets reopened by its named trigger
- Any §5 risk's mitigation changes
- New write path added to `Load.trackingEvents[]` (e.g., carrier app integration)
- New read surface added (e.g., new portal type)
- PII scope rules change (any §2 field moved into or out of public scope)
- §2.5 display granularity changes (e.g., v3.8.f public timeline simplification ships)
- ELD integration ships
- First Phase 6 architectural sprint touches T&T architecture

---

## 9. Document version

**v1.0** — 2026-04-30
Drafted as Phase 5E.c housekeeping per CLAUDE.md §13.2.
Closes Phase 5E gap #3 (T&T source-of-truth scoping decision) at "current-state documented; future-state explicitly deferred with triggers" level.

This document is a working artifact. Update when triggers fire. Do not predict the future-state in this doc; let real triggers drive real decisions.

---

**End of T&T Source-of-Truth current-state documentation.**
