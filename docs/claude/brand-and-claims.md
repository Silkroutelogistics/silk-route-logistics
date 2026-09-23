# Brand, claims and public-page standards — §4, §5, §6, §7, §12, §20

Moved out of `CLAUDE.md` on 2026-09-23. **Load this before touching any public
marketing surface**: the homepage and the other 12 static pages, the Marco Polo
chatbot prompts, Lead Hunter outreach copy, or any artefact bearing a claim about
what SRL does.

It is here rather than resident because a session working on a backend gate, a
migration or a PDF renderer does not need the prohibited-claims list loaded to do
its work, and it was ~16,000 tokens of every session.

**§5 still contains the canonical accessorial ladder** — detention $50/hr after 2h
free, $250/stop cap, conversion to layover at hour 7, TONU $200 flat. That is
operational policy sitting inside a prohibited-claims list, which is the last place
a reader would look; relocating it is queued as its own change rather than folded
into a move, because moving content and re-filing it are different acts and only
one of them is byte-provable.

Section numbers unchanged; see `README.md`.

---

## §4 HONEST CLAIMS WHITELIST (authoritative)

Only these claims may appear on public marketing pages:

1. **FSC itemized on every rate confirmation** — line-haul, fuel surcharge, and accessorials shown as separate line items; rate-con total equals settlement total. Per v3.8.aib Sprint 1 honesty pass, the prior "tier-graduated FSC pass-through" framing (Silver: loaded miles; Gold: loaded + empty miles; Platinum: all miles) was retired — shipper-billed FSC is loaded-miles-only by industry formula, so tier-graduated pass-through on empty/all miles requires SRL to pay from margin (unbacked pre-revenue). Stronger claims ("100% pass-through" / "pass-through on loaded miles") are HELD until the operational pricing model is confirmed. The itemized-on-RC framing is what's verifiable today.
2. Itemized quotes, no post-booking clipping
3. No factoring contract required to use Quick Pay
4. Performance-based tier advancement via Milestones M1–M6 (advancement independent of fleet size)
5. Published Quick Pay fees: Silver 3% / Gold 2% / Platinum 1% at 7-day standard; +2% for same-day at any tier
6. Free standard pay by tier: Silver Net-30, Gold Net-21, Platinum Net-14
7. ~~Tier-based quarterly safety bonuses at Gold ($450/qtr) and Platinum ($900/qtr)~~ — **RETIRED v3.8.aib Sprint 1.** No SafetyScore tracking + monthly payout backend. Cannot honor claim until built. Moved to §5 prohibited.
8. ~~Tier-based referral bonuses ($250 / $500 / $750)~~ — **RETIRED v3.8.aib Sprint 1.** No ReferralCode/Referral Prisma schema, no attribution mechanism at first-load-delivered, no payout workflow. First referrer would have no way to be paid. Moved to §5 prohibited.
9. ~~Tier-based detention pay~~ — **RETIRED v3.8.aib Sprint 1.** Industry research (TQL, C.H. Robinson, Echo, Coyote, RXO, Landstar) shows uniform-rate or shipper-pass-through detention models; NONE differentiate by carrier tier. Moved to §5 prohibited.
10. Property broker registered under FMCSA authority (USDOT 4526880, MC# 1794414), BMC-84 bond on file
11. 7-factor transparent Compass Score (published on /carriers)
12. Marco Polo AI assistant is 24/7 (AI software is always on)
13. **Pay-ladder tier differentiation** (added v3.8.aib Sprint 1) — Silver Net-30 + 3% QP, Gold Net-21 + 2% QP (9 days faster + 1 point lower than Silver), Platinum Net-14 + 1% QP (7 days faster than Gold, lowest fee). This is the canonical tier-cards spine since pay terms + QP fees are broker-controlled and verifiable; all other tier-based claims (FSC tier-graduation, safety, referral, detention) retired per items 7-9 + 1.
14. **Day-1 Silver entry** (added v3.8.aib Sprint 1) — every approved carrier starts at Silver regardless of fleet size; public Compass Score visible from load #1. Real per §10 M1.
15. **Universal floor benefits** (added v3.8.aib Sprint 1) — every approved carrier gets these 10 capabilities regardless of tier, all verified live per Phase A audit: Marco Polo AI 24/7 dispatch (§4#12), BMC-84 $75K bond protection (§1), Compass Score portal-visible (§4#11), FSC itemized on every rate confirmation (Commitment #2 + `pdfService.ts`), auto rate-confirmation within seconds of accept (Sprint Phase 2 v3.8.acd), branded tracking links (§20.3 Lens 1.5 + v3.7.k), mobile POD upload (`documentController`), SRL-handled check calls (`CheckCall` Prisma model), in-portal dispute resolution (`notificationService` DISPUTE types + accounting/disputes), Compass-Engine-enforced no-double-brokering (`chameleonDetectionService.ts`). Live tile inventory on /carriers per v3.8.aib "Every Caravan Partner gets" section.

---

## §5 PROHIBITED CLAIMS (must not appear on marketing pages)

- Volume stats without real numbers (carrier counts, load counts, on-time percentages)
- Named customer testimonials unless a real carrier/shipper provided one in writing
- "Asset-based" / "our fleet" / "our trucks" / "we own"
- "Zero dispatch commission" / "$0 Commission" / "Zero Commission" (retired positioning)
- "Zero factoring fees" (misleading — replaced by no-contract framing)
- Blanket "100% FSC pass-through" / "Full FSC pass-through" framing (retired 2026-05-19 v3.8.ads — overstated). UPDATE v3.8.aib Sprint 1: the "tier-graduated FSC pass-through" framing (Silver: loaded miles; Gold: loaded + empty; Platinum: all miles) ALSO retired — shipper-billed FSC is loaded-miles-only by industry formula, so pass-through on empty/all miles requires SRL to pay from margin (unbacked pre-revenue). Use "FSC itemized on every rate confirmation" instead until operational pricing model is confirmed.
- "Tier-based quarterly safety bonuses" / "$150/mo safety bonus" / "$300/mo safety bonus" / "$450/qtr" / "$900/qtr" — retired v3.8.aib Sprint 1. No SafetyScore tracking + monthly payout backend exists. Cannot honor the claim until built. Held entirely until operational mechanism is in place.
- "Tier-based referral bonuses" / "$250 / $500 / $750 referral bonus" — retired v3.8.aib Sprint 1. No `ReferralCode` Prisma model, no `Referral` attribution model, no first-load-delivered qualification trigger, no payout workflow. First carrier to refer someone would have no operational way to be paid. Held entirely. Multi-sprint backend build required before claim returns.
- "Tier-based detention pay" / differentiated $/hr by tier (e.g., Silver $50/hr, Gold $65/hr, Platinum $75/hr) — retired v3.8.aib Sprint 1. Industry-standard research showed uniform-rate or shipper-pass-through detention models across all major brokers (TQL, C.H. Robinson, Echo, Coyote, RXO, Landstar); NONE differentiate by carrier tier. Differential pay by tier for the same wait time at the same shipper risks DOT/FMCSA discrimination optics. **Canonical uniform accessorial policy (ratified 2026-08-14, v3.8.arn) — the figures SRL actually prints:** detention is **$50/hr for ALL equipment types after 2 hours free time at each stop, capped at $250 per stop**; TONU is **$200 flat**; layover is **$250 per day**. The cap is deliberately EQUAL to the layover day rate (ratified 2026-08-14, v3.8.ars): at $200 detention stopped accruing at billable hour 4 while auto-layover only fired at hour 24, leaving an 18-hour gap where a held carrier earned nothing. At the cap detention CONVERTS to layover and the two do not stack for the same hours. **The $250 cap and the $250 layover day rate both stand — re-ratified 2026-08-15 — and the detention-to-layover conversion is performed in [`backend/src/lib/detentionLayover.ts`](backend/src/lib/detentionLayover.ts), the single writer of both charge types for a stop.** The ladder it pays, stated so the next reader can check the code against it: free time runs from arrival to arrival + 2h and is not billable; detention bills $50/hr from hour 2 to hour 7, where the $250 per-stop cap is reached; that instant is the conversion, and **layover day one bills at the conversion**, so a stop still held past hour 7 is worth $500 (the $250 detention cap plus the first layover day); each further layover day bills $250. Detention and layover never cover the same hour. The conversion instant is derived as free time plus cap divided by rate, never hardcoded, so changing the cap or the rate moves the handoff with it. One condition the Rate Confirmation prints is not yet enforced by any writer: detention is not payable if the carrier arrives outside the appointment window, and `detentionLayover.ts` takes arrival as given. Free time accrues per stop (each stop is independent and non-cumulative) and the cap is per stop, matching the Rate Confirmation, which renders the cap as `$N/stop cap` (`srl-chrome.ts` `drawRateConTerms`). The terse phrasing is deliberate and measured: the grid cell draws with `lineBreak: false`, and `capped at $250/stop · notify` measures 216.6pt against 202pt of available width, so the longer wording would overprint the adjacent TONU label. Do not "improve" it without re-measuring. **No tier differentiation and no equipment differentiation** — the prior "$50/hr dry van / $65/hr reefer" split was retired here because it was never implemented: `srl-chrome.ts` carries a single `detentionRatePerHour` field with no equipment branch, so the reefer rate could never have printed. **TONU — two sides, two triggers, one amount. Ratified 2026-08-15, NOT YET IMPLEMENTED.** Bill the CUSTOMER $200 on ANY cancellation, with no notice test. Pay the CARRIER $200 only when the cancellation lands same-day as pickup or after the carrier was dispatched. Neither side is built. There is no customer-side TONU charge anywhere in the billing path, and the carrier-side clause the Rate Confirmation prints today (`pdfService.ts` `governingClauses`: "payable only if SRL gave you the pickup number and shipper address and cleared you to head to pickup, and SRL or the shipper then cancels") pays on a narrower trigger than the ratified one — it does not reach a same-day cancellation on a carrier who was not yet cleared to roll. Treat both sides as ratified-pending-implementation and do not describe either as live. **The 4-hour cancellation window is the CARRIER'S release window. Ratified 2026-08-15, NOT YET IMPLEMENTED.** The carrier may release a load up to 4 hours before pickup without penalty. It is **not** a window for SRL to cancel penalty-free. This supersedes the earlier reading recorded here — "SRL gives 4 hours' notice without penalty" — which is what made the window and the TONU clause contradict: both governed the same party backing out, on the same signed page. Reframed, they govern different parties. The release window is the carrier backing out; TONU is SRL or the shipper backing out. They can now sit on one signed Rate Confirmation without conflict, and **the prior OPEN caveat is resolved** — the instruction not to treat the 4-hour window as a TONU safe harbor no longer applies, because the window is no longer SRL's to use. The terms grid still renders the line as `4-hour notice without penalty` (`srl-chrome.ts` `drawRateConTerms`, value supplied by `pdfService.ts` `cancellationWindowHours: 4`) without naming the party; it must name the carrier as the releasing party when this is implemented, and `e2e/helpers/pdf.ts` pins that string character for character, so both move in the same change.
- Operational tier lines pending confirmation — NOT to claim on /carriers (or any public surface) until the underlying operational mechanism is confirmed live and committed-to: (a) "Priority Compass Engine placement for Gold" — waterfall engine tie-breaker logic for Gold-vs-Silver on equal scores not yet implemented; (b) "Dedicated lane eligibility for Gold" — operational policy decision pending; (c) "Quarterly business review with AE for Platinum" — AE role exists but QBR cadence not committed; (d) "Advisory voice on CPP evolution for Platinum" — only M6 has advisory voice per §10; broader Platinum application is held. All four banked in v3.8.aib for future re-evaluation once operationally real.
- "Hauling your first load within 48 hours" / specific onboarding hour-count SLAs (retired 2026-05-19 v3.8.ads — no operational SLA wired today. Use "most carriers cleared within a few business days" until a real onboarding SLA is measured and operationally enforced.)
- "24/7" for human-support contexts (reserved for Marco Polo AI only)
- "Monthly all-in rate cards" as current offering (roadmap only per /carriers "What's coming")
- Fuel card program, insurance referrals, equipment financing as current offerings (roadmap only)
- Named competitors (CHR, TQL, Landstar, Convoy, RXO, etc.) — use "typical broker" / "most brokers" / "industry average"
- "Wasi Haider" name or personal bio on public marketing pages (internal tools exempt per §3.12)
- "X+" style volume metrics without real numbers (500+, 12K+, $50M+ etc. — all retired in v3.7.d)

---

## §6 HONEST HOURS COPY (authoritative)

Use this exact text wherever operating coverage is claimed:

> "Business hours coverage Monday–Friday, 7:00 AM – 7:00 PM Eastern. After-hours emergency line available for active loads in transit."

Short-form variant (tight UI contexts):

> "Business hours Mon–Fri 7am–7pm ET + after-hours emergency line"

---

## §7 PROGRAM NAME CONVENTION (enforce strictly)

- **Full form (preferred):** "Caravan Partner Program"
- **Abbreviation after first reference on same page:** "CPP"
- **Prohibited variants** (retired, never use):
  - "Caravan Program" (missing "Partner")
  - "Caravan Carrier Program"
  - "Caravan Loyalty Program"
  - "Partner Program" (standalone, missing "Caravan")
  - "SRAPP" (fully retired)
- **"Caravan Network"** is acceptable ONLY as the eyebrow pill on `/carriers`; never as a program name.

---

## §12 EXEMPT SURFACES (internal tools — different rules)

Marketing content rules (§4, §5) do **NOT** apply to these surfaces:

- `frontend/src/app/dashboard/lead-hunter/**` — email signatures intentionally sign as Wasi per earlier decision (§3.10)
- `frontend/src/app/ae/**`, `frontend/src/app/accounting/**`, `frontend/src/app/admin/**` — internal tools, fabricated fixture data allowed (see §13 deferred cleanup)
- `frontend/src/data/splashQuotes.ts` — ATRI/NIOSH-sourced industry facts, employee audience
- Internal dashboards may reference "Wasi" or "Sales (Wasih)" labels
- `frontend/public/security-policy.html` — technical rate-limiting documentation, not marketing
- ~~`frontend/public/ae/**` — internal AE console HTML, fixture data OK~~ — **the tree was deleted in v3.8.asc (2026-08-17)**; no such surface exists and nothing is exempt under it (retired 2026-09-21).

---

## §20 PAGE AUDIT STANDARD (binding for public marketing surfaces)

Codified 2026-05-19 (Sprint v3.8.aet docs-only commit) after the homepage + /carriers + /about audit arc surfaced repeating patterns that should be a standing standard, not re-derived per page. User-flagged trigger: *"almost all pages had very redundant and repetitive information, which was never reviewed or replaced since the website went live. Gather all the audit manual and your audit findings and add the first one which I mentioned. Make all these as set standard for the audit and improvements also keeping in Tech, AI, Brand Identity and ancient silk road in mind."*

This section is the canonical audit reference for any future public marketing page work. It supersedes ad-hoc per-page audits.

### §20.1 — Scope

Applies to:
- Public marketing pages: `/`, `/shippers.html`, `/carriers.html`, `/about.html`, `/contact.html`, `/faq.html`, `/blog.html`, `/careers.html`, `/track`
- Public legal pages (`/terms.html`, `/privacy.html`, `/security-policy.html`) — light-touch audit; legal language has different rules per §3.12

Does NOT apply to:
- Internal AE Console, Carrier Portal, Shipper Portal surfaces (per §12 EXEMPT SURFACES)
- Lead Hunter outreach (governed by §18 standing rules — distinct domain)
- PDF document chrome (governed by `srl-brand-design` skill canonical)

### §20.2 — Workflow (mandatory)

Every page audit follows this sequence:

1. **Phase A — Read-only audit.** Read the page end-to-end. Surface findings as old/new tables per §20.3 lens. No code changes yet.
2. **Phase B — Surface to user.** Present audit findings with old/new for each action item. Get explicit GO before any source change.
3. **Phase C — Execute with atomic commits.** Per §3.3, bundle cohesive page-polish into one atomic commit when scope is single-page; split when scope spans multiple pages or distinct concerns (content vs graphics).
4. **Phase D — Pre-push gates.** `tsc --noEmit` + `npx next build` + visual smoke walkthrough per `feedback_visual_smoke_before_push.md` user memory (covers viewport proportions, layout reflow, contrast across animation phases). Sub-pattern 11 CI parity applies.
5. **Phase E — Rendered-output verification.** After deploy, verify on the live URL per §3.2 (curl + grep deployed page, not local file). Cloudflare Pages ~2-3 min deploy delay.

Per "one page at a time" user directive (2026-05-19): never audit multiple pages in a single commit. Complete a page (content + graphics + verification) before moving to the next.

### §20.3 — The audit lenses

Every page is reviewed through these lenses in sequence. Lens 1.5 (Architectural Reveal Defense) added 2026-05-20 v3.8.aeu after the live-terminal architectural-leak reversal.

#### Lens 1 — Brand canonical conformance

Cross-check against §4 (honest claims whitelist) + §5 (prohibited claims). Common violations encountered repeatedly:

- **§5 prohibited "24/7"** for human-support contexts (reserved for Marco Polo AI per §4 #12). Pattern hit: /about Leadership Card #3 "around-the-clock operations center" (fixed v3.8.aer).
- **§5 prohibited fabricated volume** — "From the ports of LA to the warehouses of New Jersey", "12K+ shippers", "$50M+ moved" — implies portfolio that doesn't exist pre-revenue. Pattern hit: /about Card #5 "Nationwide Network" (fixed v3.8.aer).
- **§5 prohibited "Asset-based" / "our fleet"** — SRL is a broker, not asset.
- **§5 prohibited blanket "100% FSC pass-through"** / "Full FSC pass-through" — overstated; tier-graduated only. Retired 2026-05-19 v3.8.ads.
- **§5 prohibited "first load within 48 hours"** / specific onboarding SLAs not operationally enforced. Retired 2026-05-19 v3.8.ads.
- **Unverifiable superlatives** — "most trusted broker", "world-class", "unmatched service". Pattern hit: /about Mission card (fixed v3.8.aer).

#### Lens 1.5 — Architectural Reveal Defense (banked 2026-05-20 v3.8.aeu)

Banking lesson from v3.8.aet → aeu reversal. Before publishing any content that describes internal operations, ask: *"If a competitor screenshots this single section, what do they learn about how we built our system?"*

The v3.8.aet "live operational terminal" hero on /about was retired one commit later because its event content exposed in one screenshot:
- Load lifecycle state machine names (AT_PICKUP, LOADED, BOOKED, DISPATCHED, IN_TRANSIT, AT_DELIVERY)
- Score-to-tier threshold mapping ("Score 94 = GOLD")
- Tier fee structure with specific math ("2% Gold · $1,127")
- Internal performance timing ("RC AUTO-GENERATED · 1.2s")
- Batch operational scale ("5,247 carriers scored")
- Onboarding workflow sequence ("MC# verified · W-9 received")
- POD-to-invoice automation trigger language
- AI query/response pattern with GPS proximity logic

This was the THIRD recurrence of the architectural-leak pattern (after v3.8.adw Section 7 bullets fixed in v3.8.aem, and the /about Section 4 cards). User-flagged: *"Doesn't it give the blueprint of our internal working and system we have built."*

**Banned content classes on public marketing surfaces:**
- Specific state machine names (AT_PICKUP, LOADED, BOOKED, DISPATCHED, IN_TRANSIT, AT_DELIVERY, etc. — these are §A.1 Appendix internals, not public-surface vocabulary)
- Specific scoring thresholds tied to tier names (e.g., "Score ≥ 95 = PLATINUM")
- Specific automation trigger language ("POD upload triggers invoice queue", "Tender accept fires RC generation")
- Specific internal performance metrics ("RC generated in 1.2s", "P99 latency", "Compass recalc in N ms")
- Specific batch operational scale that implies system maturity ("5,247 carriers scored", "1,247 loads today")
- Specific onboarding workflow sequences ("MC# verified · W-9 received · COI confirmed")
- Specific tier-payment-fee math juxtapositions ("2% Gold · $1,127 cleared")
- Concept-level architecture reveals (live operational terminals, system diagrams, dashboard screenshots showing real internal data)
- **Vendor-stack reveal — named underwriters, named insurance providers, named technology vendors, named carrier-partner counterparties.** Banked 2026-05-20 v3.8.agn after the v3.8.agm trust strip shipped "$100K contingent cargo through Hancock & Associates" verbatim from §18 outreach canonical. Public surface exposing the underwriter lets competitors map SRL's insurance vendor stack. Allowed: existence of contingent coverage. Banned: name of carrier, name of underwriter, specific dollar amount of contingent coverage (FMCSA-public bond amounts like the $75K BMC-84 are OK because they're already on SAFER).
- **Cross-canonical-context migration without re-vetting.** §18 (Lead Hunter outreach standing rules) is canonical for OUTREACH EMAIL context; §20 (public marketing audit standard) is canonical for PUBLIC PAGE context. Copy that's safe in §18 (e.g. specific underwriter naming, deal-room specifics) is NOT automatically safe in §20. Any sprint that ports copy from §18 → §20 must re-vet against §20.1.5 banned-content classes. Same principle applies in reverse: §20 public-page restraint may be too thin for §18 outreach where credibility from specifics matters.

**Allowed on public marketing surfaces:**
- Named systems on §4 honest claims whitelist (Marco Polo AI, Compass Engine, Caravan Partner Program)
- Brand-canonical commitments (tier-graduated FSC per §8, BMC-84 bonded per §1, 7-factor Compass Score per §9 — these are PUBLISHED operational claims)
- High-level capability framings ("operational documents archived per load", "branded tracking links", "in-portal dispute resolution")
- Heritage iconography and brand-anchored metaphors (Silk Road, Caravan, compass)

**Test before publishing:** if a single screenshot of the section would let a competitor reconstruct your operational pipeline, soften the content. The goal is brand positioning + customer-facing benefit framing, not engineering reference documentation.

#### Lens 1.6 — Semantic Legibility Defense (banked 2026-05-20 v3.8.aep critique)

Banking the user critique on v3.8.aep heritage photo-icons: 3 of 4 (crate / leather ledger / pocket watch) failed the **4-second scan test** despite being brand-aesthetically coherent. Only the brass thermometer passed (thermometer → temperature is a one-step inference).

Before publishing any brand-aesthetic imagery on customer-facing surfaces, run the **4-second scan test**: a typical visitor sees the icon/photo for ~4 seconds while scrolling. Can they identify the service or concept it represents WITHOUT reading the H4 title?

- **One-step inference passes:** thermometer → temperature, lightning → fast, truck → trucking, snowflake → cold.
- **Two-step inference fails:** leather ledger → "old book?" → "library?" → "dedicated capacity?". A buyer scanning 4 cards in 4 seconds will not perform a metaphor-decode step.

When brand-aesthetic coherence conflicts with semantic legibility on a feature-grid section, **comprehension wins.** Brand-aesthetic register belongs in narrative copy + subtle motifs (palette, name etymology, type), not in feature-grid imagery that must communicate service category at scan speed.

#### Lens 1.7 — Brand Modernity Alignment (banked 2026-05-20 v3.8.aep / v3.8.aen critique)

Brand aesthetic must match brand positioning. SRL positions as in-house TMS + AI-augmented + modern tech-forward broker (Marco Polo AI, Compass Engine, continuous learning cycles per §9, Sprint 59 auto-RC). Imagery that reads as "old / traditional / heritage / nostalgic" creates a positioning mismatch that procurement managers and supply-chain executives read as untrustworthy — they're sourcing optimization, not nostalgia.

The **screenshot test:** does this visual signal *"modern tech-forward operation we can trust with our optimization"* or *"traditional old-school broker"*? If the latter, the visual is fighting the brand positioning and must be replaced regardless of brand-color or heritage-narrative alignment.

**Heritage iconography belongs in:**
- Narrative copy (the Silk Road etymology, "Caravan" naming, "Marco Polo" naming, Silk Road origin story in /about Our Story section)
- Subtle brand motifs (palette: navy + gold-dark + cream + cream-2; 4-point cardinal-star derivative of the compass mark; brass + walnut color references)
- The compass mark logo asset itself (`/logo-compass.png`)

**Heritage iconography does NOT belong in:**
- Service category imagery (FTL, Reefer, Dedicated, Expedited) where buyers must decode positioning at scan speed
- Persona cards (For Shippers, For Carriers) where the audience needs to feel tech-augmented trust, not merchant nostalgia
- Hero compositions on decision-surface pages (/shippers, /carriers) where the buyer is making the buying decision and needs to see modern operational competence

The v3.8.aep heritage photo-icons on /index Section 4 + v3.8.aen heritage photos on Section 7 + my v3.8.aet operational-terminal experiment (architectural leak per Lens 1.5) collectively represent this miss class at scale. Refactor to **tech-forward modern freight imagery with subtle technology overlay elements** (abstract per Lens 1.5 — no real product UIs):

- Modern American-cab freight equipment (Cascadia, Peterbilt, Kenworth, International — never European cabs)
- Visible technology signal — abstract route lines, data dots, gauge graphics, sensor indicators (overlay on photo or as composition element)
- Brand-palette accents (navy + gold-dark) where naturally present
- Service-specific visual semantics (Lens 1.6 compliance — thermometer for reefer, fleet-yard for dedicated, motion-blur for expedited)
- AI/tech messaging in body copy that NAMES the system (Compass Engine, Marco Polo AI) without revealing how it works (Lens 1.5)

Free stock photography (Pexels, Pixabay, Unsplash) is acceptable when curated against this standard. Per-photo brand-canon checklist:
- ☐ American cab (or no cab visible if stock can't be verified)
- ☐ No third-party fleet logos / DOT numbers / license plates legible
- ☐ No people / no driver faces (per existing D2 locked decision)
- ☐ No European-cabover styling (Scania, Volvo, Mercedes-Benz, DAF, MAN)
- ☐ Modern equipment register (not vintage/restored trucks)
- ☐ Cool blue → neutral → warm-gold color register compatible with brand palette
- ☐ Composition allows for subtle technology-overlay graphic if needed

#### Lens 2 — Voice + §18.9 sweep

§18.8 + §18.9 voice rules apply to all customer-facing surfaces, not just outreach. Standard sweep:

- **Em-dashes in body copy** — replace with periods, commas, colons, or restructure. Acceptable only in list-separator context (tier-req labels, milestone headings). Hit at every page touched so far: /carriers v3.8.adu (13 retired), /index v3.8.aek (multiple), /about v3.8.aer (3 retired).
- **Prohibited consultant-speak**: "leverage", "cutting-edge", "world-class", "best-in-class", "step-change", "synergy", "north star", "unlock value", "AI-powered" when describing capabilities (vs. naming products like Marco Polo).
- **Marketing softeners**: "unwavering commitment", "relentless focus", "operational excellence", "partner satisfaction" — generic, replace with verifiable specifics.
- **Honest hours copy** per §6 — "Business hours coverage Monday–Friday, 7:00 AM – 7:00 PM Eastern. After-hours emergency line available for active loads in transit."

#### Lens 3 — Cross-page redundancy + freshness check (NEW, user-flagged)

User observation 2026-05-19: *"almost all pages had very redundant and repetitive information, which was never reviewed or replaced since the website went live."* This is the lens that catches stale boilerplate carried from page to page without review.

For each page, check:

- **Verbatim or near-verbatim repetition** across pages. Specific phrases that have appeared on multiple pages and should be either consolidated (live in ONE place) or rewritten distinctly: "real-time tracking", "transparent pricing", "operational excellence", "48-state coverage", "Compass-vetted carriers". Each page should have a DISTINCT angle on the same fact, not a copy-paste.
- **Generic enterprise-SaaS phrases** that read identically to every other broker's marketing — "data-driven pricing", "industry-leading", "trusted partner", "end-to-end solution". Replace with operationally specific language.
- **Identical CTAs across pages** — every page using "Get a Quote" / "Learn More" without varying the context. CTAs should reflect the page's specific role in the conversion flow (operational destination per §3.10 + the v3.8.aef + aek precedent).
- **Stat repetition** — same number cited on every page ("48 states") without variation. Reserve numerical proofs for the pages where they have the most rhetorical force.
- **Persona-split sections repeated** — homepage had hero + dual-persona section both running the same Ship/Haul two-track twice (collapsed in v3.8.aeb). Other pages may have similar collapsible redundancy.

When redundancy is found, the disposition options are: (a) consolidate to one canonical page, (b) rewrite each instance with a page-specific angle, or (c) delete the weaker instance entirely.

#### Lens 4 — The four pillar lenses (Tech, AI, Brand Identity, Silk Road heritage)

Every page must visibly carry at least 3 of these 4 brand pillars. Each pillar has a canonical expression:

**Pillar 1 — Tech (in-house TMS)**
- Operational stack owned by SRL, not licensed from a third-party platform
- BOL, Rate Confirmation, POD, itemized invoice all generated in SRL chrome
- Public `/track` URLs branded to silkroutelogistics.ai
- Portal access: shippers see operational documents + dispute resolution; carriers see Compass Score + Quick Pay + tender flow
- Verifiable references: §2 architecture, §9 Compass Score backend, Sprint 59 auto-RC

**Pillar 2 — AI (lever, not replacement)**
- "AI is a lever, not a replacement" is the standing brand framing
- Named systems: Marco Polo AI (24/7 freight assistant), Compass Engine (carrier vetting), continuous learning cycles (rate intelligence, lane optimizer, compliance forecast)
- Honest boundaries — what AI does NOT decide alone (the "Where AI Stops" panel canonical pattern on /about v3.8.aer): no AI-only carrier rejection, no autonomous Quick Pay disbursement, no AI-only customer onboarding, human-confirmed dispatch
- §5 prohibited: "AI-powered" as marketing softener; allowed: AI labels on actual AI products (Marco Polo)

**Pillar 3 — Brand Identity (visual)**
- Canonical palette: navy `#0A2540`, gold `#C5A572` (structural), gold-dark `#BA7517` (CTA emphasis), cream `#FBF7F0`, cream-2 `#F5EEE0`
- Four-point cardinal star motif (SRL compass mark abstraction) — used on shipper wax seal (homepage), carrier compass face (homepage), about hero network nodes (v3.8.aes)
- Heritage editorial photography on walnut surface (homepage Section 4 service icons + Section 7 TMS icons)
- No European cabs (Cascadia / Peterbilt / Kenworth only)
- No people in marketing photography (D2 locked decision 2026-05-19)
- Lucide-style line icons OR heritage photo-icons — never stock photos

**Pillar 4 — Ancient Silk Road heritage**
- Brand name etymology: "Silk Route Logistics" pays homage to the world's first logistics network
- Heritage iconography: wax seal, brass compass, leather ledger, merchant correspondence, freight crate, pocket watch — all on walnut, all in the merchant's workshop register
- "Caravan" Partner Program naming (carriers as caravan members)
- "Marco Polo" AI naming (Silk Road explorer reference)
- Trade route metaphor — operational lanes as modern silk routes

If a page expresses fewer than 3 of these pillars, it reads as generic broker SaaS marketing. The audit must surface this gap.

#### Lens 5 — Operational CTAs + destinations

Per the v3.8.aef + aek + aer precedent — CTAs must route to operational destinations, not marketing pages:

- **"Get a Quote"** → `/shippers.html#quote-form` (anchor jump to the quote form), NOT `/shipper/register` (account signup) and NOT `/shippers.html` (page top)
- **"Join the Caravan Partner Program"** / **"Haul With Us"** → `/onboarding` (carrier application flow), NOT `/carriers.html` (program details marketing)
- **"Ship With Us"** → `/shippers.html#quote-form` (quote intent) OR `/shipper/register` (account intent) — pick based on CTA context
- **Anchor link verification** — ensure the anchor exists (`#quote` was broken on /index footer until v3.8.aek; actual anchor is `#quote-form`)

### §20.4 — Graphics audit

Three approaches available per page, ranked by brand-impact:

1. **Heritage photo-icons** — full match to homepage Section 4/7 register (walnut surface, top-down 90° crop, soft daylight, brand palette). Requires Nano Banana generation cycle. Highest brand-impact.
2. **Lucide-style line icons** with brand-color top accent + hairline divider — type-forward, no asset cycle, CSS-only. Used on homepage Section 4 pre-v3.8.aep.
3. **Animated SVG** — for hero canvases or tech-positioning sections. Brand-canonical cardinal-star motif + gold-dark trade-route lines. Pattern: `/about` hero v3.8.aes.

Stock photo prohibition: every Unsplash placeholder must be either replaced (with heritage photo-icon or brand-canonical photo) or stripped (type-forward refactor). Pattern hit repeatedly: Scania (European cab) brand-canon violation on /index v3.8.aeh; analytics-charts placeholder on Digital Tools card v3.8.aem.

### §20.5 — Pre-commit gates (mandatory checklist)

Before any commit on a public marketing page:

1. ✓ `npx tsc --noEmit` clean (backend, if touched)
2. ✓ `npx next build` clean (frontend) — Sub-pattern 11 CI parity
3. ✓ Visual smoke walkthrough — viewport proportions, layout reflow, contrast across animation phases (`feedback_visual_smoke_before_push.md`)
4. ✓ §3.2 rendered-output verification deferred to post-deploy (`silkroutelogistics.ai` curl + grep)
5. ✓ Version bump per §3.1 (unless docs-only per §3.1)
6. ✓ Commit message documents lens findings + each old/new edit

### §20.6 — Page-level audit log (where each page was last audited)

| Page | Last audit version | Lens coverage | Outstanding |
|---|---|---|---|
| `/` (homepage) | v3.8.aeq · **typography superseded 2026-08-30 (v3.8.avm)** | All 5 lenses ✓ + 4 pillars ✓ | **The editorial-register lock no longer covers typography.** Four `<h2>` section heads sat at Playfair 400 and the skill puts section heads at 700; they are now 700. The "Where Trust Travels." shimmer tagline moved to the skill's Georgia italic `--gold-dark`. **The skill is canon; this register captured a pre-skill state.** Where the two disagree on type, the skill wins and the disagreement is recorded here rather than resolved silently. Composition, colour and copy remain locked. |
| `/carriers` | v3.8.amc | **All 5 lenses ✓ + 4 pillars ✓ — FULL** | Closed this session. **alk** Lens 1/2/4 sweep (body em-dashes, `#C8963E` gold drift, "Six milestones"→"One ladder", `#faf9f7`→cream, 10→9-days arithmetic). **all** /index Lens 3 redundancy (Option A) + removed live §5 "safety bonuses". **aln** tier-icon brass medallion treatment (refined-SVG path; heritage-photo option held). **Compass Score honesty arc alw→amc** made ALL 7 published factors genuinely measured backend-side — "seven measurable factors" + 97/98% gates + "recalculated weekly" + "automatic advancement" now backed end-to-end (built, not softened). FSC tile verified accurate (carrier-side RC, EIA-indexed engine). "GPS compliance"→"Tracking compliance" (telematics-activated, neutral-until-ELD). Optional: heritage photo-icons, Compass min-loads confidence floor. |
| `/about` | v3.8.amq | All 5 lenses ✓ + 4 pillars ✓ (kinetic-type + brass-medallion hero locks Tech/AI/Brand/Silk Road) | **Full sweep closed (amq).** §5 PROHIBITED FIX: the retired "tier-graduated FSC pass-through" claim was still live in 3 places (Our Story §3, Mission card, "Published Before Asked" card) — retired site-wide in v3.8.aib but /about never updated → all 3 to "fuel surcharge itemized on every rate confirmation" (§4 #1). `#C8963E` gold drift in 6 inline SVG icon strokes → `#BA7517`. Meta description em-dash (×3) → comma. "Records stay on SRL servers" → "under SRL's control" (cloud, not physical servers). **Deferred heritage photo-icons CLOSED as keep-Lucide** — per Lens 1.6/1.7 the Lucide icons are the correct register (heritage photo-icons failed the 4-second-scan + brand-modernity tests on /index); the deferral was based on pre-Lens-1.6/1.7 thinking. |
| `/shippers` | v3.8.aha | All 5 lenses ✓ + 4 pillars ✓ (Tech / AI / Brand / Silk Road) | Full §20 audit closed via 9-sprint cycle (agl Phase 1 voice → agm Phase 2 pillars → agn vendor-stack hotfix → ago Phase 3 A2 differentiation → agp Carmack drop → agq Phase 5 flip cards → agr Phase 4 ops-loop animation → ags-agy ops-loop refinement → agz hero rewrite + Section 3 artifact reframe → aha Section 2 deletion). Page structure: Hero (4-pillar) → trust strip → ops-loop (5-phase animation, real service names) → What You Receive (6 flip cards, artifact angle) → quote form. Pillar coverage 4/4. Cross-page redundancy resolved (Section 2 dropped in aha). Methodology debt banked at §20.8 + §19 sub-rule c surface. |
| `/contact` | v3.8.amd | Lenses 1 / 1.5 / 1.7 / 2 / 4 (4 pillars) / 5 ✓; Lens 1.6 + 3 minor | Audited + swept this session: softened "15-minute quote" SLA → "fast quotes during business hours, one click or email" (§5 unenforced-SLA class); "transit twice daily"→"daily" (matched `shipperLoadNotifyService`); added "18+ months" FMCSA authority (Item 182 parity); `#C8963E`→`#BA7517` gold drift ×2; body em-dash sweep; **added Marco Polo AI contact channel** (closed the AI pillar gap → 4/4); CTAs Get-a-Quote→`/shippers.html#quote-form`, Join-Network→`/onboarding`. Minor optional left: quick-link icons (scales/anchor weak 4-sec scan), 6-item FAQ overlaps `/faq.html`, `/tracking.html`→`/track` canonical. |
| `/faq` | v3.8.ame | Lenses 1 / 1.5 / 2 / 4 / 5 ✓; Lens 1.6 minor | **Major honesty correction** — page was pre-v3.7 stale, carrying live retired claims. Rewrote Carriers + Technology sections to §8/§10/§4 canonical: killed the retired tier model (180d/75-loads, 360d/150-loads, **$150/$300-mo safety bonuses**, **referral** + **"3 lanes"** gates), the **"24-48 hour" onboarding SLA**, the **"live GPS"/ELD-live/EDI (204/990/214/210)** capability overclaims, "GPS compliance"→"tracking compliance", **LTL** (not in services whitelist), the **"15-minute" quote SLA ×3**, and the non-canonical **billing@**→accounting@ alias. Gold drift `#C8963E`→`#BA7517` ×~20 + full em-dash sweep. Honest answers kept (double-brokering, factoring, QP-vs-factoring, the honest 7-day-vs-2-day Quick-Pay answer). Honest defaults applied on the 3 open decisions (drop LTL, soften mobile-app/GPS/ELD/EDI to real, keep standalone /faq) — Wasi to flag if any should change. Minor optional left: FAQ-icon "+" glyph semantics. |
| `/blog` | v3.8.amf | All applicable lenses ✓ (news-aggregator shell) | "The Freight Insider" — a JS news-aggregator shell; aggregated articles are third-party RSS (exempt, like splash quotes). Shell was already clean (zero gold drift, zero em-dashes, zero stale claims). One fix: hero subhead "curated daily **by AI**" → "from across the industry, updated throughout the day" — `newsAggregatorService` is RSS + keyword categorization (**no AI/LLM**) on a 4-hour cron, so "by AI" + "daily" were both overclaims (§18.8 no-AI-framing-when-not-AI class). |
| `/careers` | v3.8.amg | All applicable lenses ✓ | Mostly honest already (no fabricated team-size stats; honest "no open positions listed right now"; em-dashes clean). Rewrote the "Tech-Forward Environment" value card — dropped "EDI systems" (not operational), "machine learning" (unconfirmed), "cutting-edge" (§18.8 consultant-speak), "changing the industry" (hyperbole) → names real systems (Marco Polo AI, Compass Engine, in-house TMS). Gold drift `#C8963E`→`#BA7517` ×7. `careers@` alias kept (Wasi directive) + documented in §1 routing to `whaider@`. |
| `/track` | v3.8.amp · **typography superseded 2026-08-30 (v3.8.avm)** | All applicable lenses ✓ + AI pillar added · page title and section head moved 400 → 700 per the skill; see the homepage row for the rule | **Reveal fixed (amh):** "How updates reach you" genericized from a competitor-blueprint pipeline (EDI 214, 15-min ELD cadence, geofence, 60s SLA — none operational) to customer-benefit-only; bulleted (ami). **Full sweep (amp):** Lens 1 honesty — hero "Real-time status on every load" → "The latest status…" + meta dropped "in real time"/"live status" (page's own reveal shows updates are carrier check-ins + SRL check calls + telematics *where available*, not real-time on every load); Lens 4 — added the Marco Polo widget (was the only public page without it → AI pillar + chrome parity); Lens 5 — "shipper portal above" → direct `/shipper/login` link; bullet symmetry `.explainer-sources` `·` → `›`; Lens 1.5 — JS status fallback `replace(/_/g,' ')` (echoed raw enum) → generic "In progress"; `.search-btn:hover` `#8f5a11` → `#854F0B`. track.css already canonical. |
| `/privacy` | v3.8.amk | Lens 1 / 1.5 ✓ + voice/gold ✓ (legal scope) | **Over-disclosure audit (amk).** Removed the "secure **data centers**" FALSEHOOD (SRL is cloud-hosted, runs none) + collapsed §3's detailed security checklist → 1-line summary + link to `/security-policy.html` (which NDA-gates implementation detail). Fixed §1 "credit card numbers" (contradicted Security Policy §3 "no card data stored") → "payment & banking info via our payment partners". Trimmed §4 Cookies + §1/§5 to **essential-only** (grep confirmed ZERO analytics tooling site-wide — banner already says essential-only, so §4 was over-claiming analytics/preference cookies that don't exist). §8 email `privacy@` → `compliance@` (non-routed alias). No vendor/infra/employee/schema leaks anywhere. |
| `/terms` | v3.8.amk | Lens 1 ✓ + voice/gold ✓ (legal scope) | **Over-disclosure audit (amk).** Dropped "less-than-truckload (**LTL**)" from §2 services (SRL doesn't broker LTL; matches shippers/faq sweep). Tidied "AI-powered tools…Marco Polo platform" → "AI tools…Marco Polo, our freight assistant". §11 email `legal@` → `compliance@` (non-routed alias). Kept all required TOS sections (limitation-of-liability + Carmack, indemnity, Michigan law ✓, AAA arbitration / Kalamazoo ✓, change notice). No leaks. |
| `/security-policy` | v3.8.amo | Lens 1 / 1.5 ✓ — **the model**; chrome + body match privacy/terms | **Content audit (amk): clean** — capabilities public, implementation "available under NDA," "Classification: Public" intentional; §5 `privacy@` → `compliance@`. **Chrome aligned (aml):** replaced the one-off `.nav-bar` (custom sticky bar + non-canonical text wordmark + gold `#c8a951`) with the canonical logo-only INCLUDE:nav + added the missing INCLUDE:footer; wrapped doc in `<main>` + skip-link; nav JS + Marco Polo widget; `srl-logo.css` linked; nav-layout CSS added to its page-CSS (hardcoded `#C5A572`/`#BA7517`); `.doc-container` top-pad 40→112px to clear the fixed nav; doc-header recolored canonical; dead `.nav-bar`/`.toc`/`.download-bar`/`.highlight-box`/`.back-link` CSS removed. **Shared-CSS gold drift CLOSED (amm):** `utilities.css` `--gold` `#C8963E`→`#C5A572`, `--gold-light` `#D4A84E`→`#DAC39C`, 6 hardcoded `#C8963E`→`var(--gold)`, dead `.login-dropdown` block deleted (§13.3 Item 26). Cascade audit found every marketing page-CSS already overrides `--gold` to `#C5A572`, so the drift only rendered on `/security-policy` itself (no page-CSS override) — now canonical. Residual `#C8963E` on `tracking.css` (1 legacy page) + auth login/register **closed in amn** (→ canonical). **Body rebuilt (amo):** swapped the bespoke navy doc-header/`.section` register for the canonical legal-page template shared by privacy/terms — cream `.hero` ("Legal" eyebrow + Playfair `Information <em>Security Policy</em>` italic-gold + divider) → `.legal-section` > `.legal-block`s; procurement metadata (Document ID / Version / Effective / Classification) folded into the `.legal-updated` line; §1 em-dash → colon (§18.9). Now the same register as privacy/terms. Privacy + Terms "Last Updated" refreshed Feb 1 → Jun 1 2026 (reflects the amk content edits). |
| Cookies (banner + Privacy §4) | v3.8.amk | Reconciled | No standalone cookies page needed. SRL sets only essential cookies (auth token + consent flag); grep confirmed zero analytics tooling. Banner ("essential only") accurate + GDPR-compliant (notice suffices). Privacy §4 trimmed to match. `cookie-consent.js` gold drift `#c8a951`/`#b8963e` + navy `#0D1B2A` → canonical `#C5A572`/`#BA7517` + `#0A2540`. |

Update this table at the close of every page audit commit.

### §20.7 — Cross-page redundancy registry (seed entries from this audit arc)

These are confirmed redundancy patterns surfaced during 2026-05-19 audit work. They are seeds for the cross-page sweep when each remaining page is audited:

- **"Real-time tracking"** — verbatim or near-verbatim on /index hero card, /shippers, /about Card #1. Should have a SINGLE canonical home (recommendation: /shippers feature section) and not repeat.
- **"Compass-vetted carriers"** — used on /index Section 4 Card 1 + /about Card #1 (post-aer) + /carriers M-step cards. Each instance can stand alone but the phrasing repeats. Vary the angle per page.
- **"48-state coverage"** — used as section title on /index + /about + /carriers Coverage section. Verifiable claim; acceptable to repeat but should not be the ENTIRE rhetorical anchor of more than one page.
- **"Operational excellence" / "partner satisfaction"** — generic enterprise-SaaS softeners. Should not appear on any page going forward.
- **Generic "We" sentences** — "We leverage technology", "We deliver", "We move freight". Replace with the specific operational system that does the work.
- **Service-category cards duplicated across pages.** Surfaced 2026-05-20 during /shippers Phase 2 audit (v3.8.agm) — /shippers Services Detail section presents 4 cards (Dry Van, Reefer, Dedicated, Expedited) that mirror the same categories on /index Section 4. Audit-first did not flag this because each page's cards were Lens-1-clean in isolation. Wasi visual audit caught the cross-page duplication. **Rule:** when a service-category set appears on multiple pages, exactly ONE page is the canonical home; other pages either (a) drop the section entirely, (b) reference the canonical page ("see all services →"), OR (c) present a meaningfully different angle on the same categories (e.g., homepage shows them as "what we move," /shippers shows them as "which equipment fits your freight profile"). Verbatim duplication is a registry violation. **Resolution 2026-05-21 v3.8.aha:** /shippers chose path (c) at v3.8.ago — reframed to icons + buying-criterion + SRL system names. Wasi visual audit on deployed v3.8.agz showed the differentiation was tenuous (same 4 categories, same buyer question, twice). Escalated to path (a) — Section 2 deleted from /shippers entirely. /index Section 4 stays canonical for service catalog. Equipment categories still surfaced on /shippers via quote form dropdown + ops-loop status cards + What You Receive system names. **Methodology lesson:** path (c) "differentiate the angle" only works when the angle shift is large enough to feel like distinct content. Same content set + format variation alone reads as duplication. Default to path (a) when the alternative page can absorb the content's purpose via other means (quote form, ops narrative, system surfacing).
- **Ops bullets / section-internals inconsistency across pages.** Surfaced 2026-05-20 same audit — /shippers ops section has 3 bullets (Pickup verification / In-transit visibility / Documented delivery) that don't match what the homepage's equivalent section presents. Either intentional differentiation (each page emphasizes a different operational angle) or a sync miss. Either way, audit must verify and document the intent. **Rule:** when two pages cover the same operational concept, the bullet sets must be either (a) identical (single canonical), or (b) explicitly different with documented intent in the audit log. Drift accumulation without intent is what the registry catches.

When auditing the next page, run a verbatim-phrase grep against the already-audited pages to surface fresh redundancies, and add findings to this registry.

---

### §20.8 — Sunday-onward foundation (2026-05-17 → 2026-05-21 arc, canonical for web design + content writing going forward)

Codified 2026-05-21 (v3.8.ags docs-only commit) per Wasi directive: *"make this part of project history all the upgrades that we have been doing since Sunday as the foundation of the web designing - Content writting."*

The 2026-05-17 → 2026-05-21 sprint arc (v3.8.afv through v3.8.agr — homepage Section 5 capabilities-wall tile cycle + center logo saga + tagline shimmer + complete /shippers audit cycle across 5 phases) **proved a working canonical for SRL web design and content writing.** The patterns, components, and principles below are binding for future page work. Future sprints reference this section as foundation rather than re-deriving lessons per audit.

#### §20.8.1 — Proven canonical patterns (validated across this arc)

These were active hypotheses before the arc; the arc validated them under multi-page operational use. They are now **binding canonical** for all public marketing surfaces:

1. **§20.2 audit-first workflow (Phase A → B → C → D → E)** — validated across /shippers Phase 1 / 2 / 3 / 4 / 5. Each phase had Phase A read-only audit, Phase B surface to user + GO, Phase C atomic execute, Phase D pre-commit gates (`tsc --noEmit` + `next build`), Phase E post-deploy verification. Zero rollbacks during the arc. Cumulative: ~1,700 LOC across 5 atomic + hotfix commits, every commit clean.
2. **Four pillar lenses (§20.3 Lens 4 — Tech / AI / Brand / Silk Road)** — minimum 3 of 4 floor enforced. /shippers Phase 2 (v3.8.agm) closed the gap from 1.5/4 to 4/4 by naming Khotan-less generic shipper portal + Marco Polo AI + Compass Engine + heritage lead-in.
3. **§18.9 em-dash + consultant-speak sweep** — Phase 1 (v3.8.agl) cleaned 6 em-dashes + "comprehensive freight solutions" + "optimal shipping strategy" + "no surprises" + "personal service" in one atomic; sweep is reproducible per page.
4. **Lens 1.5 Architectural Reveal Defense + vendor-stack reveal extension** — caught the v3.8.agm trust-strip Hancock & Associates leak, hotfixed in v3.8.agn within hours.
5. **Lens 1.6 semantic-legibility + Lens 1.7 brand-modernity** — guided the Section 5 wall-tile register choice over heritage photo-icons for the homepage capabilities grid + /shippers system-aspects grid.
6. **Real-service-name grounding (NEW canonical)** — content writing must name REAL built services from the internal dashboards (Lane Optimizer / Carrier Intelligence / Rate Intelligence / Compliance Forecast / Customer Intelligence / Compass Engine / Marco Polo AI) NOT invented service names. Validated 2026-05-21 when Wasi shared the AI Insights dashboard screenshot and v3.8.agr operational-loop animation grounded all 4 status cards × 5 phases on real services. **Rule:** before naming a system in marketing copy, verify it exists in the actual built stack (internal dashboards, CLAUDE.md §A.5, or product surface). Invented names are §5 prohibited-class even when they sound plausible.

#### §20.8.2 — Canonical UI components (banked as reusable patterns)

These were custom-built during the arc and are now reusable patterns for any future page:

1. **Section 5 capabilities-wall tile cycle** (v3.8.aga origin) — 16 tiles in 4×4 grid rotating through capabilities every ~4s, center brand card. Inline SVG icon registry (no Lucide CDN). Pattern documented at `frontend/public/js/wall-icons.js`. **Rule:** any future "capabilities grid" surface uses this register; do not reintroduce a Lucide CDN.
2. ~~**Brand mark shimmer tagline** (v3.8.agk pattern) — Playfair italic bold 17px with gold gradient `linear-gradient(90deg, #BA7517 → #F2D89C → #BA7517)` background-clip:text sweeping left-to-right via background-position animation.~~ **SUPERSEDED 2026-08-30 (v3.8.avm).** The tagline is now the skill's pattern: **Georgia italic, `--gold-dark`, tracked +0.02em**, solid colour, no gradient.

   Two reasons, and the first is the one that matters. **This spec named a face that has never been loaded.** Neither loader has ever carried Playfair 700 italic, so every render of it since v3.8.agk was a browser-synthesised bold-italic — *nobody has ever approved how this actually looked*, because what shipped was never what the pattern described. A pattern whose own render was an accident is not a pattern to defend against the skill. Second, the gradient requires `color: transparent`, which cannot be reconciled with a spec that names a colour.

   Applied to `.srl-tagline` (homepage) and `.ops-chip-tagline` (/shippers).

3. **Hero-title italic emphasis** (`.hero h1 em` on /about, /blog, /careers, /faq, /privacy, /security-policy, /terms) — **SUPERSEDED 2026-08-30 (v3.8.avn).** The device set the second half of each page title in italic gold ("Information *Security Policy*"). It is now **roman, gold retained**.

   Same argument as the shimmer, and it is not a preference. `.hero h1` declares no weight, and static pages have no Tailwind preflight, so the UA default made those ems **Playfair 700 italic** — a face neither loader has ever carried. Every render since v3.8.agk was a browser-synthesised slant, so **nobody had approved how it actually looked**. The skill sanctions Playfair italic for the document-tagline pattern only, and a page title is not a tagline.

   Colour was always what carried the emphasis; the slant was an accident of a missing face.

   **Consequence worth recording:** with this retired, no element anywhere requests an italic Playfair face, which is what finally permitted pruning the `ital` axis from the shared Google Fonts link (`0,400;0,700;1,400;1,500` → `400;700`). The prune had been correctly refused one arc earlier, when seven pages still requested it.
3. **Scroll-drawn SVG connector** (v3.8.ago pattern, since superseded by ops-loop animation) — dashed gold-dark stroke-dasharray path that progressively draws via `stroke-dashoffset` animation triggered by IntersectionObserver. Reusable for any process timeline. CSS reference: `.steps-connector` class still in `shippers.css` (the markup is gone but the styling pattern is documented).
4. **Card-flip pattern** (v3.8.agq) — CSS 3D `transform-style: preserve-3d` + `rotateY(180deg)` on `.is-flipped`, front/back faces with `backface-visibility:hidden`. Click + keyboard (Enter/Space) toggle. `prefers-reduced-motion` honored. Reusable for any "image reveals detail" surface. Reference: `.system-card-flip` in `shippers.css`.
5. **Operational lifecycle animation** (v3.8.agr) — 5-phase tab strip + central brand chip with radial pulse + 4 status cards cycling per phase + cross-fading narrative below. JS-driven (IntersectionObserver-triggered, hover-to-pause, click-tab-to-jump, 8s resume after manual interaction, `prefers-reduced-motion` skips auto-play). Reusable for any "system in motion" surface. Reference: `.ops-loop-section` in `shippers.css`.

#### §20.8.3 — Methodology banking (§19 sub-pattern fires validated)

Two sub-pattern fire candidates banked during this arc (each awaits fire #2 + #3 for canonical promotion per sub-rule c three-fire convention):

1. **Sub-pattern 8 fire candidate #1 — Asset-file-header-vs-rendered-content** (v3.8.age → agf → agg three-sprint chain). File headers describe intent; visual viewer-verification authenticates content. Six-sprint logo iteration before landing on `/media/srl-logo-1024.png`. Banked also as user-memory `feedback_asset_file_header_not_authoritative.md`.
2. **Sub-rule c fire candidate — Cross-canonical-context migration** (v3.8.agm → agn one-sprint hotfix). §18 outreach canonical is NOT auto-canonical for §20 public marketing surface. Constraint sets are context-specific. Banked also as user-memory `feedback_cross_canonical_context_migration.md`.

#### §20.8.4 — Binding effect

For all future page work on `/shippers`, `/carriers`, `/about`, `/contact`, `/faq`, `/blog`, `/careers`, `/track`, and any new public marketing surface, this §20.8 foundation is the implicit starting state. Sprints reference §20.8 by name in their Phase A audit rather than re-deriving the lessons. New canonical patterns surfaced in future sprints are appended to §20.8 (banking model, not replace model).

#### §20.8.5 — Marco Polo chatbot governed by the disclosure ceiling (added 2026-05-25, v3.8.akx)

The Marco Polo chatbot (homepage widget at `frontend/public/shared/js/marco-polo.js` + server prompts at `backend/src/controllers/chatController.ts`) is a **public surface** governed by the same §20 audit standard as `/index`, `/shippers`, `/carriers`, and `/about`. Two canonical principles bind any future chatbot prompt rewrite:

**Principle 1 — Two-source binding.** Chatbot accuracy is sourced from CLAUDE.md (§1, §4, §6, §7, §8, §9, §10, §14, §18.8). Chatbot DISCLOSURE is bounded by what the three deployed public pages (`/index`, `/shippers`, `/carriers`) already publish. The chatbot may never state a number, threshold, percentage, rate, weight, tenure, vendor name, or fact that does not already appear on a deployed page — even when that figure is correct per CLAUDE.md. CLAUDE.md governs whether a statement is TRUE; deployed pages govern whether the chatbot is ALLOWED to say it.

**Principle 2 — §20.1.5 reveal defense extends with two carve-outs for the chatbot specifically:**
- **Tier ADVANCEMENT GATE values** (specific load counts, on-time percentages, tenure days, service-score floors) are banned even though `/carriers` publishes them. The chatbot may name the DIMENSIONS that drive advancement (load volume, on-time performance, tenure) but not the specific gate numbers. Route to `/carriers.html` for specifics. The carrier-facing page is a one-time disclosure to a self-selecting reader; the chatbot is a continuous conversational surface that competitors can query repeatedly. Same fact, different reveal blast radius.
- **Internal state machine names** (load statuses DRAFT/POSTED/TENDERED/BOOKED/DISPATCHED/AT_PICKUP/etc., carrier onboarding states PENDING/INFO_REQUESTED/etc.) are banned on the public chatbot but ALLOWED on the authenticated SYSTEM_PROMPT path because AE users operationally need them.

**Sprint origin.** v3.8.akx canonical refresh 2026-05-25 — prior `PUBLIC_SYSTEM_PROMPT` was last touched pre-v3.8.aib (so pre-2026-05-21 Sprint 1 honesty pass) and was leaking retired claims to live prospects on `/index`: "Caravan Loyalty Program" (§7 prohibited variant), "Guest" tier (retired), LTL + EDI + US-Mexico cross-border services (not on deployed pages), "small fee" vague Quick Pay framing (vs published Silver 3% / Gold 2% / Platinum 1%). The prompt also had zero reveal-defense guardrails — no ban on vendor-stack reveal, no ban on fabricated metrics, no §6 honest-hours qualifier on "24/7".

**Halt-and-report fire on PFA Protects (banked Sub-pattern 15 fire #5):** the v3.8.akx directive author asked to include "PFA surety" in the chatbot authority chain; Phase A audit confirmed PFA Protects appears NOWHERE on the three deployed public pages (only mention in the entire codebase is an internal development comment on `/index.html` line 438 explaining why the surety name was REMOVED per the v3.8.aga directive). §20.1.5 explicitly bans named-underwriter reveal as a vendor-stack reveal class. The directive's own articulated rules ("never reveal... the vendor stack", "never state a figure not on a deployed public page") contradicted the literal "PFA surety" mention; Sub-pattern 13 ratification-layer principle (workflow-first over literal-text) resolved to exclude PFA from the chatbot prompt. Disclosure ceiling > directive literal text when the directive contradicts itself.

**Going-forward gate:** any future chatbot system-prompt edit must include a Phase A audit of the three deployed public pages alongside the CLAUDE.md sections. Adding a new fact to the chatbot prompt requires either: (a) the fact already appears on a deployed page, OR (b) the fact is added to a deployed page in the same atomic sprint. The chatbot is downstream of public-page canonical, not upstream of it.

---

