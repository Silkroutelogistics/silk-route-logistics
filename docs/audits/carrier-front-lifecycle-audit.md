# Carrier-front load lifecycle — Phase A audit (2026-09-21, read-only)

Baseline: `8c8d0819` (v3.8.bei on main — authored pre-rebase as `7101574b` v3.8.bdn and re-lettered, with beh for AGREEMENT_MISSING, when the pair landed behind the carrier-archive session's bdm/bdn). Question from Wasi: what happens from tender accept → RC sent → where the load appears in the carrier portal → RC e-signed → BOL access (gated on the signature) → paperwork upload (signed BOL, POD after delivery, then invoice) → invoice upload emails accounting. Audit first, then the optimal carrier-front workflow.

**Production shape at audit time (read-only, `.env.production.local`, `default_transaction_read_only = on`):** 4 live loads — 2 CANCELLED, 1 BOOKED, 1 TONU. `carrier_pays`: 1 PREPARED (the Peace Transport TONU payable). Load documents: 1 `BOL`, 1 `PHOTO_LOADED`. **No load has ever reached DELIVERED.** Every finding past step 4 is therefore latent with zero blast radius, and every one of them fires on the first real delivery.

---

## 1. The flow as it stands, step by step

### Step 1 — Offer → carrier accepts
| | |
|---|---|
| Carrier sees | Tenders page: `GET /carrier/tenders` (OFFERED + unexpired only), Accept / Decline / Counter ([tenders/page.tsx:99-141](../../frontend/src/app/carrier/dashboard/tenders/page.tsx#L99)). Also Available Loads direct accept (`POST /carrier-loads/:id/accept`, self-tender at `carrierRate`, delegates to `acceptTender`), and the emailed magic link (`/tender-action/:token`). |
| Backend on accept | `tenderController.acceptTender`: Load → BOOKED, tender → ACCEPTED, siblings → WITHDRAWN, **DRAFT** RC auto-created ([tenderController.ts:293](../../backend/src/controllers/tenderController.ts#L293)); `notifyTenderAction("ACCEPTED")` → AE in-app + AE email + **carrier confirmation email** (`sendTenderAcceptedConfirmationEmail`). |
| Portal after accept | Row disappears. **No confirmation, no pointer.** Page copy: *"Accepted tenders book the load immediately."* ([tenders/page.tsx:151](../../frontend/src/app/carrier/dashboard/tenders/page.tsx#L151)). The load is now in My Loads under BOOKED with no RC button (nothing to show yet). |

### Step 2 — AE sends the rate confirmation (manual)
| | |
|---|---|
| Who | AE roles only — `POST /rate-confirmations/:id/send` `authorize("BROKER","ADMIN","CEO","DISPATCH","OPERATIONS")` ([routes/rateConfirmations.ts:23](../../backend/src/routes/rateConfirmations.ts#L23)). |
| What | Freezes PDF bytes + `contentHash`, mints a single-use signing token, emails the carrier the PDF with a **"Review and sign"** button ([emailService.ts sendRateConfirmationEmail](../../backend/src/services/emailService.ts)), tender → RC_SENT, writes `Load.rateConfirmationPdfUrl`. |
| Token life | `RC_SIGN_SLA_HOURS`, default **4 hours** — the same constant Needs Attention chases on. The email says *"if it has expired, ask your dispatcher to send a new one."* |
| What chases the AE | `notifyTenderAction("ACCEPTED")`'s in-app row with an `rcId` deep link. **Nothing else.** `needsAttentionService` has four reasons — EXPIRED_NO_LIVE_TENDER, RC_UNSIGNED_PAST_SLA (from RC_SENT), RECENTLY_RELEASED, COUNTER_AWAITING_AE ([needsAttentionService.ts:20-24](../../backend/src/services/needsAttentionService.ts#L20)). **ACCEPTED-with-RC-never-sent is not one of them.** |

### Step 3 — Where the load lives in the portal
| | |
|---|---|
| List | `GET /carrier-loads/my-loads` — every status for `carrierId`, no exclusion ([carrierLoads.ts:146-152](../../backend/src/routes/carrierLoads.ts#L146)). Filter chips stop at DELIVERED ([my-loads/page.tsx:10](../../frontend/src/app/carrier/dashboard/my-loads/page.tsx#L10)) — a POD_RECEIVED/INVOICED/COMPLETED load is only visible under "All". |
| RC | "View Rate Confirmation" renders only once `rateConfirmationPdfUrl` is set, i.e. after the AE sends ([my-loads/page.tsx:191](../../frontend/src/app/carrier/dashboard/my-loads/page.tsx#L191)). It opens `GET /rate-confirmations/:id/pdf`, which for CARRIER 403s `DRIVER_NOT_VERIFIED` until the driver's handset is verified ([rateConfirmationController.ts:565-569](../../backend/src/controllers/rateConfirmationController.ts#L565)) — the emailed PDF carries no such gate. |
| Sign | **There is no sign affordance in the portal.** The emailed link is the only signing surface. The legacy `POST /rate-confirmations/:id/sign` is still CARRIER-authorized ([routes/rateConfirmations.ts:25](../../backend/src/routes/rateConfirmations.ts#L25)), has **zero frontend callers**, and **does not move the tender to CONFIRMED** (no `settleTender` in `signRateConfirmation`) — so even if wired it would leave the BOL gate closed. Two sign paths, different side effects. |

### Step 4 — Carrier e-signs (public link)
| | |
|---|---|
| Backend | `routes/rcSign.ts` POST: single-use, captures name/IP/UA/timestamp/token id, RC → SIGNED, tender RC_SENT → CONFIRMED via `settleTender`, tracking link fanned out to the customer ([rcSign.ts:296-319](../../backend/src/routes/rcSign.ts#L296)). |
| Carrier sees | A page reading *"Signed — thank you. Your signature is recorded and the load is confirmed. **Nothing further is needed.**"* ([rcSign.ts:320-326](../../backend/src/routes/rcSign.ts#L320)). No link to the portal, no BOL, no executed copy emailed, no mention of driver verification. |
| AE sees | The tender's status change on the board. No notification fires at signature. |

### Step 5 — BOL access
| | |
|---|---|
| Gate | `GET /pdf/bol-load/:loadId`: CARRIER must own the load AND a `LoadTender` at **CONFIRMED** must exist, else `403 RC_NOT_SIGNED` with the message *"…The signing link is in the rate confirmation email; if it has expired, ask your dispatcher…"* and `action.href` back to my-loads ([pdfController.ts:217-230](../../backend/src/controllers/pdfController.ts#L217)). AE roles bypass. **The gate works.** |
| Portal | "Bill of Lading" button is rendered on **every** load at **every** status ([my-loads/page.tsx:226-243](../../frontend/src/app/carrier/dashboard/my-loads/page.tsx#L226)); the click surfaces the 403 text inline. The gate is click-then-refuse, never shown in advance. |

### Step 6 — Paperwork
| | |
|---|---|
| On the load | **POD only.** Card appears at AT_DELIVERY or DELIVERED ([my-loads/page.tsx:286](../../frontend/src/app/carrier/dashboard/my-loads/page.tsx#L286)), posts `docType=POD` to `/carrier-loads/:id/documents`. The upload flips status to POD_RECEIVED, which makes the card's own condition false — **it vanishes on success.** No signed-BOL slot, no invoice slot, no lumper/scale/temp-log slot. |
| Documents page | Dropdown: BOL, POD, RATE_CON, W9, COI, AUTHORITY, OTHER ([documents/page.tsx:21-27](../../frontend/src/app/carrier/dashboard/documents/page.tsx#L21)). A load doc goes to `/carrier-loads/:id/documents` with the load picked from a list. **A signed BOL is uploadable only from here, typed "BOL". No INVOICE option anywhere in the portal.** |
| Backend handler | `POST /carrier-loads/:id/documents` stores any docType string; only POD has side effects — `podUrl`, `podReceivedAt`, status → POD_RECEIVED from AT_DELIVERY/DELIVERED/LOADED, `autoGenerateInvoice` (the **customer** invoice), AE in-app notification, shipper POD email ([carrierLoads.ts:610-664](../../backend/src/routes/carrierLoads.ts#L610)). A non-POD upload writes a row and a `LoadActivity` line and tells nobody. |
| Vocabulary | The settlement checklist reads `SIGNED_BOL_PU` / `SIGNED_BOL_DEL` / `POD` / `INVOICE` / `RECEIPT_LUMPER` / `RECEIPT_SCALE` / `TEMP_LOG` ([integrationService.ts:1700-1710](../../backend/src/services/integrationService.ts#L1700)). The portal offers `BOL`, which maps to nothing. The one load document in production is typed `BOL`. |

### Step 7 — The carrier's money
| | |
|---|---|
| CarrierPay is created by | `createCarrierPayOnDelivery`, reached **only** through `onLoadDelivered`, which fires **only** on `status === "DELIVERED"` — carrier status endpoint ([carrierLoads.ts:543](../../backend/src/routes/carrierLoads.ts#L543)), AE status endpoint ([loadController.ts:754](../../backend/src/controllers/loadController.ts#L754)), check-call automation. |
| The portal's POD path calls | `onLoadDelivered`? **No.** `onPODUploaded`? **No.** `syncSettlementDocFlags`? **No.** ([carrierLoads.ts:13](../../backend/src/routes/carrierLoads.ts#L13) imports only `onLoadDelivered`; the documents handler never calls it.) |
| Payment clock | `dueDate` is null at creation unless a POD document already exists ([integrationService.ts:221-222](../../backend/src/services/integrationService.ts#L221)); it is set later by `onPODUploaded` (QP §5 "clock starts when the deficiency is cured") — which only the generic `/documents/upload` path calls ([documentController.ts:228](../../backend/src/controllers/documentController.ts#L228)). |
| `Load.podVerified` | One writer — an AE marking the POD Document VERIFIED ([routes/documents.ts:50](../../backend/src/routes/documents.ts#L50)). **Zero readers on any payment path.** No settlement, approval or mark-paid step gates on a POD at all. |

### Step 8 — Carrier invoice → accounting
| | |
|---|---|
| Carrier UI | No invoice upload control on any page. |
| Backend | `INVOICE` is in the docType vocabulary; via the generic upload path `syncSettlementDocFlags` flips `docCarrierInvoice`. **No email to `accounting@`, no ACCOUNTING-role notification, on any document event.** `ACCOUNTING_EMAIL` ([config/authority.ts:109](../../backend/src/config/authority.ts#L109)) is used only by `arCollectionsService`. |
| Verdict | The requested behaviour does not exist in any form. |

---

## 2. Findings, ranked

**P0 — a carrier who uploads the POD at AT_DELIVERY is never paid.** `podAdvancingStatuses = ["AT_DELIVERY","DELIVERED","LOADED"]` moves the load straight to POD_RECEIVED ([carrierLoads.ts:621-622](../../backend/src/routes/carrierLoads.ts#L621)), skipping DELIVERED, and the handler's own comment says this is the common case. `onLoadDelivered` never fires → no `CarrierPay`, no CPP recalc, no shipper-credit update. The **customer invoice is still generated** on the same path, so SRL bills and does not pay. Zero blast radius today (no load has been delivered); certain on the first one.

**P1 — the portal's POD never starts the payment clock or the document checklist.** If the carrier flips DELIVERED first, the settlement is born with `dueDate: null` and `docPod: false`; the portal POD upload then calls neither `onPODUploaded` nor `syncSettlementDocFlags`, so both stay that way. QP §5 is inert for the carrier's own upload path. Item 210's "flips at its own source event" is true only for the AE's generic upload.

**P1 — two signing paths, one of which does not confirm the tender.** The public link is the real one. `POST /rate-confirmations/:id/sign` records a signature with weaker downstream effects (no CONFIRMED, no tracking fan-out) and is still carrier-authorized. Retire it or route it through the same transition (Item 253.2).

**P1 — nothing chases an AE who accepted a tender and never sent the RC.** One in-app row at accept; no Needs Attention reason for ACCEPTED-with-DRAFT-RC. The carrier sits at BOOKED with no RC and no way to ask.

**P2 — the signing link lives 4 hours and only an AE can re-issue it.** A carrier opening the email that evening is told to ask their dispatcher.

**P2 — every carrier-facing screen is a dead end at the moment it matters.** Accept: no confirmation. Signed page: "Nothing further is needed." BOL button: shown before it can work. POD card: vanishes on success. Payments page: does not say what starts a payment.

**P2 — docType vocabulary is split.** Portal offers `BOL`; settlement reads `SIGNED_BOL_PU`/`SIGNED_BOL_DEL`. Nothing on either side is wrong in isolation; together the checklist can never go green from the portal.

**P3 — `Load.podVerified` gates nothing.** Recorded so nobody reads Item 204 as saying it does.

---

## 3. What the portal should do — proposed carrier-front workflow

Principles carried from the codebase: the **tender is the state machine** (`deriveLoadStatus` already reads it on the AE side); **one seam, not per consumer**; the ratified docType vocabulary and §21.2 numbering are the words; **fail toward not paying the wrong number** never toward not paying at all.

**Stage 0 — Offer (unchanged).** On accept, an inline confirmation: *"Booked. SRL will email the rate confirmation to {email}; sign it to unlock the bill of lading."* with a link to the load.

**Stage 1 — Next-step strip on every load, driven by tender state.** ACCEPTED → *"Rate confirmation on its way from SRL."* RC_SENT → *"Sign the rate confirmation"* with an in-portal Sign button. CONFIRMED → *"Signed. Bill of lading ready"* and the BOL button live; before that the BOL button is disabled with the reason on it. Same helper the AE board uses, so the two never disagree.

**Stage 2 — Sign in the portal, resend from the portal.** Reuse the token path rather than the legacy endpoint: the load detail exposes the live signing URL while unexpired, and a carrier-side **"Send me a new signing link"** mints a fresh token the same way the AE's RESEND_RC does. The legacy `/rate-confirmations/:id/sign` is retired or routed through `settleTender`. The Commit 2 (bdo) BCA backstop sits inside whichever path signs.

**Stage 3 — A Paperwork panel per load, persistent from CONFIRMED onward.** Slots with state (missing / uploaded / verified), on the settlement's own vocabulary: `SIGNED_BOL_PU` (from AT_PICKUP), `SIGNED_BOL_DEL` or `POD` (from AT_DELIVERY), `INVOICE` (from POD_RECEIVED), optional `RECEIPT_LUMPER` / `RECEIPT_SCALE`, `TEMP_LOG` required when the load is reefer. The panel does not vanish on a status flip. The Documents page dropdown adopts the same words and drops bare `BOL`.

**Stage 4 — One document-intake seam.** `/carrier-loads/:id/documents` and `/documents/upload` call one `recordLoadDocument(...)` that always runs `onPODUploaded` + `syncSettlementDocFlags`, and **POD_RECEIVED fires the delivery hooks** when it skipped DELIVERED (the P0). Item 265's shape, applied to load documents.

**Stage 5 — Invoice lands → accounting is told.** On `INVOICE` through the seam: `docCarrierInvoice` flips, ACCOUNTING-role users get an in-app row, and `accounting@` gets an email with load ref, carrier, the CarrierPay figure, and a link to the settlement. The email is what was asked; the in-app row is what an accountant at the desk reads.

**Stage 6 — Close the loop.** Load card shows *"Paperwork complete. Payment due {dueDate}"* off the CarrierPay; Payments rows link back to the load; My Loads gains a Completed chip so a delivered load stays findable.

---

## 4. Decisions needed before any code (recommended option first)

1. **Fix the P0 alone, first** — the portal POD path fires the delivery hooks and the settlement hooks. **Recommended.** Small, self-contained, proven on a container, and it is the one that costs a carrier money.
2. **Is the carrier invoice a gate on standard pay, or informational?** Today nothing gates. **Recommended: required to move PREPARED → APPROVED, with an AE override that records a reason** — QP §5 already frames documentation as the clock-start, so this makes the promise true rather than adding a rule.
3. **In-portal signing shape.** **Recommended: reuse the token page + carrier self-serve resend**, and retire the legacy session sign endpoint. Alternative: a session-authed sign endpoint capturing the same evidence set — more code, second path to keep aligned.
4. **Accounting notification: email, in-app, or both.** **Recommended: both.**
5. **Signing-link life.** **Recommended: keep the 4h AE chase, add the carrier resend.** Alternative: lengthen the token to 24h — simpler, weaker single-use posture.
6. **Required paperwork set.** **Recommended:** `SIGNED_BOL_DEL`-or-`POD` + `INVOICE` required; lumper/scale optional; `TEMP_LOG` required on reefer. Wasi's call — this is what the RC prints as owed within 24h.

## 5. Proposed sequence (each atomic, halt between)

| | Commit | Scope |
|---|---|---|
| bdo | Commit 2 of the BCA arc | as specified — RC signature requires an executed BCA |
| E1 | **P0 + P1 settlement hooks** | POD path → delivery + POD + doc-flag hooks; one intake seam; guard that both upload routes reach it |
| E2 | Next-step strip + accept confirmation + BOL button state | frontend, reads tender state |
| E3 | In-portal sign + self-serve resend; retire legacy sign | backend + frontend |
| E4 | Paperwork panel + vocabulary unification | frontend + Documents dropdown |
| E5 | INVOICE → accounting email + in-app; optional pay gate per decision 2 | backend |
| E6 | Payments ↔ load linkage, Completed chip, signed-page link back | frontend |
| AE | Needs Attention reason `RC_NOT_SENT` for ACCEPTED past N hours | backend, small, AE-side |

---

## 6. Rulings (2026-09-21)

Ratified by Wasi against §4 above. Each is binding for the Phase B sequence; none re-litigates.

### Step 0 — security, before any code

- **Credential exposure.** The Task E census transcript printed the first 14 characters of the `neondb_owner` password. The cause was ordering, not the pattern: the `sed` redaction ran AFTER a `grep` that had already truncated the line before the `@`, so the pattern that masks `://…@` never saw its closing anchor and passed the prefix through. **Wasi: rotate the `neondb_owner` password in the Neon console, then update the Render env and `backend/.env.production.local`.** Going forward, no part of any connection URL is printed by any script or shell line. The redaction is `sed -E 's#(://)[^@]*(@)#\1***\2#g'`, applied to the whole line before any truncation, and it is verified on a dummy string before each use — done 2026-09-21 on three shapes (one URL; a line with no scheme; two URLs on one line), all masked to `://***@`.
- **Read-only role.** A census should never carry the owner credential. **Wasi: create a Neon role with SELECT only** (name suggestion `srl_readonly`) and a separate connection string for it, stored beside the production pair in `.env.production.local` under its own key; census scripts move onto it. Until it exists, every census keeps `SET default_transaction_read_only = on` on the session plus the `neon.tech` host guard. The session guard is real — Postgres refuses the write — but it is a guard placed on a credential that could write, which is the wrong shape; the role removes the capability rather than fencing it.
- The two scratchpad census scripts (`taskE-census.ts`, `taskE-census2.ts`) are deleted.

### The six rulings

1. **P0 first, as E1, ahead of BCA Commit 2.** The Commit 2 spec is unchanged; its letter is assigned from HEAD at commit time, not reserved. Reason: one BOOKED load is live in production, and the P0 is the one that costs a carrier money on the first delivery. This supersedes the §5 table order (bdo → E1 becomes E1 → BCA Commit 2).
2. **Carrier INVOICE is required to move `CarrierPay` PREPARED → APPROVED.** An AE may override, but must enter a reason of at least 10 characters; the override is written to the audit log with who and when. The override is gated to AE roles only.
3. **In-portal signing uses the existing token page.** The portal "Sign" button calls a new session-authed endpoint that (a) verifies `req.user` owns the load and the tender is `RC_SENT`, (b) revokes any live token for that RC, (c) mints a fresh single-use token through the same function `RESEND_RC` uses, and (d) returns a redirect to `/rc-sign/:token`. **Never expose or return a stored token.** "Email me a new link" uses the same mint and sends only to the carrier email on file, never to an address from the request. Rate limit: 3 mints per RC per hour, 429 beyond that. Every mint is audit-logged. The legacy `POST /rate-confirmations/:id/sign` route and handler are **deleted** (Item 158 precedent), and a guard test asserts the route is gone.
4. **Accounting is notified by both channels:** an email to `ACCOUNTING_EMAIL` and an in-app row for ACCOUNTING-role users. Email content: load ref, carrier name, `CarrierPay` amount, and an auth-gated settlement link. No attachment, no bank or tax data.
5. **Keep the 4h token and the AE chase.** The carrier self-serve resend comes from ruling 3.
6. **Required paperwork:** `SIGNED_BOL_DEL` or `POD`, plus `INVOICE`. `TEMP_LOG` is required when the load is reefer. `RECEIPT_LUMPER` and `RECEIPT_SCALE` are optional. `SIGNED_BOL_PU` is accepted from AT_PICKUP but is not required.

### Sequence as ratified (atomic; any commit past 4 files or 100 LOC is split)

| | Commit | Scope |
|---|---|---|
| E1 | P0 + P1 settlement hooks | one `recordLoadDocument(...)` seam behind both upload routes; always `onPODUploaded` + `syncSettlementDocFlags`; POD advancing past DELIVERED fires `onLoadDelivered`; server-side docType allowlist (400 on unknown), MIME + size limits on both routes; `createCarrierPayOnDelivery` idempotent (existing non-VOID row = no-op); guard that both routes reach the seam; adversarial: re-instate the AT_DELIVERY skip and watch the tests go red |
| BCA Commit 2 | as specified (was bdo; shipped as v3.8.bep) | the BCA backstop sits inside `/rc-sign` POST, the only remaining sign path once E3 lands |
| E2 | accept confirmation + next-step strip + BOL button state | strip driven by tender state through the same helper the AE board uses; BOL disabled with the reason shown until CONFIRMED |
| E3 | ruling 3 in full | sign-mint endpoint, self-serve resend, rate limit, legacy route deleted + guard |
| E4 | paperwork panel + vocabulary | persistent from CONFIRMED with missing/uploaded/verified slots; Documents dropdown adopts the vocabulary and drops bare `BOL`; the existing production `BOL` row is left untouched and reported |
| E5 | INVOICE through the seam | flips `docCarrierInvoice`, fires the ruling-4 notification; PREPARED → APPROVED gate + override per ruling 2 |
| E6 | close the loop | Payments rows link to the load; My Loads gets a Completed chip; the signed page links back to the portal load and states the BOL is now available |
| AE | Needs Attention `RC_NOT_SENT` | ACCEPTED + DRAFT RC older than `RC_SEND_SLA_HOURS` (env, default 1); same shape as `RC_UNSIGNED_PAST_SLA`, with a test |

Gates per commit: backend `tsc` → `npm test` → frontend `tsc` → `next build` → E2E on 3110/4100. Explicit-path staging only; letter assigned from HEAD at commit time. **beh, bei and every Task E commit push together, only on Wasi's GO**, after the full gate output and the letter table are shown.
