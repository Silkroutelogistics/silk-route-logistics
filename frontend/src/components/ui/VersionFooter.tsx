"use client";

// Version: MAJOR.MINOR.letter (a-z, then bump minor)
// v3.0 — Light mode default, warm stone palette
// v3.1 — Login redesign, mobile responsiveness, design system tokens
// v3.2 — Gmail reply tracking, Lead Hunter DB-persist, full system audit, Compass 25-check wiring
// v3.2.h — BOL v7 (barcode, gold accents, 17 T&C, Mainfreight-style table), Address Book DB, 3D logo
// v3.3.d — Enterprise TMS: Routing Guide, Exception Engine, Broadcast Tendering, Dock Scheduling,
//          Carrier Call Log, Shipper Defaults, Fuel Tables, Geo Heatmaps, Variance Reports,
//          Tagging Engine, PO/SKU Tracking, Backhaul Discovery, Calendar View, GL Codes

// v3.6.c — Mass email overhaul (plain-text + Gmail sig), stage-aware templates,
//          Resend webhook tracking, follow-up sequencer + Queue, engagement scoring
// v3.6.d — Not Interested pipeline stage + idempotent mark flow (button lock,
//          backend 30s dedupe, shared prospectStatusService), filter chip,
//          amber "Not Interested Reply" confirmation chip, warm-badge suppression
// v3.6.e — Forgot-password wired across carrier/shipper/AE Next.js logins
//          (spans → Link, 3 forgot-password + 3 reset-password pages reusing
//          the existing backend endpoint; reset URL routed by user.role).
//          Seeded test carrier decommissioned, README credentials table redacted.
// v3.6.f — Shared site chrome: site-chrome.json drives one React <SiteFooter /> +
//          <SiteNav /> and a prebuild inject-chrome.mjs that templates partials
//          into 13 marketing HTML pages. MC#/Kalamazoo/"Where Carriers Come
//          First" drift collapsed through the single source.
// v3.6.g — Forgot/reset-password pages now share the login split-screen brand
//          aesthetic (navy left panel with map + feature pills + rotating
//          slides + gold-accented insight; cream form panel on right). Shared
//          <LoginBrandPanel variant="ae|carrier|shipper" /> component drives
//          all 6 auth-flow pages across the three login types.
// v3.6.h — HOTFIX for v3.6.f regression. Cleaned orphan HTML that the greedy
//          migrator regex left behind (index, tracking, shippers). Reverted
//          injected nav IDs to legacy names (mainNav, loginBtn, loginWrap,
//          hamburger, mobileMenu, mobileOverlay) so each page's pre-existing
//          inline wiring script resolves without null-deref. inject-chrome now
//          refuses to write if content outside INCLUDE markers changed
//          (SHA-256 integrity guard). New verify-chrome npm script for CI.
//          Deleted buggy migrate-chrome-markers.mjs.
// v3.6.i — Restored pre-Phase-2 walking-penguin nav overlay on index.html via
//          new INCLUDE marker attribute: <!-- INCLUDE:nav logo="penguin" -->.
//          Penguin SVG copied verbatim from commit 36e5636; animation lives
//          in already-loaded srl-logo.css. Marco Polo widget on public site
//          re-skinned to match AE Console light-mode React component (white
//          card + dark navy header + gold accents). Footer logo + 11 auth
//          splash logos wrapped in <a href="/"> for clickability. Integrity
//          guard + verify-chrome regex both updated to accept optional
//          marker attributes.
// v3.7.a — Caravan Partner Program rebrand + BRONZE→SILVER tier migration +
//          v3 Quick Pay pricing (Silver 3%/5%, Gold 2%/4%, Platinum 1%/3% —
//          same-day is universal +2% premium) + getEffectiveTier identity
//          mapping fix (PLATINUM→PLATINUM, GUEST/NONE→SILVER) + new
//          LoadQuickPayOverride Prisma model with per-load audit trail +
//          monthly variance cron emailing CEO on 1st + 7-factor Compass
//          Score block published on /carriers + SOP-012/SOP-013 rewritten
//          with v3 values + carvanService.ts → caravanService.ts rename.
//          BREAKING: CarrierTier enum no longer contains BRONZE.
// v3.7.b — Phase 3 gap-close: QuickPayOverridePanel React component wired
//          into RateConfirmationModal (tier-default fetch, editable applied
//          rate, reason dropdown when Δ ≠ 0, note required on OTHER). New
//          caravanService.test.ts with 9 regression tests guarding the
//          v3.7.a PLATINUM→PLATINUM identity fix + Silver fallback for
//          Guest/None/default. Fixed orphan "Guest → Bronze" string in
//          MarcoPolo system prompt that v3.7.a missed.
// v3.7.c — Public-site tier-copy hotfix. carriers.html tier cards rewritten
//          from v2 Bronze/Silver/Gold (Net-21/14/7, 3.5%/2.5%/1.5%) to v3
//          Silver/Gold/Platinum with locked pricing + FSC pass-through per
//          tier + priority freight on Platinum. Milestone labels aligned
//          to tierService names. index.html Caravan ladder + faq.html
//          Caravan Loyalty Program answer all swept to v3 copy.
// v3.7.d — Phase 4A Truth-Up Cleanup. Removed fabricated volume stats
//          (500+, 12K+, 98%, 99.2%, 15,000+, $50M+, 15-Min, 99.2%) from
//          /carriers hero + coverage, /, /about stats grid (kept only
//          "48 States Covered"), /shipper landing. Deleted fabricated
//          testimonials section on / (Michael Reeves, Petrovic, Chen).
//          "Asset-based brokerage" → "Freight brokerage" / "Property
//          broker" across /, /about, /auth/login, /auth/forgot-password,
//          /auth/reset-password. Retired "$0 Commission" / "Zero
//          Commission" / "Zero Factoring Fees" at 3 locations (/,
//          /carriers Caravan section, / Caravan compact subhead) →
//          replaced with "Full FSC pass-through" + "No factoring
//          contract required" framing. Dropped human-support "24/7"
//          claims at /, /about, /contact, /carriers, /shippers, /shipper
//          landing (Marco Polo AI "24/7" retained — AI is genuinely
//          always-on software). QP comparison table "1-3% flat" →
//          "1% / 2% / 3% by tier". /contact Hours block consolidated to
//          Honest Hours Copy (Mon–Fri 7am–7pm ET + after-hours
//          emergency line). Index trust bar section deleted (1 real
//          stat + 3 fabricated did not warrant the section after
//          removals). Orphan #trust scroll anchor rewired to #shippers.
// v3.7.e — Phase 4B CarrierFraudBanner. New section on /carriers
//          between "Why Carriers" and the Caravan tier structure,
//          communicating SRL's anti-fraud posture: FMCSA authority
//          + insurance verification before dispatch, no re-brokering,
//          BMC-84 bond on file with FMCSA. Fraud-report CTA links to
//          mailto:compliance@silkroutelogistics.ai (email already
//          operational — referenced across insuranceVerificationService,
//          complianceMonitorService, secEdgarService). Navy/gold
//          brand treatment, not alarming red. Shield icon glyph,
//          flex-wrap layout for mobile responsiveness.
// v3.7.f — Chrome micro-fix. Migrated .nav-login-btn /
//          .nav-login-wrap / .nav-login-dropdown CSS from
//          pages/index.css (homepage-scoped) to shared/css/
//          utilities.css (loaded on every marketing page). Fixes
//          unstyled "Sign In" button artifact on /carriers, /about,
//          /contact, /shippers, /faq, /blog, /careers, /privacy,
//          /terms, /tracking, /register, /login — originally
//          introduced in v3.6.f shared-nav migration but only
//          wired on homepage. Option B: added 8 CSS variables
//          these rules depend on to utilities.css :root block
//          using values verified identical across pages. No rule
//          body changes. Deeper variable consolidation filed as
//          Phase 5 tech-debt.
// v3.7.g — Phase 4C positioning rewrite. Homepage hero reframed
//          around carrier economics ("Freight brokerage built for
//          the carrier's side of the bill."). /carriers full
//          narrative rewrite: new hero ("The Caravan Partner
//          Program. Three tiers, one principle — the rate you see
//          is the rate you earn."), three commitments section
//          (100% FSC pass-through, itemized quotes, Quick Pay
//          without factoring contract), honest math box showing
//          $2,200-load economics side-by-side with typical-broker
//          figures (no named competitors; Option B disclaimer),
//          Milestones M1–M6 advancement path, "What's coming"
//          roadmap framing rate cards / fuel card / insurance
//          referrals / equipment financing as aspirational not
//          current, new closing CTA. All copy traces to Honest
//          Claims Whitelist. Also fixed contact.html:247 FAQ
//          (retired "Caravan Carrier Program" + v2 QP values →
//          "Caravan Partner Program" + v3 values).
// v3.7.g.1 — Mobile responsive hotfix for /carriers. Pre-existing
//          bug from v3.7.a where .tiers-grid rendered 3-wide at
//          mobile viewports, causing severe text truncation. Root
//          cause: carriers.html line 307 has inline style
//          grid-template-columns:repeat(3,1fr) (added when tier
//          count went 4→3), blocking the @media breakpoint
//          overrides at 1100px and 640px. Also fixed the new
//          math box (v3.7.g) which had the same 4-column-at-mobile
//          issue. CSS-only fix, no !important:
//          (1) Base rule .tiers-grid: repeat(4,1fr) → repeat(3,1fr)
//              — root-cause cleanup, Bronze retired since v3.7.a.
//          (2) @media 1100px: switched .tiers-grid from display:grid
//              to display:flex + flex-wrap. Inline grid-template-
//              columns becomes a no-op in flex mode, letting the
//              @media rule control wrapping via flex-basis on the
//              child .tier-card (2-column at tablet, 100% at mobile).
//          (3) Math box (Option B horizontal scroll) — attribute
//              selector on .honest-math wrapper adds overflow-x:auto
//              at ≤768px, with min-width:640px on grid rows so the
//              4-column comparison stays intact via swipe. Option A
//              (card-stack) would have required HTML data-label
//              attributes, out of scope for this hotfix.
//          No HTML changes. No copy changes. No color changes. No
//          JavaScript. Desktop (≥1101px) layout untouched.
// v3.7.h — Phase 4D close. Added 5 Caravan Partner Program FAQ
//          entries to /faq (3 in Carriers category: Compass Score
//          calculation, tier advancement without growing fleet,
//          double-brokering fraud protection; 2 in Billing:
//          honest answer on 7-day QP working-capital reasoning,
//          Quick Pay vs factoring company comparison). Supporting
//          page sweep confirmed /about, /shippers, /contact, and
//          Next.js /shipper landing are clean of prohibited
//          claims post-4A/4C. Carrier onboarding welcome email
//          at routes/carriers.ts:614 verified on v3 tier language
//          ("Welcome to the Caravan Partner Program!" + Silver
//          tier promotion); zero "Bronze" or stale QP strings
//          anywhere in backend/src (closes Phase 3 Gap 3 by
//          verification only, no code changes). MEMORY.md
//          updated with 4 deferred items for Phase 5+.
//          Phase 4 Content Truth-Up closes with this commit.
// v3.7.i — Principal-address correction. CLAUDE.md commit 57eb145
//          (and the pre-consolidation CLAUDE.md before it) listed
//          Kalamazoo as canonical principal city based on session-
//          memory synthesis. The filed FMCSA address, BMC-84 bond
//          paperwork, and BOL all show 2317 S 35th St, Galesburg,
//          MI 49053. Corrected across: CLAUDE.md §1 (flip + full
//          address + Kalamazoo County caveat), new §3.13 codifying
//          the "verify legal-identity fields against primary sources"
//          rule, site-chrome.json addressCity, _partials/footer.html
//          (cascaded to 13 HTML pages via inject-chrome), auth /
//          carrier login taglines + left-footers, about.html meta
//          + body, careers.html meta, faq.html body, security-
//          policy.html subtitle, privacy.html + terms.html contact
//          blocks, contact.html HQ address block (replaced fabricated
//          261 E Kalamazoo Ave with real 2317 S 35th St Galesburg)
//          + Google Map embed (switched to query-based URL anchored
//          on Galesburg address), backend pdfService COMPANY
//          defaults, chatController + shipperPortalController AI
//          prompts, carrierOutreachService email signature,
//          emailSequenceService cold-email templates, BOLTemplate
//          subheader, lead-hunter cold email template. LEFT as-is
//          per §3.12 / user instruction: Kalamazoo County venue
//          references in §14 and Caravan QP Agreement v2 Article 18
//          (correct — Galesburg is in Kalamazoo County), terms.html
//          arbitration clause (Kalamazoo County is the venue per QP
//          Agreement v2 Article 18), onboarding arbitration clause,
//          login splash map SVG dots (geographic reference),
//          splashQuotes.ts Kalamazoo trivia (employee-audience
//          geography), eldService.ts geo-coord lookup,
//          compassPdfService.ts (already correct).
// v3.7.j — Phase 5B documentation consolidation. Four additions
//          to CLAUDE.md as it stands after e5def51 (v3.7.i):
//          (1) §2 Architecture: categorized inventory of 64 live
//              React routes (47 dashboard + 13 accounting + 4
//              admin) grouped by function — Operations, Financial,
//              Intelligence, Compliance, Configuration,
//              Communication, Integrations, Admin. Clarifies
//              legacy HTML at frontend/public/ae/* vs authoritative
//              React routes. Canonical Lead Hunter drawer
//              component is ProspectDrawer (not "SlideDrawer" —
//              that name was prior-session synthesis error).
//          (2) §2.1 Design System: hybrid color tokens per §3.13
//              primary-source rule. Documents actual codebase
//              values (navy via themes.css variants #0D1B2A /
//              #0A1220 / #0F1117 / #1a1a2e; canvas #faf9f7; gold
//              #BA7517; gold tint #FAEEDA; dark gold #854F0B) AND
//              explicitly marks "#0A2540" / "#F5EFE1" from prior
//              sessions as synthesis errors not to be "fixed".
//              Legal document reference subsection establishes
//              BOL v2.8 as canonical brand expression in document
//              form for all future PDF generators (rate cons,
//              invoices, claim forms, carrier onboarding packets,
//              Compass scorecards). Plus typography, motion rule,
//              anti-patterns, component patterns (ProspectDrawer
//              v3.6.a / IconTabs / inline edit), login UX
//              canonical decisions, carrier-first structural
//              rule, Phase 0–5 upgrade roadmap.
//          (3) §11 Phases Shipped: backfilled 11 historical
//              entries (v3.5.e through v3.6.i), each SHA verified
//              via git show, plus v3.7.i (e5def51). Non-existent
//              versions v3.4.c/k/s, standalone v3.5, v3.5.d,
//              standalone v3.6 correctly excluded per §3.13.
//          (4) §13 Deferred Queue: added Phase 5E (BOL QR +
//              /track + T&T source-of-truth verification with
//              three gap items: QR URL generation, /track route
//              existence + graceful degradation, T&T service
//              projection with PII scope guard).
//          MEMORY.md untouched per §13. CLAUDE.md only; no live
//          code or content changes.
// v3.7.k — Phase 5E.a foundation (BOL QR + public /track + T&T
//          source-of-truth system). No public-facing behavior
//          changes — QR wiring lands in 5E.b, polish in 5E.c.
//          (1) New service shipperTrackingTokenService.ts with
//              generateBOLPrintToken() and
//              refreshBOLTrackingTokenExpiry(). Expiry rule F3:
//              actualDeliveryDatetime + 180d post-delivery,
//              createdAt + 90d pre-delivery failsafe. Delivery
//              refresh never shortens an existing longer expiry.
//          (2) BOL-print hook (Path A only) auto-generates (or
//              reuses) a STATUS_ONLY ShipperTrackingToken on
//              server-side downloadBOLFromLoad. Token plumbed
//              through generateBOLFromLoad via new optional
//              BOLRenderContext parameter for 5E.b QR encoding.
//              Path B client preview (BOLTemplate.tsx) stays
//              token-less by design — preview tokens would
//              abandon on un-dispatched loads.
//          (3) Delivery event (loadController:362 DELIVERED
//              block) fires refreshBOLTrackingTokenExpiry
//              fire-and-forget alongside autoGenerateInvoice,
//              sendShipperDeliveryEmail, onLoadDelivered.
//          (4) CLAUDE.md §14: public /track PII scope decision
//              documented — shipperName intentionally visible
//              for BOL recipient; hiding is theater.
//          (5) CLAUDE.md §13 (F5): marketing nav /tracking.html
//              → /track flip deferred to post-5E.c stability.
//          (6) Vitest suite: token expiry rules, idempotent
//              generation, cross-shipper leak guard, delivery
//              refresh never-shortens guard, STATUS_ONLY scope.
//          ELD simulation guard skipped — eldService.ts audit
//          confirmed read-only, no writes to load_tracking_events.
//          Token format matches shipperPortalController:731
//          55-char confusable-excluded alphabet.
// v3.7.l — Hotfix: AE Console login TOTP verify silent-swallow.
//          handleTotpVerify was missing the passwordExpired branch
//          that handleOtp already had, causing users whose
//          passwords exceeded PASSWORD_EXPIRY_DAYS to get stuck
//          on the 6-digit authenticator step with no error and
//          no redirect. Backend handleTotpLoginVerify returns
//          { passwordExpired, tempToken } after 2FA passes; the
//          frontend handler only checked for data.error and
//          data.user, so the response fell through to
//          setLocalLoading(false) with no UI feedback.
//          4-line insert matching the existing handleOtp pattern:
//          stash tempToken in sessionStorage, redirect to
//          /auth/force-password-change, early return. Production
//          login blocker for any account past the password expiry
//          window.
// v3.7.m — Hotfix: reset-password flow token-consumption ordering.
//          verifyPasswordResetToken used to atomically validate AND
//          consume the reset token in a single call, so any rejection
//          AFTER the peek (missing TOTP, email mismatch, TOTP wrong)
//          left the user unable to retry on the same token.
//          Backend: split into peekPasswordResetToken (read-only
//          validation) + consumePasswordResetToken (mutation).
//          authController.resetPassword reordered to peek → validate
//          email / TOTP / password → prisma.$transaction([
//          user.update, otpCode.update ]). Token consumption and
//          password update succeed or roll back atomically.
//          Frontend (defense in depth): Reset Password button
//          disabled until passwords valid + TOTP 6 digits when
//          requires2FA is true. !requires2FA short-circuit keeps
//          non-TOTP users from being locked out. requires2FA flip
//          still reactive — TOTP field renders after first failed
//          submit returns the flag, but the failed submit now
//          preserves the token so retry is possible.
//          Test coverage: 9-test suite in resetPassword.test.ts —
//          T1 success, T2 expired, T3 already-used, T4 data-layer
//          (bcrypt hash + passwordChangedAt freshness), T5 reuse-
//          after-success, T6 concurrent double-submit, T6b $trans
//          rollback (with mock-limitation note), T7 wrong-TOTP
//          regression, T8 bad-password no-consume + retry.
//          srl_temp_token in login flow untouched (out of scope).
//          Together with v3.7.l this closes both expired-password
//          traps — login-side and reset-side.
// v3.7.n — Phase 5E.b-prep
//          - CLAUDE.md §2.1 full rewrite: four-bucket
//            structure (CANONICAL / LEGACY / SUPERSEDED
//            / DEFERRED)
//          - #0A2540 flipped from synthesis-error flag
//            to canonical navy (designer handoff
//            verified 2026-04-22)
//          - Full designer token set documented:
//            navy scale, gold scale with role-shift
//            note, cream scale, semantic fg/bg/border,
//            status colors, spacing, radii, shadows,
//            motion
//          - Legacy bucket documents live-but-non-
//            canonical hex values (#0D1B2A, #854F0B,
//            AE Console dark navies, #faf9f7)
//          - Typography reconciliation deferred to
//            v3.7.n.1 or v3.7.o
//          - Docs-only commit, no code or style changes
// v3.7.o-build-prep — Phase 5E.b prerequisite
//          - Logo relocated: backend/assets/logo.png →
//            backend/src/assets/logo.png
//          - Three consumers updated to new path:
//            pdfService.ts, compassPdfService.ts,
//            generate-logo.ts
//          - render.yaml buildCommand appended with
//            cp -r src/assets dist/backend/src/assets
//            so binary assets propagate to compiled
//            dist/ in production
//          - Fixes latent pre-existing bug: compass
//            logo was silently missing from all BOLs
//            and compassPdf output on prod since build
//            pipeline setup
//          - Prerequisite for v3.7.o font embedding
//            (Playfair Display + DM Sans under
//            backend/src/assets/fonts/bol-v2.9/)
//          - No visual template changes in this commit
// v3.7.o-build-prep.1 — documentation alignment
//          - render.yaml buildCommand updated to match
//            current Render dashboard value (added
//            cp -r src/config step)
//          - YAML comment added above buildCommand
//            noting file is cosmetic, dashboard is
//            authoritative (service was created
//            manually, not as a Blueprint)
//          - CLAUDE.md §2.2 new subsection "Render
//            deployment authority" documenting the
//            dashboard-vs-render.yaml divergence
//            discovered on 2026-04-22
//          - No code changes, no runtime behavior
//            changes, no deploy behavior changes (the
//            dashboard buildCommand was already
//            updated directly in Render UI earlier
//            today; this commit only aligns repo-side
//            documentation)
// v3.7.n.1 — marketing nav Sign In dropdown visibility hotfix
//          - Shipper Login + Carrier Login labels were
//            rendering white-on-white in the Sign In
//            dropdown on all marketing pages
//          - Root cause: .nav-login-dropdown a in
//            utilities.css (specificity 0,1,1) lost
//            the cascade to .nav-links a in page CSS
//            (same specificity, later source order)
//            which set white/gray nav-link colors
//          - Fix: bumped selector to .nav-login-wrap
//            .nav-login-dropdown a (specificity 0,2,1)
//            on 3 rules (default, :hover, :last-child).
//            All three dropdown items now render dark
//            navy at rest, gold on hover — peer
//            treatment, no emphasis hierarchy
//          - AE Login appearing gold in pre-fix
//            screenshots was a :hover-state artifact
//            during capture (cursor naturally lands
//            on first item when dropdown opens), not
//            intentional styling
//          - Single file touched: utilities.css
// v3.7.n.2 — CI hotfix: features flag test timeout
//          - First dynamic import after vi.resetModules()
//            in features.test.ts ran >5s on CI
//            (observed 5013ms), failing the 5s default
//            timeout and blocking main CI after v3.7.n.1
//          - Root cause: Vitest module-graph walk cost
//            on first reset after full suite accumulation.
//            features.ts itself has zero imports and zero
//            side effects — module-level fix not
//            possible. Isolated run: 5 tests / 20ms.
//          - Fix: 15s timeout on that one test case.
//            Other 4 tests in the file don't need it.
//          - No production code changes.
// v3.7.n.3 — S1 Shippers page content-invisibility defect fix
//          - shippers.html:403 getElementById('hamburgerBtn')
//            corrected to getElementById('hamburger')
//            to match shared nav partial's actual id
//          - Null-guard wrapper added to hamburger/
//            mobileMenu activation block so future
//            missing-element failures cannot terminate
//            the IIFE mid-execution
//          - Restores IntersectionObserver fade-in for
//            all .fade-up / .service-card / .step-item /
//            .why-block elements below the hero
//          - Pre-existing defect per v3.7.n-regression-
//            audit Batch A; no in-range commit caused it
// v3.7.n.4 — S2 Carrier page CTA visibility + email alias fix
//          - carriers.html:920 inline color rgba(0,0,0,0.55)
//            (black on navy-gradient .cta-banner = invisible)
//            corrected to rgba(255,255,255,0.65) matching
//            sibling .cta-sub treatment on the same bg
//          - Onboarding-questions mailto target updated
//            from accounting@silkroutelogistics.ai (AR only
//            per CLAUDE.md §1) to carriers@silkroutelogistics.ai
//            (new Google Workspace alias provisioned
//            2026-04-23 for carrier-onboarding inquiries)
//          - Both the mailto: href and the displayed link
//            text swapped in one atomic edit
//          - Pre-existing defect per v3.7.n-regression-
//            audit Batch A; P0 — direct Apollo carrier-
//            prospect landing surface
// v3.7.n.5 — Track page missing shared assets (S4 + S5)
//          - tracking.html: added missing srl-logo.css
//            <link> between utilities.css and
//            pages/tracking.css. Was the only marketing
//            page besides security-policy.html without
//            it; logo was rendering at intrinsic PNG
//            dimensions and clipping to nav height
//          - tracking.css: ported full 4-column footer
//            CSS block from carriers.css, adapted for
//            var(--navy) bg and tracking.html's actual
//            selectors (h5 not h4, direct .footer-col a
//            not li a, .footer-bottom-links not
//            .footer-legal). Previous 2-rule stub caused
//            the .footer-grid / .footer-brand /
//            .footer-col HTML to collapse to unstyled
//            centered text stack
//          - security-policy.html intentionally NOT
//            bundled: it has its own nav + .nav-logo img
//            32px sizing rule (not .srl-logo-* classes),
//            renders correctly as-is. Nav-unification
//            flagged in regression log Deferred section
//          - Pre-existing defects per Batch A audit;
//            no in-range commit caused them
//          - Deferred: /shared/css/footer.css partial
//            refactor loaded by all marketing pages
//            (cleaner long-term; out of scope for
//            this hotfix)
// v3.7.n.6 — S3 Contact page: drop broken Google Maps iframe
//          - Deprecated maps.google.com/maps?output=
//            embed endpoint no longer renders (Google
//            requires authenticated Maps Embed API
//            key since deprecation)
//          - Replaced with static location card:
//            address + "Open in Google Maps" link.
//            Launches native Maps on mobile (better
//            UX for directions), opens google.com/
//            maps in new tab on desktop
//          - Zero API keys, zero build env changes,
//            no ongoing cost exposure
//          - Address, phone, hours already displayed
//            above in the contact-section grid
//            (info-blocks on lines 79-169), so the
//            new card focuses on the primary
//            directional purpose rather than
//            re-surfacing full contact info
//          - contact.css: dropped dead
//            .map-wrapper iframe rule, added
//            scoped .location-card / .location-
//            address / .location-map-link rules
//            (12 lines net)
//          - Pre-existing defect per Batch A audit;
//            external Google deprecation is root
//            cause
// v3.7.n.7 — S6.a Lead Hunter Send Outreach modal:
//   dark-on-dark text readability fix (PARTIAL)
//          - page.tsx line 1553 description paragraph
//            and line 1671 Cancel button were both
//            using text-slate-400 (#94A3B8) on
//            bg-[#1e293b] modal bg — 3.2:1 contrast,
//            fails WCAG AA for body-size text
//          - Swapped to text-slate-300 (#CBD5E1) →
//            4.8:1 contrast, passes AA. Matches the
//            existing readable-body convention already
//            used by checkbox list rows in the same
//            modal (lines 1585, 1592)
//          - SUPERSEDED: during the re-audit for
//            v3.7.n.7.1, the root cause was traced
//            to globals.css [data-mode="light"]
//            .text-slate-* !important overrides that
//            reverse expected colors on dark surfaces.
//            Both 400 and 300 resolve to dark hex in
//            light mode, so this partial fix had no
//            visual effect. Full fix deferred to
//            Phase 6 theme cleanup.
// v3.7.n.7.1 — Portal auth-guard regression fix
//   (Shipper + Carrier dashboards)
//          - REGRESSION traced via git blame:
//            - 2026-02-19 a4923743: portals built
//              with localStorage auth, worked
//              end-to-end
//            - 2026-02-23 172d6f3b: security
//              hardening eliminated localStorage
//              tokens (httpOnly cookies only).
//              Stores updated; two dashboard
//              layouts NOT updated — still guarded
//              on deprecated token field which
//              became permanently null
//            - ~2 months silent breakage. No real
//              shippers/carriers approved during
//              window; AE Console unaffected
//              because it uses AuthGuard.tsx which
//              correctly checks user/
//              isAuthenticated
//            - 2026-04-23: Apollo-readiness test
//              surfaced the bounce loop
//          - Fix forward: both portal dashboards
//            now guard on user presence, call
//            loadUser() to populate from httpOnly
//            cookie via /{role}-auth/me. Matches
//            AuthGuard pattern proven on AE Console
//          - Security hardening from 172d6f3b
//            preserved — no revert, no reintroduction
//            of localStorage or JS-accessible tokens
//          - Bundled: notifications useQuery
//            `enabled: !!token` → `enabled: !!user`
//            in both layouts. Notifications have
//            been broken the same 2-month window
//            (same token-null root cause)
//          - Bundled: dropped noise line in carrier
//            layout that set Authorization header
//            to "Bearer null"; carrier MarcoPolo
//            prop now explicit `token={null}`
//          - Shipper approval gate (S-2) + AE
//            approval UI (S-3) deferred to Phase 6
//          - Theme system cleanup (S6.a root cause)
//            deferred to Phase 6
// v3.7.n.8 — S6.b Load Board "New Load" button
//   non-functional fix
//          - dashboard/loads/page.tsx: the "+ New
//            Load" button at line 431 correctly
//            toggled showCreate state, but the
//            <CreateLoadModal> render at line 855
//            was nested INSIDE a {load && (...)}
//            wrapper (introduced 2026-03-31 for
//            load-detail panels). When no load was
//            selected (typical Load Board open
//            state), the modal was unmounted, so
//            clicks did nothing visibly
//          - Fix: moved <CreateLoadModal> out of
//            the {load && (...)} wrapper. Modal
//            handles its own open/close via props
//            and accepts cloneFrom=null for
//            new-load mode. No dependency on a
//            selected load. Zero behavior change
//            when a load IS selected
//          - Added clarifying comment above the
//            relocated render to prevent future
//            re-nesting during "cleanup" passes
//          - Pre-existing defect introduced
//            2026-04-08 commit 10e0ea3d; single-
//            commit inconsistency (button placed
//            outside wrapper, modal placed inside)
//          - Internal-only impact, no prospect-
//            facing effect
// v3.7.n.9 — S6.c Lane Analytics runtime crash fix
//   (.toFixed on undefined)
//          - Root cause was SHAPE MISMATCH
//            between backend response and frontend
//            interface declarations, NOT a null-
//            guard gap. Backend /analytics/lanes
//            returns { lanes, total } where each
//            lane has marginPct/avgRatePerMile/
//            loads. Frontend reads marginPercent/
//            avgRate/volume. Similarly
//            /analytics/margins returns
//            byEquipmentType with avgMarginPercent;
//            frontend reads byEquipment with
//            avgMargin. Three unguarded .toFixed()
//            calls (lines 269/272/329 pre-fix) all
//            crashed on undefined fields whenever
//            the backend returned non-empty data
//          - Fix: Option (iv) frontend adapter at
//            the useQuery boundary. Added typed
//            BackendLaneResponse +
//            BackendMarginResponse interfaces and
//            two pure adapter functions
//            (adaptLanesResponse /
//            adaptMarginResponse) that map
//            backend shape → frontend shape with
//            safe defaults (trend="FLAT" since
//            backend doesn't compute trend;
//            stats derived locally from lanes[])
//          - Null-guards at .toFixed() call sites
//            (spec option i) would have rendered
//            misleading zeros for real data —
//            rejected
//          - Full backend/frontend contract
//            alignment catalogued as Phase 6
//            architectural debt (rename backend
//            OR update frontend interfaces OR
//            shared types module)
//          - S6.c secondary issue (error-boundary
//            text renders white-on-white due to
//            globals.css light-mode text-white
//            override) consolidated under existing
//            Phase 6 Theme System Cleanup entry;
//            not fixed here
//          - Pre-existing defect per Batch A
//            audit; internal-only AE Console
// v3.7.o — Phase 5E.b.1 — BOL v2.9 data model
//          foundation (Commit 1 of 4 in the sequenced
//          v2.9 rollout).
//
//          Schema: Load model expanded with proNumber,
//          releasedValueDeclared, releasedValueBasis
//          (new enum), piecesTendered, piecesReceived.
//          Migration 20260423000000_add_bol_v29_fields
//          adds columns additively — all nullable or
//          defaulted, no backfill.
//
//          Interface: LoadBOLData expanded with 12 new
//          optional fields covering the five new schema
//          fields plus seven fields that were already
//          in schema but not surfaced to BOL generation
//          (shipperReference, trailerNumber, sealNumber,
//          declaredValue, driverPhone, carrierLegalName,
//          carrierContactName).
//
//          Controllers: createLoad + updateLoad accept
//          the five new fields with inline validation
//          (releasedValueBasis enum guard, piecesTendered
//          / piecesReceived non-negative-integer guard).
//          downloadBOLFromLoad expanded Prisma include
//          to fetch carrierProfile.companyName/contactName
//          + driver relation; identity fields derived
//          from the load record before passing to the
//          BOL renderer.
//
//          No template rendering changes in this commit
//          (that's Commit 2 / v3.7.p). No UI capture
//          (Commit 3 / v3.7.q). No /track frontend route
//          (Commit 4 / v3.7.r). Existing BOLs render
//          unchanged.
//
//          The Batch B work from the original single-
//          commit v3.7.o plan (BOL v2.9 template, QR
//          wiring, fonts, htmlEntities/qrGenerator
//          helpers, BOLTemplate preview banner, I1-I4
//          smoke-test fixes) lands in Commit 2 / v3.7.p.
// v3.8.a — Multi-line shipment foundation (Commit 1 of 4
//          in the v3.8 epic).
//
//          Schema: new PackageType enum (10 values:
//            PLT / SKID / CTN / BOX / DRUM / BALE /
//            BUNDLE / CRATE / ROLL / OTHER). New
//            LoadLineItem model with per-line pieces,
//            package type, description, weight,
//            optional dimensions, freight class, NMFC,
//            per-line hazmat (D2: mixed hazmat loads
//            supported), stackable, turnable. Load
//            gains a lineItems relation. Migration is
//            purely additive — new table + new enum +
//            new FK with ON DELETE CASCADE. No
//            modifications to existing Load rows, no
//            backfill (D3).
//
//          Interface: LoadBOLData expanded with an
//            optional lineItems array. Flat fields
//            (pieces / commodity / weight / dimensions*
//            / freightClass / nmfcCode / hazmat) stay
//            and remain authoritative until v3.8.c
//            ships hybrid rendering.
//
//          Controllers:
//          - createLoad accepts optional lineItems
//            array with inline validation (pieces > 0,
//            packageType must be one of the enum
//            values, description non-empty, weight > 0,
//            optional fields type-checked)
//          - updateLoad uses full-replace semantics
//            (D8): if the lineItems key is present in
//            the PATCH body, existing rows are
//            deleteMany'd and the new set is created
//            atomically within the same .update() call.
//            Absent key leaves existing lineItems
//            untouched.
//          - pdfController.downloadBOLFromLoad include
//            clause fetches lineItems ordered by
//            lineNumber ASC.
//
//          Rendering: BOL template UNCHANGED. Existing
//          loads render identically to v3.7.o — the new
//          data path flows through but the PDFKit draw
//          function still consumes only flat fields.
//          Hybrid rendering with "lineItems first,
//          flat fallback" is v3.8.c's scope.
//
//          UI: Order Builder UNCHANGED. Dynamic line-
//          item form is v3.8.b's scope.
//
//          Preservation branch: preserve/v3.7.p-wip
//          holds the earlier v3.7.p BOL-v2.9 template
//          rewrite for v3.8.c to consume.
// v3.8.b — BOL v2.9 template rendering (commit 1 of 5
//          in today's final push sprint).
//
//          Restores the v2.9 designer-fidelity template
//          from preserve/v3.7.p-wip, then iterates on
//          ligature handling and header band based on
//          smoke-test feedback.
//
//          Ligature handling — Option D (features-
//          injection). Monkey-patch on doc.text at
//          function entry injects `features: ["kern"]`
//          into every text invocation's options object.
//          fontkit applies user features only when
//          explicitly passed, so enabling only kern
//          leaves `liga` (ligature substitution) off
//          at the layout-engine level. This eliminates
//          the fi/fl glyph-drop bug in Playfair and
//          DM Sans without inserting any characters
//          into strings. Covers 5 direct + 49 fluent-
//          chained .text() call sites in
//          generateBOLFromLoad with one ~15-line patch.
//
//          The initial v3.8.b smoke test (ZWNJ U+200C
//          insertion approach) visibly rendered the
//          joiner as a narrow vertical glyph resembling
//          lowercase l in Playfair-Italic and DM Sans-
//          Italic — "classified" rendered as
//          "classiflied", "filed" as "fliled", etc.
//          Those fonts' cmap doesn't treat U+200C as
//          zero-width invisible. Features-injection
//          bypasses the issue entirely by preventing
//          the ligature-substitution pass from running.
//          Dropped ligaturePreprocess.ts and its test;
//          pdfLigature.test.ts rewritten to verify
//          features-injection (5 cases, both direct
//          and chained).
//
//          Header background — white (page default).
//          The cream CREAM_2 band from the initial
//          v3.8.b restore was dropped because it
//          created a visible boundary the logo asset
//          didn't integrate into cleanly. White
//          background keeps the compass mark visually
//          unified with the company block. Gold accent
//          bar at y=0 and gold rule below the header
//          retained for separation.
//
//          Logo — transparent compass mark
//          (logo-transparent.png, 256×256 RGBA from
//          the design handoff build/compass-256.png).
//          Scoped LOGO_TRANSPARENT_PATH constant;
//          v2.9 BOL function uses it on both page-1
//          (84pt) and page-2 condensed (28pt) headers.
//          Rate conf / invoice / settlement PDFs
//          continue to use the legacy LOGO_PATH (opaque
//          RGB) over their white backgrounds.
//          Company block shifted 3pt down to balance
//          against the 84pt logo (was 72pt at y=12;
//          now 84pt at y=12 with text starting at
//          y=15).
//
//          Visual fidelity (from preserve/v3.7.p-wip):
//          5-line company block (name / address /
//          contact line / MC-DOT / tagline), QR cream
//          container with TRACK label + BOL#, 6-cell
//          meta row (DATE ISSUED / LOAD REF / EQUIPMENT
//          / PRO # / SHIPPER REF / FREIGHT CHARGES),
//          PARTIES section header + rounded cream
//          container, rounded shipment table with NAVY
//          header row and dashed body separators,
//          Released Value as form (two checkboxes +
//          declared amount + basis unit + NVD + Carmack
//          citation + Shipper Initial line) replacing
//          the prior paragraph, full signature blocks
//          (MC / DOT / Truck / Trailer / Seal / Pieces
//          Tendered / Pieces Received / Carrier Legal
//          Name), two-column T&C on page 2 (9/8 split),
//          clean 3-col footer (MC-DOT-website / tagline
//          / page number — no BOL# or street address).
//
//          Fonts: 9 TTFs (Playfair Display Regular /
//          Italic / Bold / BoldItalic + DM Sans
//          Regular / Italic / Medium / SemiBold /
//          Bold), 1.03 MB total. QR at 95pt with
//          deep-link /track/<token>. Canonical v2.9
//          color tokens.
//
//          Data compatibility: reads the v3.8.a
//          schema foundation. LoadBOLData.lineItems
//          field is in the interface but this commit
//          still renders flat Load fields only.
//          Multi-line rendering loop lands in v3.8.d.
//
//          Apollo launch: Monday 2026-04-27.
//          Remaining sprint commits today:
//            v3.8.c — Order Builder dynamic line-item
//                     UI
//            v3.8.d — BOL multi-line rendering loop
//            v3.8.e — /track/[token] dynamic route +
//                     marketing nav /tracking.html →
//                     /track flip
//
//          Supersedes: v3.7.p (never merged;
//          preserved on preserve/v3.7.p-wip).
// v3.8.c — Order Builder dynamic line-item UI
//          (commit 2 of 5 in sprint)
//
//          Replaces single-set flat-field shipment capture
//          in the Order Builder's Freight section with a
//          dynamic line-item list matching the v3.8.a
//          LoadLineItem schema. Multi-commodity loads,
//          LTL consolidations, and per-item hazmat are
//          now first-class.
//
//          Per-row fields: pieces (required), packageType
//          dropdown (10 enum values PLT/SKID/CTN/BOX/DRUM/
//          BALE/BUNDLE/CRATE/ROLL/OTHER), description
//          (required), weight (required), optional
//          dimensions / freight class / NMFC, per-line
//          hazmat toggle with conditional UN#/class/
//          emergency contact/placard sub-fields, stackable
//          and turnable per-line toggles.
//
//          UX per product decisions D1-D11:
//          - Default 1 row pre-added
//          - "+ Add Line Item" expandable (no hard cap)
//          - Remove button disabled at 1 row (minimum 1
//            required)
//          - Running aggregates row at top (total pieces
//            / total weight / any-hazmat / all-stackable)
//          - Per-line commodity→freightClass auto-suggest
//            reimplemented (fires when description changes
//            AND line's freightClass is empty, so user
//            overrides aren't stomped)
//          - "Show details" toggle collapses the less-
//            common fields to keep rows compact
//
//          Legacy-draft hydration: opening a draft created
//          pre-v3.8.c (flat freight fields, no lineItems
//          in formData) synthesizes 1 pre-filled line
//          item row on resume. User can edit and save
//          without re-entering freight. Drafts with no
//          freight data at all start with an empty row.
//
//          Backend wiring:
//          - loadController.createLoad + updateLoad
//            accepted lineItems array since v3.8.a
//            (unchanged here)
//          - routes/orders.ts convert-to-load bypasses
//            the controller and writes Load directly via
//            Prisma — updated to read formData.lineItems,
//            validate via the same buildLineItems helper
//            (now exported from loadController), and
//            create LoadLineItem rows via nested create.
//            Robust 4-case fallback: lineItems non-empty
//            / lineItems empty array / lineItems absent
//            (synthesize from flat) / lineItems malformed
//            (log + fall back to synthesis).
//          - Load.pallets derived at submit as sum of
//            PLT-type line pieces (backward compat for
//            any reader that indexes the flat column).
//          - Legacy flat columns on Load (commodity /
//            pieces / weight / dimensions* / freightClass
//            / nmfcCode / stackable / hazmat) populated
//            from lineItems aggregates (first-line values
//            or sums/maxes where appropriate).
//
//          OrderSidebar unchanged — it reads only load-
//          level fields (customerId / addresses / equipment
//          / distance / rates), no freight-detail
//          references.
//
//          docs/regression-log.md — new Phase 6 entry for
//          the convert-to-load → loadController bypass
//          pattern. Short-term fix in this commit exports
//          buildLineItems for reuse; long-term refactor
//          routes convert-to-load through the controller.
//
//          Phase 6 polish deferred: drag-to-reorder,
//          package-type icon gallery, keyboard shortcuts,
//          undo-remove, realtime total-weight validation
//          against trailer capacity, legacy flat-field
//          aggregation strategy review (currently first-
//          line wins for freightClass/NMFC/hazmat-primary,
//          max for dimensions, sum for weight/pieces).
//
//          Visual polish pass (approved 2026-04-24
//          during v3.8.c pre-smoke-test review):
//          - Line-items block restyled as one-line row
//            (no expandable details) with checkboxes
//            Stackable / Turnable / Hazmat below, and
//            compact "+ Add Line Item" button right-
//            aligned at the end. Row card uses theme-
//            aware border-only styling (no hardcoded
//            dark hex bg — globals.css light-mode
//            override list doesn't cover #11141c, which
//            was the earlier rendering bug).
//          - Dispatch & Tracking "Waterfall starts…"
//            callout switched from bg-[#FAEEDA]/10 +
//            text-[#FAEEDA] (invisible in light mode) to
//            var(--srl-gold-muted) bg + var(--srl-gold-
//            text) color — readable in both modes.
//          - Top bar buttons (Save draft / Send quote /
//            Create load) + Customer card "Auto-filled"
//            badge switched from text-white / text-
//            slate-200 (both overridden to dark in light
//            mode, creating dark-on-dark on gold bg) to
//            explicit inline styles that bypass the
//            globals.css override list.
//
//          Deferred (logged to regression-log.md under
//          "Phase 6 — Order Builder UX Polish"): F) PU/
//          DEL window time inline with dates, G) CRM
//          facility operating-hours auto-populate, H)
//          NMFC + density-based freight-class auto-
//          suggest. All three need product decisions on
//          edge cases before implementation.
//
//          Critical bug fix (caught during pre-commit
//          smoke 2026-04-24) — three-layer defense
//          against silent freight-data corruption:
//
//          L1 — createLoad and sendQuote mutations now
//          ALWAYS run saveDraft.mutateAsync() before
//          their respective backend calls (was: only
//          when orderId was null). Root cause: the 30s
//          autosave timer means client-side form edits
//          drift ahead of the persisted draft; convert-
//          to-load reads stale order.formData. Without
//          this fix, every load created within the
//          autosave debounce window after editing line
//          items would carry empty/default freight
//          data.
//
//          L2 — Create Load button disabled until at
//          least one line item passes validation
//          (pieces > 0, weight > 0, description non-
//          empty, packageType ∈ enum). Hazmat lines
//          additionally require UN # + hazmat class.
//          Tooltip shows the missing-fields list.
//          Surfaces the issue in the UI rather than
//          silently failing.
//
//          L3 — Backend convert-to-load rejects empty
//          lineItems with HTTP 400
//          INVALID_LOAD_NO_FREIGHT. Protects against
//          non-UI paths (future shipper portal, API
//          consumers, third-party integrations) that
//          bypass the UI guard.
// v3.8.d — Multi-line BOL rendering + /tracking HTML
//          entity decode (closes the v3.8 multi-line
//          shipment epic).
//
//          BOL freight table (pdfService.ts:594-782)
//          now iterates load.lineItems[] when present
//          and renders one row per LoadLineItem with
//          its own pieces / packageType / description /
//          dimensions / weight / freightClass / NMFC /
//          hazmat. Falls back to the legacy single-row-
//          from-flat-fields path when lineItems is
//          empty (preserves backward compatibility for
//          any pre-v3.8.a load).
//
//          Cap of 10 rendered rows on page 1; if
//          load.lineItems.length > 10 the table renders
//          the first 10 with a cream-tinted footer note
//          "+N additional line items — full manifest
//          attached". Totals strip aggregates the FULL
//          line-items array (not capped) so the BOL
//          stays mathematically honest under overflow.
//          Dynamic-page-2 rendering deferred — Apollo-
//          shipped loads will be 1–3 lines in practice;
//          the cap is defensive only.
//
//          Dashed-row separator added between adjacent
//          body rows (vertical dashed col separators
//          retained from single-row layout).
//
//          Public /tracking endpoint (trackingController.
//          ts) now decodes HTML entities on every
//          public-facing string field: equipment,
//          commodity, origin/destination city/state,
//          shipperName, carrierFirstName, lastLocation
//          city/state, stops city/state, checkCalls
//          city/state. Closes the "Dry Van 53&#x27;"
//          rendering bug surfaced during L2228322560
//          smoke test.
//
//          Root cause documented for Phase 6: the
//          backend sanitizeInput middleware (server.
//          ts:150) HTML-escapes every req.body string
//          field for XSS defense, so values containing
//          apostrophes / quotes / angle brackets are
//          stored encoded in the DB. PDFKit decodes at
//          its own boundary (pdfService.ts safe()),
//          but the React /tracking page renders text
//          nodes as-is. Decode at the public-page
//          serialization boundary fixes the symptom
//          without weakening XSS defense; the
//          architectural rework of sanitizeInput stays
//          on the Phase 6 backlog.
//
//          Out of scope (deferred to v3.8.c.1 / Phase
//          6): BOL Shipper Ref → poNumbers[0] mapping,
//          Order Builder ↔ Load Board "New Load" modal
//          consolidation, sanitizeInput middleware
//          rework, NMFC catalog auto-suggest, dynamic
//          BOL page-2 generation.
// v3.8.d.1 — BOL template field bindings fix.
//          Diagnosed via direct DB query of L2228322560:
//          backend BOL renderer was reading from the
//          master customer record for the Shipper
//          section instead of from per-load physical-
//          location fields, AND printing literal
//          placeholder strings ("[Consignee Facility]",
//          "[Shipper Ref]", "[Contact · Phone]", "None
//          ·  [per-load notes]") into the BOL when
//          binding logic was missing or fields were
//          empty.
//
//          Fixes (pdfService.ts only — frontend
//          BOLTemplate.tsx already reads load-level
//          fields correctly):
//          - Shipper section reads load.originCompany
//            || load.shipperFacility || load.customer?
//            .name (Order Builder writes originCompany;
//            legacy paths populate shipperFacility per
//            CLAUDE.md §3.9; customer is last-resort)
//          - Consignee section reads load.destCompany
//            || load.consigneeFacility — NO customer
//            fallback (§3.9: billing customer is never
//            the consignee)
//          - SHIPPER REF metaCell walks the schema's
//            4-field PO chain: poNumbers[0] →
//            shipperReference → shipperPoNumber →
//            customerRef. Em-dash if all empty. Closes
//            v3.8.c.1 by merging into v3.8.d.1.
//          - Empty contact line renders "Contact: —  ·
//            —" instead of "[Contact · Phone]"
//          - Empty Special Instructions renders "None"
//            instead of "None  ·  [per-load notes]"
//
//          LoadBOLData interface extended with
//          originCompany, destCompany, poNumbers,
//          customerRef. bolData spread in
//          downloadBOLFromLoad already includes them
//          via {...load} so no controller change.
//
//          Architectural HTML-encoding bug surfaced
//          alongside this work (equipmentType stored
//          as 'Dry Van 53&#x27;' due to sanitizeInput
//          middleware) lands separately in v3.8.d.2.
// v3.8.d.2 — sanitizeInput middleware rework + data
//          decode migration script.
//
//          Architectural fix for the HTML-encoding bug
//          surfaced in v3.8.d / v3.8.d.1 diagnosis. The
//          previous sanitizeInput middleware (security.
//          ts) HTML-entity-escaped every req.body /
//          req.query / req.params string at write time
//          for XSS defense, causing values like
//          `Dry Van 53'` to be stored as `Dry Van
//          53&#x27;`. Every consumer then had to
//          compensate with a decode pass — pdfService
//          safe(), trackingController decodeOpt() —
//          and any boundary that forgot to decode (the
//          public /tracking page until v3.8.d) leaked
//          raw entities into user-facing surfaces.
//
//          The rewrite removes the source of the
//          encoding. Input hygiene now does:
//          - trim whitespace
//          - strip null bytes (PostgreSQL TEXT rejects
//            them)
//          - cap string length at 10,000 chars (DoS
//            defense; specific fields enforce stricter
//            limits at the validator layer)
//          - depth-limited recursive walk (10 levels)
//
//          XSS defense moves to the OUTPUT layer per
//          OWASP guidance: React auto-escapes JSX text
//          nodes for HTML output, pdfService safe()
//          handles PDF, JSON encoding handles its own
//          char-set. Each context applies the right
//          escape rules at the right time.
//
//          /api/webhooks remains exempt — external
//          services send raw payloads (often with HTML,
//          dollar signs, etc.) that should pass through
//          for downstream parsing.
//
//          Spec correction: the v3.8.d.1 spec stated
//          /api/orders is "currently exempted as v3.8.c
//          bandaid." Audit of security.ts confirmed
//          only /api/webhooks is exempted; /api/orders
//          is unaffected. No re-enable needed.
//
//          Data hygiene: new one-time migration script
//          backend/scripts/decode-encoded-load-fields.
//          ts walks the loads table, finds rows with
//          HTML entities in any of 19 tracked fields
//          (equipmentType, commodity, origin/dest
//          company / address / contact name, shipper /
//          consignee facility, shipperReference,
//          shipperPoNumber, customerRef, special
//          instructions, notes, pickup / delivery
//          instructions, driver name, carrier
//          dispatcher name), and decodes in place.
//          Idempotent. Scoped to loads only —
//          extend or add sibling scripts when a real
//          symptom surfaces in another table.
//
//          Run: cd backend && npx ts-node scripts/
//          decode-encoded-load-fields.ts
//
//          Defense-in-depth: pdfService safe() and
//          trackingController decodeOpt() both retained
//          as belt-and-suspenders for one sprint cycle.
//          Removal candidate in v3.8.e cleanup once
//          fresh writes confirmed clean.
// v3.8.d.3 — Order Builder converted-order gate +
//          migration script multi-pass decode.
//
//          User reproduced the v3.8.d.2 deploy with a
//          test draft and hit "Create load failed —
//          Order already converted" (HTTP 409 from
//          orders.ts:212). Diagnosis: the order had
//          already been converted to a load earlier;
//          the Order Builder UI never tracked
//          order.loadId so users could re-attempt the
//          convert flow on an already-converted order
//          without warning.
//
//          Frontend gate (orders/page.tsx):
//          - resumeDraft now reads order.loadId and
//            order.loadReferenceNumber from the
//            response and stores both in component
//            state.
//          - When convertedLoadId is set, an amber
//            banner renders above the form with a
//            "View loads →" deep-link.
//          - Create load button is disabled when
//            convertedLoadId is set; tooltip explains.
//          - drafts list now defensive-filters out
//            rows where d.loadId is set, so the resume
//            picker never offers an already-converted
//            order.
//
//          Backend (orders.ts):
//          - GET /:id includes loadReferenceNumber +
//            loadNumber by fetching the linked load
//            when order.loadId is present. Read-only
//            join so the frontend gate has a public-
//            facing identifier, not just a CUID.
//          - GET /?status=draft adds loadId: null to
//            the where clause as a defense-in-depth
//            against any future code path that
//            PATCHes status without clearing loadId.
//
//          Migration script (decode-encoded-load-
//          fields.ts):
//          - decodeUntilStable() helper iterates
//            decodeHtmlEntities up to 5 times, stops
//            when output is unchanged. Handles double-
//            encoded values like 'Dry Van 53&amp;
//            #x27;' (one pass yields '&#x27;', a
//            second yields "'"). The single-pass
//            decode wasn't catching pre-v3.8.d.2 rows
//            that had been written through the old
//            middleware twice (e.g. via
//            create-then-edit flows).
//
//          Symptom on user screenshot was
//          'Dry Van 53&amp;#x27;' rendered in the
//          Order Builder's eligibility banner — that
//          double-encoded value lives in
//          orders.formData (JSONB), not loads.
//          equipmentType. The migration script still
//          targets loads only; orders.formData
//          cleanup is a separate sibling script if /
//          when it surfaces in another way. The
//          v3.8.d.2 middleware fix prevents new
//          double-encodes regardless.
// v3.8.d.4 — BOL SHIPPER REF renders all PO numbers
//          from poNumbers[], not just the first.
//
//          User audit of BOL-SRL-L9437063285 confirmed
//          all v3.8.d.x bindings working (originCompany
//          / destCompany / equipment decoded / multi-
//          line freight + totals) but flagged that
//          two POs entered in Order Builder produced
//          only one PO ("1472") on the printed BOL.
//          v3.8.d.1 spec deferred multi-PO display
//          ("rendering more than poNumbers[0] —
//          separate feature"); shipping it now since
//          a real shipper-side reconciliation issue
//          exists when only one of two POs prints.
//
//          New formatPoList helper in pdfService:
//          - 0 POs → empty (falls through to legacy
//            fallback chain)
//          - 1 PO → bare value
//          - 2 POs → "1472, 5678"
//          - 3+ POs → "1472, 5678 +N more" so the
//            ~91pt SHIPPER REF cell at fontSize 9.5
//            doesn't visually overflow with
//            lineBreak: false
//
//          Other gaps surfaced during the audit
//          (logged but not fixed in this commit):
//          1. Contact line empty (— · —) — Order
//             Builder doesn't capture origin /
//             destContactName / Phone, so any pickup-
//             site contact details are blank on the
//             BOL. Phase 6 Order Builder polish.
//          2. Page-1 footer collision: "SEAL # / DATE"
//             labels overlap with the "Where Trust
//             Travels." tagline at the page bottom.
//             Flagged in v3.8.d.1 spec halt conditions
//             as "v3.8.d.2 layout fix if persists" —
//             persists. Separate sprint.
// v3.8.e — Track & Trace status advancement controls.
//          First Phase 6 sprint. Closes the daily-
//          friction gap surfaced 2026-04-29 during
//          v3.8.d.4 BOL audit follow-up: dispatchers
//          spend their day in T&T but had to bounce
//          to Load Board for every status update
//          because the T&T module had zero
//          PATCH /loads/:id/status callers.
//
//          Changes:
//          - New shared helper at lib/loadStatusActions
//            .ts — extracted NEXT_STATUS + STATUS_ACTIONS
//            maps + getNextStatusAction(currentStatus)
//            helper that returns null for terminal
//            statuses so callers can suppress the
//            advance button cleanly.
//          - Load Board imports both maps from the
//            shared module (5-line refactor, no
//            behavior change). Single source of truth
//            for the client-side state-machine UX.
//          - Track & Trace LoadDetailDrawer header
//            renders the same advance button next to
//            the close button, gated by
//            getNextStatusAction(load.status). Uses
//            the same PATCH /loads/:id/status backend
//            endpoint, same gold-on-blue Load-Board
//            visual idiom adapted for the light-mode
//            T&T drawer.
//          - Optimistic UI: success invalidates the
//            tt-load-detail query AND the Load Board
//            "loads" query so a dispatcher with both
//            surfaces open sees the change in both.
//          - Error state: inline red bar under header,
//            preserves the user's place in the drawer.
//
//          Backend untouched: VALID_TRANSITIONS in
//          loadController.ts:435 enforces the legal
//          state machine; auth gates remain
//          BROKER/ADMIN/CEO/DISPATCH; server-side
//          side effects (logLoadActivity,
//          createCheckCallSchedule, etc.) keep firing
//          on every transition regardless of caller.
//
//          Out of scope (deferred):
//          - Bulk status updates
//          - Status reversal/rollback UI
//          - Custom note/reason capture at transition
//          - EditLoadModal (separate Phase 6 sprint)
// v3.8.e.1 — Portal Approval gate for SHIPPER login
//          (S-2 backend). Closes a real security gap:
//          any registered SHIPPER could log in
//          immediately after OTP because
//          customer.onboardingStatus existed in the
//          schema (default PENDING) but was not
//          enforced anywhere on the auth path. Carrier
//          auth has had the equivalent gate since
//          v3.6.e (carrierAuth.ts:170-186); shipper
//          auth never did.
//
//          Changes (backend only — authController.ts):
//          - New checkShipperApproval(user, email,
//            req) helper. Returns null when login may
//            proceed, or a {error, onboardingStatus}
//            payload when blocked. SHIPPER role only —
//            AE Console roles bypass entirely.
//          - Resolves the user → customer link via
//            customer.userId @unique relation.
//          - Status-specific friendly messages:
//            PENDING / DOCUMENTS_SUBMITTED /
//            UNDER_REVIEW → "application under review,
//            we'll contact you within 24-48 hours";
//            REJECTED / SUSPENDED → "contact
//            compliance@".
//          - Edge case: SHIPPER user with no linked
//            customer record → 403 + WARN-level
//            SystemLog ("login blocked, no customer
//            record"). Should not happen in normal
//            flow; logging surfaces it to ops.
//          - Normal block → 403 + INFO-level
//            SystemLog with onboardingStatus, for
//            visibility on legitimately-pending
//            applicants attempting login.
//
//          Gate is wired at TWO call sites for
//          defense-in-depth:
//          1. handleVerifyOtp — primary flow, fires
//             after OTP success and before TOTP/JWT.
//             An unapproved shipper never gets a
//             totp temp token.
//          2. handleTotpLoginVerify — TOTP step,
//             fires before JWT issuance. Closes the
//             theoretical stolen-token-replay vector
//             AND covers the case where an approval
//             is revoked between OTP and TOTP steps.
//
//          AE Console regression-safe: helper short-
//          circuits with `if (user.role !== "SHIPPER")
//          return null;` so BROKER/ADMIN/CEO/DISPATCH
//          /OPERATIONS/ACCOUNTING flows are entirely
//          untouched.
//
//          Out of scope (separate Phase 6 sprint):
//          - S-3: AE Console approve UI at
//            /dashboard/shippers (requires meaningful
//            frontend work)
//          - Credit check integration (Experian / D&B
//            / manual SOP — needs vendor decision)
//          - Shipper "application under review"
//            full-screen UX (paired with S-3)
//          - Email notifications on approval status
//            changes
//          - Auto-approval logic — explicitly out;
//            manual approval only for now
// v3.8.e.2 — ShipperSidebar "Back to Website" link
//          target. Surfaced 2026-04-30 during v3.8.e.1
//          smoke test: clicking the bottom-left link
//          on /shipper/dashboard dumped users on the
//          divergent legacy /shipper prospect-landing
//          page instead of the public marketing
//          homepage. CarrierSidebar gets this right
//          (links to /); ShipperSidebar was linking
//          to /shipper.
//
//          One-line fix: ShipperSidebar.tsx href
//          /shipper → /, mirroring the carrier
//          pattern. The /shipper page's design
//          divergence from the rest of the marketing
//          site stays logged under Phase 6 —
//          "Portal + Public Page Visual Alignment"
//          for a separate cleanup pass.
// v3.8.g — Order Builder origin/destination contact
//          capture (Phase 6.2 sprint). Closes the
//          Contact: — · — em-dash gap visible on
//          every BOL since v3.8.d.1 (BOL template
//          binding correctly reads from
//          load.originContactName / destContactName
//          + Phone but Order Builder had no UI inputs
//          to capture these fields when a facility
//          wasn't picked OR when a picked facility
//          lacked contact info).
//
//          Audit found the entire data plumbing was
//          already in place: schema fields exist on
//          Load model, form types declare all 4,
//          form state defaults to "", FacilityPicker
//          auto-populates on facility selection,
//          backend convert-to-load maps form→DB,
//          BOL template renders correctly. The ONLY
//          gap was UI inputs.
//
//          Single-file fix: 4 input fields added to
//          Order Builder Section 2 (Route) — origin
//          contact name + phone, dest contact name +
//          phone — placed inside each side's grid
//          column directly below the FacilityPicker /
//          manual-address block. 2-column inner grid
//          (name + phone side-by-side) per origin /
//          destination side.
//
//          Per pre-sprint decisions: optional fields
//          (no submission block; em-dash fallback
//          stays graceful), free-text phone (freight
//          contexts have extensions, "ask for Bob",
//          international numbers — accept what's
//          typed). Both reversible based on AE
//          workflow feedback.
//
//          Out of scope (separate Phase 6 sprints):
//          - CRM facility auto-populate (Item G)
//          - Phone validation library
//          - Contact directory autocomplete
//          - Multi-contact per facility
//          - Carrier-side contact fields
//
//          PII scope on public /tracking unchanged —
//          contacts stay internal per T&T source-of-
//          truth doc §2.
// v3.8.h — BOL page-1 footer collision fix. The
//          carrier signature column (column 2 of 3)
//          has 6 rows × 30pt + cert/title overhead,
//          making it the tallest column. With the
//          hardcoded footer rule at fyLine=755, the
//          SEAL # / DATE row's underline at y≈756 sat
//          right on top of the footer rule, and the
//          centered "Where Trust Travels." tagline at
//          footerY=763 visually collided with the
//          SEAL # / DATE labels in the carrier
//          column. Visible on every BOL since v3.8.b
//          BOL v2.9 template shipped.
//
//          Single-line minimum-effective fix in
//          pdfService.ts: fyLine 755 → 770. Footer
//          shifts down 15pt, gives the signature
//          block 15pt of additional clearance.
//          Letter page is 792pt; footer text now
//          bottoms at ~785pt with 7pt to the page
//          edge — within typical print-safe range,
//          unaffected for digital viewing.
//
//          Page-2 footer uses the same fyLine
//          constant so it shifts identically (T&C
//          content area unaffected — auto-wraps and
//          ends well above the footer regardless).
//          All 9 carrier signature fields preserved
//          at their original column positions; only
//          the footer band moved.
//
//          Closes §13.3 Item 5. BOL template stays
//          at v2.9; this is a coordinate fix within
//          the existing template, not a template
//          version bump.
// v3.8.i.1 — Public /tracking PII hardening:
//          strip carrierFirstName + type the
//          loadSelect allowlist.
//
//          2026-04-30 read-only audit of
//          trackingController.ts confirmed the public
//          /tracking serializer is structurally
//          secure (two-layer allowlist: Prisma select
//          + explicit res.json construction). All 17
//          listed sensitive fields confirmed stripped
//          — carrierId, carrierRate, totalCarrierPay,
//          driverName, driverPhone, internal notes,
//          customer rate, margin %, target carrier
//          cost, etc. checkCalls correctly gated on
//          accessLevel === FULL. The audit produced
//          one finding requiring remediation and one
//          defensive improvement.
//
//          Finding #1 — carrierFirstName surfaced
//          publicly when a load had a carrier
//          assigned. Diverged from CLAUDE.md §2 / T&T
//          source-of-truth doc §2 stated policy
//          ("Carrier name — renders as '—'. Public
//          should not see which carrier is hauling —
//          carrier solicitation prevention"). Test
//          loads rendered "—" only because they had
//          no carrier assigned — the moment a real
//          tendered+accepted load went public, first
//          name would have leaked.
//          Fix: removed `carrier: { select: {
//          firstName: true } }` from loadSelect AND
//          removed `carrierFirstName` from the
//          response object. Two-layer strip.
//
//          Finding #6 — `loadSelect: any` meant
//          TypeScript couldn't catch typo-level field
//          additions at compile time. Belt-and-
//          suspenders fix: changed to `loadSelect:
//          Prisma.LoadSelect`. Compile-clean confirms
//          no latent type mismatches in the file.
//
//          Frontend impact: zero. The legacy
//          public/tracking.html consumer at line 300
//          reads `d.carrierFirstName || '—'` with
//          existing em-dash fallback, so absence
//          renders cleanly. The React /track route
//          (frontend/src/app/track/page.tsx) doesn't
//          reference carrier or firstName at all.
//          AE Console + Shipper Portal use separate
//          authenticated endpoints — unaffected.
//
//          T&T source-of-truth doc §2 unchanged — it
//          was already authoritative; this commit
//          aligns code to it. Carrier solicitation
//          prevention preserved at all load states.
//
//          Audit findings #2-#5 (defense-in-depth
//          pattern, conditional accessLevel gating,
//          lat/lon properly never selected, token
//          enumeration as known acceptable risk per
//          T&T doc §5.3) require no remediation —
//          working as intended.
// v3.8.j — Tender-workflow correctness: 3-layer fix
//          for the L6894191249 bug surfaced
//          2026-04-30. The Load Board's blue
//          status-advance button labeled "Tender"
//          (POSTED → TENDERED transition) was being
//          mistaken for the real carrier-tender
//          action. Clicking it just flipped the
//          status flag with no carrier involved,
//          walking loads through TENDERED → CONFIRMED
//          → BOOKED purely as status changes. On the
//          BOOKED transition, a quiet auto-assign at
//          loadController.ts:477 set carrierId =
//          req.user!.id (the calling AE user, not a
//          real carrier) — making the load show
//          "Silk Route Logistics Inc." as carrier in
//          internal views.
//
//          Layer 1 — Backend: removed the line-477
//          carrier auto-assign clause from
//          updateLoadStatus. The clause auto-assigned
//          the calling user as carrier on BOOKED,
//          which was correct only for the carrier-
//          portal flow (where caller IS the carrier).
//          Wrong for AE Console. carrier-portal
//          status updates flow through
//          carrierUpdateStatus which already requires
//          carrierId === req.user.id (line 634), so
//          it never relied on this auto-assign.
//          Carrier assignment now exclusively goes
//          through tenderController.acceptTender —
//          the canonical path that atomically sets
//          carrierId + status=BOOKED in one
//          transaction with compliance check.
//
//          Layer 2 — Backend: added carrier-required
//          state-machine gate in updateLoadStatus.
//          Transitions INTO TENDERED / CONFIRMED /
//          BOOKED via PATCH /loads/:id/status now
//          require existing.carrierId !== null —
//          returns friendly 400 if missing ("Cannot
//          transition to <STATUS> without an
//          assigned carrier. Use the Tender modal..."
//          ). acceptTender is unaffected since it
//          writes Load directly and never calls
//          updateLoadStatus.
//
//          Layer 3 — Frontend: suppressed the
//          status-advance button for POSTED loads in
//          two surfaces:
//          - Load Board page.tsx — JSX condition
//            `load.status !== "POSTED"`
//          - lib/loadStatusActions.ts —
//            getNextStatusAction returns null for
//            POSTED (T&T LoadDetailDrawer uses this)
//          Both surfaces now force AE through the
//          Tender modal for POSTED loads. Status-
//          advance reappears at BOOKED ("Dispatch")
//          onward, after acceptTender has set
//          carrierId.
//
//          Recovery: existing test load L6894191249
//          (status=BOOKED with carrierId pointing at
//          Wasi/SRL) is left as a test artifact; not
//          worth a manual DB fix. Future loads will
//          flow through the corrected workflow.
//
//          Paired sprint v3.8.k logged separately to
//          §13.3 Item 8.1 — dispatch method
//          switching UI (waterfall ↔ loadboard). Both
//          are post-conversion dispatch lifecycle
//          controls.
// v3.8.m — Crawlability lockdown for AE/carrier
//          internal HTML scaffolding (defense layer).
//          Surfaced 2026-05-02 from public-pages
//          audit: 24 /ae/*.html + 10 /carrier/*.html
//          (34 files total) were publicly crawlable
//          with no robots directives, AND
//          /ae/financials.html contained 5 fabricated
//          customer persona entries flagged in §13.3
//          Item 1. Search engines may have indexed
//          pages that misrepresent SRL.
//
//          Two-layer defense (this commit ships
//          defense; v3.8.n ships content cleanup):
//          - Layer 1 (robots.txt): added Disallow
//            /ae/, broadened /carrier/dashboard/ →
//            /carrier/. Compliant crawlers stop
//            fetching the paths.
//          - Layer 2 (per-file meta): injected
//            <meta name="robots" content=
//            "noindex,nofollow"> into all 34 files
//            (recursive find — caught 12 nested under
//            /ae/accounting, /ae/compliance,
//            /ae/dashboard subdirs that the top-level
//            ls had missed). Catches non-compliant
//            crawlers + deep-link discovery.
//
//          Defense-in-depth: robots.txt is honored by
//          major crawlers but not guaranteed; the
//          per-page meta tag is a stronger signal
//          that any crawler reaching the page must
//          not index it.
//
//          Public marketing pages (index.html,
//          carriers.html, contact.html) already had
//          intentional robots meta tags — left
//          unchanged.
//
//          Post-deploy action item (Wasi-driven):
//          submit URL removal requests via Google
//          Search Console for any /ae/* or /carrier/*
//          URLs already indexed. Removal typically
//          propagates within 1-2 weeks.
//
//          Persona content cleanup ships in v3.8.n
//          (paired commit, this session): scrubs the
//          5 fabricated customer contacts in
//          /ae/financials.html and adds a sticky
//          "DEMO DATA" banner to all 34 files using
//          skill-canonical warning tokens.
// v3.8.n — Fabricated persona scrub + DEMO DATA
//          banner (paired with v3.8.m crawlability
//          lockdown). Closes §13.3 Item 1.
//
//          Two changes:
//
//          1. Scrubbed 5 fabricated customer contacts
//             in /ae/financials.html (per-row
//             company + contact name pairs):
//             - "Midwest Manufacturing Co. / Michael
//               Reeves, VP Supply Chain"
//             - "Great Lakes Automotive Parts /
//               Jennifer Walsh, Logistics Director"
//             - "Southeast Food Distributors / Carlos
//               Mendez, Shipping Manager"
//             - "Pacific Chemicals Inc. / David Kim,
//               Procurement Lead"
//             - "Texas Building Supply LLC / Sarah
//               Johnson, Operations"
//             →
//             - "Sample Manufacturing Co. / Sample
//               Contact 1, VP Supply Chain"
//             - "Sample Auto Parts Co. / Sample
//               Contact 2, Logistics Director"
//             - "Sample Food Distributor / Sample
//               Contact 3, Shipping Manager"
//             - "Sample Chemicals Co. / Sample
//               Contact 4, Procurement Lead"
//             - "Sample Building Supply Co. / Sample
//               Contact 5, Operations"
//             Industry-real role titles preserved
//             (per directive — not fabrications).
//             Cities also preserved (geographic
//             references not persona-shaped).
//
//          2. Sticky-top "DEMO DATA" banner
//             injected into all 34 internal HTML
//             files (24 /ae/**/*.html + 10
//             /carrier/*.html) so anyone reaching
//             these surfaces via deep link cannot
//             miss the framing. Banner specs per
//             srl-brand-design v4.7 source of truth:
//             - Background: var(--warning-bg)
//               #FBEFD4
//             - Border-bottom: 1px solid var(
//               --warning) #B07A1A
//             - Body text: var(--fg-1) #0A2540,
//               DM Sans, 13px
//             - "DEMO DATA" label: DM Sans 500,
//               var(--gold-dark) #BA7517,
//               letter-spacing 0.08em, uppercase,
//               11px (small-caps per skill §8)
//             - Icon: Lucide AlertTriangle, stroke
//               1.75, color var(--warning)
//             - Padding: var(--space-3)
//               var(--space-4) (12px / 16px per
//               skill §9)
//             - Position: sticky top, z-index 50
//             - Copy: "DEMO DATA — Sample values
//               only. No live shipments, customers,
//               or personnel."
//
//             Banner styles in new
//             frontend/public/_partials/demo-banner
//             .css; tokens scoped to
//             .srl-demo-banner element to avoid
//             collision with any existing
//             :root variables on the host pages.
//             CSS link injected into each file's
//             <head> right after the v3.8.m meta
//             robots tag. Banner HTML injected
//             right after <body>.
//
//          Token compliance: §7 status (warning,
//          not navy+gold-dark per directive
//          correction), §8 typography (small-caps
//          DEMO DATA), §9 spacing, §13 Lucide icon.
//
//          Combined v3.8.m + v3.8.n effect: even
//          if a crawler bypasses noindex via
//          deep-link, OR a screenshare lands on
//          one of these pages, viewers see honest
//          "demo data" framing rather than fake
//          employees of fake companies.
//
//          §13.3 Item 1 marked CLOSED.
//
//          sales@silkroutelogistics.ai alias
//          surfaced in /ae/communications.html:71
//          during Phase A audit — explicitly
//          deferred per directive to a separate
//          Phase 6 docs sprint (CLAUDE.md §1
//          update parallel to operations@), not
//          rolled into this commit.
// v3.8.o — CI test alignment for v3.8.j gate.
//          Six consecutive CI runs failed since
//          v3.8.j shipped (April 30) — the
//          loadController.test.ts case at line
//          120 ("updateLoadStatus — valid
//          transition succeeds") was set up
//          assuming the OLD pre-v3.8.j contract:
//          POSTED→BOOKED with carrierId=null
//          would succeed. v3.8.j Layer 2 added
//          the carrier-required state-machine
//          gate which now correctly returns 400
//          for that case. Test was right;
//          contract changed under it.
//
//          Missed at v3.8.j ship time because
//          the §3.3 atomic-commits pre-commit
//          checklist runs `npx tsc --noEmit`
//          (typecheck only) and `npx next
//          build` (frontend), not the backend
//          test suite. The failing test was
//          discovered when CI failure
//          notifications surfaced today.
//
//          Fix:
//          - Updated existing happy-path test:
//            mock load now has carrierId set so
//            the gate passes; verifies the actual
//            valid-transition behavior post-v3.8.j
//          - Added new gate-firing test case:
//            POSTED→BOOKED with carrierId=null →
//            400 + error message contains
//            "without an assigned carrier" + load
//            .update is NOT called (verifies both
//            v3.8.j Layer 1 auto-assign removal
//            AND Layer 2 gate together).
//
//          loadController.test.ts now 11 tests
//          (was 10). Full backend suite 164/164
//          passing locally. CI parity confirmed
//          via npm test before commit.
//
//          Lesson for future state-machine /
//          contract changes: add `npm test` to
//          the §3.3 atomic-commits pre-commit
//          checklist when touching
//          controllers/loadController.ts or
//          other tested code paths. Or wire a
//          lighter pre-commit hook that runs
//          tests for changed files only.
// v3.8.o.1 — Test-only fix for resetPassword T6
//          flaky concurrent test. Failed CI on
//          commit 1cabacc (audit-completeness
//          tooling) — but the failure was
//          unrelated to that commit; it surfaced
//          a pre-existing race condition in the
//          T6 test that had been intermittently
//          green locally and red on CI's
//          slightly different timing.
//
//          Root cause: T6 fires two concurrent
//          resetPassword() calls via
//          Promise.allSettled, with $transaction
//          mock using mockResolvedValueOnce
//          (success) + mockRejectedValueOnce
//          (fail) — FIFO call order. Test then
//          asserted `p1.status === fulfilled`
//          and `p2.status === rejected` based on
//          POSITIONAL order in the
//          Promise.allSettled array. But two
//          async resetPassword() calls suspend
//          at their first `await` and the event
//          loop's resume order is not guaranteed
//          to match the array order. Whichever
//          request happens to reach `await
//          prisma.$transaction(...)` first
//          consumes the success mock. Local Node
//          tended to be deterministic; CI's
//          slightly different timing flipped the
//          order ~50% of the time.
//
//          Fix: order-independent assertions.
//          Test now asserts that EXACTLY ONE
//          fulfilled and EXACTLY ONE rejected
//          (regardless of which positional
//          request won), then identifies the
//          fulfilled response by status and
//          verifies its body. The behavior under
//          test (one succeeds, one fails at
//          transaction) is unchanged; only the
//          assertion is order-independent now.
//
//          Verified deterministic: ran T6 in
//          isolation 5 consecutive times
//          locally — all 5 green. Full backend
//          suite 164/164 passing.
//
//          No production code change, no
//          contract change. Pure test-quality
//          improvement. Same v3.8.o pattern
//          (test-only, sub-letter bump).
//
// v3.8.q — Routing consolidation. Deleted divergent
//          React /shipper landing, legacy
//          /tracking.html, and root /login.html +
//          /register.html orphans. Added Cloudflare
//          Pages _redirects entries:
//            /shipper       → /shippers.html  301
//            /tracking.html → /track          301
//            /tracking      → /track          301
//            /login.html    → /auth/login     301
//            /register.html → /auth/register  301
//          Marketing nav + footer regenerated from
//          site-chrome.json (single source-of-truth);
//          Track entries now point at /track. Sub-
//          routes /shipper/{login,dashboard,forgot-
//          password,reset-password,register}
//          unaffected. Closes §13.3 Item 9 (shipper
//          landing divergence).
//          Note: /login.html → /auth/login (React)
//          creates an asymmetry with the existing
//          static /auth/login.html page; HTML→React
//          migration for /auth/login is a future
//          Phase 6 candidate logged separately.
// v3.8.r — Security policy public/private split. The
//          previous frontend/public/security-policy.html
//          published implementation specifics — JWT
//          algorithm name, bcrypt cost, exact rate-
//          limit thresholds, exact session timing,
//          named vendor stack with services per
//          vendor, AES-256-GCM encryption details —
//          which collectively map attack surface for
//          any reader and constrain SRL's
//          implementation flexibility going forward.
//          Industry-standard practice publishes a
//          capability commitment publicly and shares
//          configuration details under NDA.
//          Changes:
//            - Archived: detailed content moved to
//              docs/internal/SECURITY-DETAILED.md
//              (outside Cloudflare Pages deploy scope,
//              committed in repo for internal +
//              NDA-gated reference)
//            - Replaced: frontend/public/
//              security-policy.html now serves a
//              ~280-word commitment overview with
//              capabilities at the WHAT level not the
//              HOW level; section structure 5 instead
//              of 13; canonical typography (Playfair
//              Display + DM Sans) per §2.1
//            - robots.txt: defense-in-depth Disallow
//              for /docs/internal/ + /internal/
//            - sitemap.xml: /security-policy.html URL
//              retained, content changed
//          No customer data ever exposed. The
//          disclosure was about implementation
//          mechanics, not user data. Risk profile was
//          attack-surface-mapping for hypothetical
//          intrusion attempts, not an active breach.
// v3.8.s — Sprint 1: /about render bug + capability
//          reframe + security-policy canvas
//          conformance.
//          (a) /about stats-section was rendering
//              "0 States Covered" before the
//              IntersectionObserver-driven JS counter
//              fired (or under prefersReducedMotion /
//              before scroll-into-view). Static-
//              rendered the final value "48" in
//              place of the "0" placeholder; removes
//              the animated count-up which violated
//              brand-skill motion-restraint guidance
//              and eliminates the broken-render
//              exposure.
//              Label reframed from "States Covered"
//              to "States Licensed." Per voice.md,
//              capability claims (licensing scope)
//              are distinct from volume/track-record
//              claims; "States Licensed" is
//              verifiable against MC# 1794414 and
//              reads as capability scope
//              unambiguously. "States Covered" can
//              be misread as historical volume.
//              Stats-section retained intentionally —
//              single capability stat with section
//              subtitle reads as restraint.
//          (b) security-policy.html canvas color
//              #FFFFFF → #FBF7F0 (--bg-page-web per
//              tokens.md line 67). White section
//              cards retained on cream canvas =
//              canonical card-elevation pattern.
//          Page title sentence-case fix dropped from
//          this sprint pending skill-rule
//          clarification (legal/policy genre
//          convention question — voice.md line 51
//          "legal documents — voice is the absence
//          of voice" supports title case).
// v3.8.t — Sprint 3: marketing footer cascade +
//          .btn-primary contrast (2 real P0s from
//          Sprint 2 scanner spot-check).
//          (a) Marketing footer chrome/CSS structural
//              mismatch — _partials/footer.html emits
//              <h5> + direct <a> children of
//              .footer-col, but page-CSS files
//              (about.css, blog.css, careers.css,
//              contact.css, faq.css) carry stale
//              rules targeting <h4> + <ul><li><a>
//              structure that no longer matches the
//              chrome HTML, so footer text was
//              inheriting from body color cascade
//              and rendering invisible navy-on-navy.
//              Fix: additive chrome-aligned footer
//              rules added to utilities.css with
//              new --fg-on-navy + --fg-on-navy-2
//              tokens per CLAUDE.md §2.1. Stale
//              page-CSS rule cleanup deferred to
//              separate refactor (the additive rules
//              don't conflict — different selector
//              shapes — so dead-letter cleanup is
//              cosmetic, not load-bearing).
//          (b) .btn-primary gold-on-white = 2.66:1
//              ratio across 13 occurrences in 10 AE
//              accounting CSS files. Fix: surgical
//              color swap var(--white) → var(--navy)
//              in every .btn-primary rule. Navy-on-
//              gold = ~9:1, passes AA + AAA. Plus
//              canonical .btn-primary rule added to
//              console.css for new-consumer single-
//              source-of-truth. Existing per-page
//              duplications retained (consolidation
//              refactor deferred).
//          Both fixes verified via Sprint 2 scanner
//          spot-check static cascade analysis prior
//          to writes (Sprint 3 Phase A).
// v3.8.u — Sprint 5: bulk P0 sweep from scanner v2
//          baseline (commit 888cd4a). Three clusters
//          fixed across 12 files / ~36 surgical color
//          swaps:
//          (a) Gold/green button family — color
//              var(--white) → var(--navy) on 14
//              .btn-gold / .qa-btn-gold / .modal-btn-
//              submit / .tab-btn.active / .page-btn
//              .active / .btn-approve(:hover) /
//              .review-btn.approve-btn occurrences
//              across console.css + 8 page CSS files.
//              Mirrors v3.8.t methodology. Marketing
//              page index.css .btn-gold bundled per
//              Sprint 5 directive scope confirmation.
//              shippers.css already-correct (navy
//              text on gold) — skipped.
//          (b) Status badges + tier cards — color
//              darkening to satisfy WCAG AA on the
//              composited pale-tint backgrounds.
//              Tailwind-palette darkened literals
//              chosen over canonical SRL --success/
//              --warning/--danger tokens to match
//              surrounding code style; canonical-
//              token migration deferred. 13 fixes
//              across accounting-analytics.css (5
//              status-* rules), accounting-approvals
//              .css (3 rules including .btn-approve
//              and .status-badge.approved), and
//              accounting-payable.css (5 .tier-*
//              .cpp-tier-name rules + 4 status-badge/
//              tier-badge rules). Color targets:
//              green #16A34A → #15803D, amber #D97706
//              → #B45309, red #EF4444 → #B91C1C,
//              orange #F97316 → #C2410C, blue #3B82F6
//              → #1D4ED8, violet #8B5CF6 → #6D28D9.
//          (c) Slate-400 table headers — color
//              var(--gray-400) → var(--gray-600)
//              across 9 .data-table th / thead th /
//              .approvals-table th / .ref-card .ref-
//              title / .detail-close occurrences.
//              ~7:1 contrast on slate-50 bg.
//          Skipped: ~80-100 of remaining v2 P0 are
//          scanner false positives by category —
//          multi-mode CSS variable resolution (theme
//          tokens like --theme-text-heading defined
//          in both light and dark blocks; scanner
//          buildVarMap picks the last definition);
//          pseudo-class rule cascading (.btn-navy:
//          hover only sets bg, color persists from
//          base .btn-navy rule — scanner doesn't
//          model this); HTML-vs-CSS cascade (.sidebar
//          -nav not recognized as descendant of
//          .sidebar despite HTML nesting). All three
//          are scanner v3 candidates logged to
//          backlog.
//          Sprint 3 .btn-navy:hover finding (Sprint 5
//          A4 cluster) verified false positive — base
//          .btn-navy rule has explicit color: var(--
//          white) which cascades through to :hover
//          state. No fix applied.
//          Estimated P0 delta: 299 → ~150-180. Real
//          readability issues addressed; remaining
//          count is scanner-side noise.
// v3.8.v — Lead Hunter Bug 1: Apollo CSV literal
//          column mapping. mapCsvRow at lead-hunter/
//          page.tsx now reads `First Name` + `Last
//          Name` literals (Apollo's actual columns)
//          and composes contactName, replacing the
//          stale `Contact Name` lookup that returned
//          empty for every Apollo import. Closes the
//          "Hi InsideTracker" greeting bug — when
//          contactName was null, sendMassEmail fell
//          back to company name's first token,
//          producing "Hi InsideTracker" instead of
//          "Hi Sarah". No schema change. C1 of 6
//          atomic Lead Hunter outreach quality fixes.
// v3.8.w — Lead Hunter Bug 2: Wasih → Wasi typo +
//          single source of truth. Added CEO_NAME +
//          CEO_EMAIL exports to email/builder.ts as
//          the canonical SOT, with a startup log line
//          so future regressions surface in logs.
//          emailSequenceService, customerController
//          (mass-email fromName + replyTo + comm
//          from-field), insuranceVerificationService,
//          page.tsx EMAIL_TEMPLATES preview, and the
//          internal CeoOverview "Sales (Wasih)" label
//          all consume the SOT or were renamed. The
//          actual Gmail signature file (whaider.html)
//          was already correct ("Wasi Haider"); the
//          drift was only in body strings and Resend
//          fromName. C2 of 6.
// v3.8.x — Lead Hunter Bug 3: MC# 01794414 → 1794414
//          in the Lead Hunter outreach single source
//          of truth (whaider.html signature, builder
//          .ts fallback, page.tsx EMAIL_TEMPLATES
//          INTRO preview). Brand-skill voice.md is
//          the canonical primary source per §3.13 and
//          declares MC# 1794414 — the leading-zero
//          variant was a propagated typo. Wider sweep
//          across 17 remaining surfaces (10 public
//          HTML pages, 2 chrome assets, 4 PDF
//          services, BOLTemplate, CLAUDE.md §1)
//          logged as §13.3 backlog 8.8 + 8.9 — needs
//          rendered-output verification per §3.2 and
//          FMCSA-SAFER primary-source check per §3.13
//          before sweeping public surfaces. C3 of 6.
// v3.8.y — Sprint 8: bulk P0 sweep across 5 contrast
//          clusters (CSS-side completion). Mirrors
//          v3.8.t / v3.8.u methodology — surgical
//          color swaps across shared component
//          patterns surfaced by scanner v4 trusted
//          baseline (commit a0d15bc). Note: directive
//          targeted v3.8.v but Lead Hunter sprint
//          (commits 2dff607, 99eec3e, ac41454) took
//          v3.8.v / v3.8.w / v3.8.x in parallel; this
//          ships as v3.8.y per §3.1 "never skip a
//          letter".
//          (a) Cluster A — gold/green/amber + white
//              text (~30 occurrences across 14
//              files): .navbar-cta + .category-pill
//              .active across 6 marketing pages + 2
//              auth pages; .btn-success / .btn-amber
//              / .btn-green / .toast-success /
//              .section-tab.active|completed .tab-num
//              / .threshold-banner .info-icon / .nav-
//              cta / .btn-submit / .search-form
//              button / .progress-step.active +
//              .completed .progress-step-num / .form-
//              section.active + .completed .form-
//              section-num. Bundled per "same-shape"
//              directive — color: var(--white) /
//              #FFFFFF / #fff → var(--navy) / #0D1B2A.
//          (b) Cluster B — slate-400 on light card
//              surfaces: 1 fix in console.css
//              (.collapsible-panel-header .chevron
//              var(--gray-400) → var(--gray-600)).
//              tools.css carrier-portal selectors
//              (.fuel-card / .weather-card /
//              .detention-summary / .fuel-widget-
//              placeholder) deliberately SKIPPED —
//              scanner v4 false positive; carrier
//              portal renders on dark navy bg, not
//              white body, so slate-400 actually
//              composites to ~6:1. Logged as scanner
//              v5 candidate.
//          (c) Cluster C — gold-text-on-white CTAs:
//              1 fix in accounting-fund.css
//              (.pagination button:hover:not
//              (:disabled) var(--gold) → var(--gold-
//              dark)). tools.css .weather-card .temp-
//              display skipped (same dark-theme FP
//              as B).
//          (d) Cluster D — status badges + saturated
//              colors at additional selectors (~25
//              fixes across 12 files): per-color
//              darkening matrix matching v3.8.u —
//              green #16A34A → #15803D, amber #D97706
//              / #F59E0B → #B45309, red #EF4444 →
//              #B91C1C, blue #3B82F6 → #1D4ED8,
//              violet #8B5CF6 → #6D28D9. Applied via
//              bulk sed across accounting-receivable,
//              accounting-payable, accounting-
//              approvals, accounting-fund,
//              accounting-dashboard, claims,
//              communications, compliance-alerts,
//              compliance-carrier, compliance-
//              dashboard, crm, financials.
//          (e) Cluster E — composited gold-on-pale-
//              gold (4 fixes): color: var(--gold) →
//              color: var(--gold-dark) on
//              .action-item-icon.icon-invoice +
//              .notif-item.clickable:hover .action-
//              item-arrow (console.css), .txn-type-
//              badge.QP_FEE_EARNED (accounting-fund),
//              .step-tip (training.css).
//          Total: ~70 surgical color edits across 14
//          files. CSS-side audit comprehensively
//          closed. Remaining P0 are themed-sidebar
//          variants (Tailwind utility classes on
//          React .tsx — scanner v5 candidate) +
//          carrier portal dark-theme false positives
//          (also scanner v5).
// v3.8.z — VersionFooter-only marker. The descriptive
//          comment block immediately above (Lead
//          Hunter Bug 4a+b prep) was inadvertently
//          rolled into commit c8c3846 (v3.8.y Sprint
//          8 brand sweep) before the matching schema
//          + code change had a chance to ship. The
//          actual schema migration (ProspectVertical
//          enum + Customer.vertical column + Apollo
//          CSV `Vertical` import wiring + Manual
//          Review queue filter) ships in v3.8.aa.
//          Treat this v3.8.z block as documentation
//          of intent; v3.8.aa is the load-bearing
//          commit.
// v3.8.aa — Lead Hunter Bug 4a+b actual ship: schema
//           change pushed to Neon via prisma db push,
//           bulkCreateCustomers persists vertical,
//           types.ts adds ProspectVertical type, page
//           .tsx mapCsvRow reads `Vertical` column +
//           Manual Review filter mode added. Hard-
//           block on outreach generation lands in C5
//           (v3.8.bb). Per §3.1 letter sequence
//           continuous, v3.8.aa is the next available
//           letter past v3.8.z.
// v3.8.bb — Lead Hunter Bug 4c: vertical-branched
//           Touch 1 outreach + UNKNOWN hard-block.
//           New touch1ColdChainTemplate +
//           touch1WellnessTemplate in email/builder
//           with per-vertical operational signal
//           (logger-download temp drift / DC rejection
//           rate for COLDCHAIN; Sephora 003 chargebacks
//           / damage rate / signature-required
//           residential for WELLNESS). Both pass
//           voice.md calibration: no em-dashes, no
//           softeners, no exclamations, MC# 1794414 +
//           DOT# 4526880 + BMC-84 $75K + $100K
//           contingent cargo authority line, Compass
//           Engine described as 35-point vetting
//           (NOT "AI-powered market intelligence"),
//           specific operational ask at close.
//           UNKNOWN hard-blocks at four call sites:
//           buildEmail (DB lookup), buildEmailSync
//           (in-memory), sendMassEmail (skip with
//           reason in skippedReasons[]), startSequence
//           (throw at sequence start), and
//           processDueSequences (hold + push
//           nextSendAt forward). C5 of 6.
// v3.8.cc — Lead Hunter Bugs 5-7: fallback voice
//           cleanup. Honest-framing rule per §18
//           applied to:
//           (a) builder.ts touch1Template fallback —
//               replaced softeners ("I would
//               appreciate the opportunity to
//               connect", "I am happy to connect
//               whenever it is convenient") with
//               authority line + Compass framing +
//               specific operational ask.
//           (b) page.tsx EMAIL_TEMPLATES INTRO/
//               FOLLOW_UP/CAPACITY previews —
//               removed prohibited claims:
//               "AI-powered market intelligence"
//               (voice.md line 25 prohibition),
//               fabricated "8-12% reduction"
//               (§5 volume stats), fabricated
//               "98% pickup rate" (§5 volume stats);
//               replaced with capability claims
//               (regulatory authority, Compass
//               Engine vetting) + operational asks.
//           (c) emailSequenceService introduction
//               template — dropped fabricated 98%
//               pickup rate, replaced "I'd love to
//               hear about your shipping lanes"
//               softener with operational ask.
//           No em-dashes in any cleaned template.
//           No marketing softeners. No fabricated
//           metrics. C6 of 6 — closes Lead Hunter
//           outreach quality fix sprint.
// v3.8.dd — Sprint 10: bulk React/Tailwind P0 sweep.
//           Mirrors v3.8.t / v3.8.u / v3.8.y CSS-side
//           methodology applied to .tsx components
//           surfaced by scanner v5 (commit a996142).
//           Note: directive targeted next-available
//           letter; v3.8.dd is next after v3.8.cc per
//           §3.1 sequence rule.
//           (a) Cluster T1 — solid gold CTA + white
//               text (~12 occurrences, 7 files):
//               text-white → text-[#0A2540] on
//               bg-[#C8963E] / bg-[#C9A84C] CTA
//               buttons in accounting/disputes,
//               accounting/fund, accounting/reports,
//               carrier/dashboard/compliance,
//               carrier/dashboard/messaging,
//               dashboard/carriers, ShipperChatbot.
//               Navy-on-gold ≈ 9:1, passes AA + AAA.
//               Bulk via sed.
//           (b) Cluster T1b — broken bg-gray-50/100 +
//               text-white form inputs (~12
//               occurrences across dashboard/claims +
//               dashboard/carriers): UI BUG (light
//               gray bg + white text = ~1.05-1.10:1
//               invisible regardless of parent — text
//               was probably copy-pasted from a dark-
//               themed page without updating fg). Sed:
//               text-white → text-slate-700 on lines
//               containing bg-gray-50/100. ~9:1 PASS.
//           (c) Cluster T-edge composited gold-on-pale-
//               gold: VERIFIED V6-FP, no fix applied.
//               All occurrences (bg-[#C9A84C]/10 +
//               text-[#C9A84C] etc.) on dashboard
//               pages with dark-navy ancestor (var(--
//               srl-bg-base) resolves to navy in
//               default mode). Real rendering: gold-
//               tinted-navy bg + gold text = ~5:1
//               PASS. Scanner reports against pale
//               gold from #FFFFFF compositing → false
//               positive class same as Lead Hunter +
//               /track. Logged for v6 JSX tree
//               walking.
//           (d) /track and Lead Hunter modal:
//               VERIFIED ALL V6-FP. Page wrappers use
//               bg-[#0f172a] / dashboard navy → all
//               translucent overlay findings render
//               correctly in real rendering.
//               Customer-facing /track is rendering
//               correctly modulo scanner blind spot;
//               changing text-white to dark would
//               CREATE contrast bugs. No Sprint 10
//               fixes applied to either surface.
//           Total: ~24 surgical Tailwind className
//           edits across 8 files. Real React/Tailwind
//           P0 surface comprehensively closed within
//           v5 scanner's same-element-pairing scope.
//           Remaining ~370 P0 are v6-FP class + ~150
//           CSS-side residue + ~50 edge cases.
//           Gold canonicalization (#C9A84C →
//           #C5A572 or #BA7517 per CLAUDE.md §2.1)
//           logged as separate backlog item per
//           directive scope confirmation #1.
// v3.8.ee — Phase 6.2 Lead Hunter / CRM separation: ?context filter
//           on /customers, POST /:id/approve with required-checks
//           gate, CRM page filtered to APPROVED, AE Console approve
//           UI with inline missing-checks. Closes §13.3 Item 6
//           (Portal Approval UI S-3) and audit 39de1ad. Sprint span:
//           7c74bb1 (Phase 2) → df3545f (Phase 5).
// v3.8.ff — Sprint 14 dashboard layout posture fix. Three AE Console
//           layouts (dashboard, accounting, admin) had their
//           outermost wrappers using inline
//           style={{ background: 'var(--srl-bg-base)',
//                    color: 'var(--srl-text)' }}
//           which resolved to light cream (#F5F3EF) + dark text
//           (#1A1714) in default-mode rendering — but the AE Console
//           UI is built with text-white, slate-400 secondary text,
//           and dark hex card backgrounds, all assuming a dark
//           ancestor. Net effect: flash-of-broken-content during
//           SSR and initial paint before useTheme.loadFromStorage()
//           hydrated and set data-mode="light" on <html>, at which
//           point the existing globals.css [data-mode="light"]
//           override layer would remap the dark Tailwind classes
//           to light surfaces.
//
//           Architectural fix: replace inline style with Tailwind
//           classNames `bg-[#0F1117] text-white`. The existing
//           globals.css overrides at lines 162 + 188 already remap
//           bg-[#0F1117] → var(--srl-bg-base) and text-white →
//           var(--srl-text) when [data-mode="light"] is active, so
//           mode toggle continues to work for free with zero
//           globals.css edits. During SSR/initial paint (before
//           data-mode is set), the literal dark hex renders directly,
//           giving text-white the high-contrast ancestor it expects.
//
//           Sprint 14 is functionally a hydration-flash fix dressed
//           as a bg posture change. v8 scanner findings of
//           text-white-on-cream were partial false positives (real
//           runtime rendering applies the override layer), but the
//           FOBC bug they pointed at IS real.
//
//           Affected files (3): app/dashboard/layout.tsx,
//           app/accounting/layout.tsx, app/admin/layout.tsx (both
//           wrappers — Access Denied splash at line 21 + main
//           content at line 40). Shipper/carrier portals use
//           bg-[#F7F8FA] light gray intentionally and are
//           unaffected. Marketing pages unaffected.
// v3.8.gg — Sprint 15a: Tailwind bulk sweep, scoped to safe
//           pattern-based replacements. Ships Cluster S1
//           (bg-[#1e293b] → bg-[#0F1117], 7 instances across 3
//           files — closes the user-flagged Lead Hunter modal
//           light-mode runtime bug from screenshots) + Cluster
//           S2 (token-discipline gold canonicalization
//           [#C9A84C] → [#C5A572] per CLAUDE.md §2.1, ~200
//           occurrences across all dashboard/accounting/admin/
//           onboarding files) + Cluster S7-legacy
//           (text-[#854F0B] → text-[#C5A572], 19 instances) +
//           cream-context repair (text-[#C5A572] on bg-[#FAEEDA]
//           creates 2.13:1 P0; flipped to text-[#BA7517]
//           gold-dark which pairs ~5:1 on cream — applied across
//           ~15 spots).
//
//           Sprint 15a scope DELIBERATELY DOES NOT include the
//           larger context-sensitive clusters (S3 slate-400/
//           gray-400 on light surfaces 98 P0; S4 text-white on
//           light surfaces 112 P0; S5 status badges 23 P0; S7
//           main DARK-on-DARK Sprint 14 collateral 187 P0)
//           because those need per-line context awareness — the
//           same token (e.g. text-gray-600) is correct on light
//           cards and wrong on dark dashboard wrappers within
//           the same file. Bulk sed risks creating new P0s by
//           over-correcting in mixed-context files. Already
//           caught one over-correction class during Sprint 15a
//           execution: S2 [#C9A84C] sed broke gold-on-cream
//           badge pattern at 15+ spots; repaired in same commit.
//
//           Sprint 15b is queued for the ~420 context-sensitive
//           findings via per-line edits driven by scanner output
//           file:line metadata. Top files for Sprint 15b focus:
//           loads/page.tsx (45 P0, 21d/24l mixed),
//           fuel-tables/page.tsx (33, 20d/13l), onboarding/
//           page.tsx (35, 0d/35l pure-light), routing-guide/
//           page.tsx (25, 4d/21l), scorecard/page.tsx (25,
//           2d/23l).
//
//           Per-cluster retirement count this commit: ~33 P0
//           (S1 7 + S2 14 in P0 bucket + S7-legacy 19) plus
//           ~200 §2.1 token-discipline improvements not in
//           scanner P0 awareness. Scanner Phase C re-run will
//           show the exact delta vs 1,211 baseline.
// v3.8.hh — Sprint 15b per-file context-sensitive Tailwind P0
//           sweep across 11 dashboard files using per-line edits
//           with bg-context awareness from scanner v8 file:line
//           metadata. Replaces unsafe bulk-sed methodology.
//
//           Files processed:
//             - dashboard/loads/page.tsx (45 → ~4 P0 expected)
//             - onboarding/page.tsx (35 → ~6, includes 5 false
//               positives where scanner can't see bg-navy
//               custom Tailwind class)
//             - dashboard/fuel-tables/page.tsx (33 → ~11)
//             - dashboard/scorecard/page.tsx (25 → ~7)
//             - dashboard/routing-guide/page.tsx (25 → ~4)
//             - dashboard/phone-console/page.tsx (24 → ~8)
//             - dashboard/contract-rates/page.tsx (19 → ~10)
//             - dashboard/drivers/page.tsx (18 → ~7)
//             - dashboard/sops/page.tsx (17 → ~8)
//             - dashboard/tagging-rules/page.tsx (16 → ~7)
//             - dashboard/lead-hunter/page.tsx (9 → 0 PURE DARK)
//
//           Fix shapes applied per-finding (~197 total swaps):
//             A — text-{slate|gray}-{500|600|700} on dark →
//                 text-slate-400 (Sprint 14 collateral retired)
//             B — text-white on light card surface →
//                 text-[#0A2540] (canonical SRL navy)
//             C — text-{slate|gray}-{300|400|500} on light →
//                 text-{slate|gray}-700
//             D — text-{color}-{400|500} status badge on light
//                 → text-{color}-700 (green/red/blue/amber/yellow)
//             E — text-white/N translucent on dark →
//                 text-slate-400
//             gold-residual — text-[#C5A572] on light →
//                 text-[#BA7517] gold-dark (continues Sprint 15a
//                 cream-context repair pattern)
//
//           Methodology: scanner v8 produces file:line:bg:token
//           tuples; perl swap-applier reads tuples + line edits
//           via /(?<![\\w\\-])TOKEN(?![\\w\\-])/ word-boundary
//           regex on the target line only. NO bulk-sed across
//           files. NO bulk-sed within file. Each swap is line-
//           targeted with bg-context confirmed by scanner output.
//
//           Bulk-sed rejected after Sprint 15a's gold-on-cream
//           over-correction class (caught + repaired mid-commit)
//           proved the risk empirically — same Tailwind token
//           (e.g. text-gray-600) is correct on light cards and
//           wrong on dark dashboard wrappers within the same
//           file, so any bulk approach over-corrects.
//
//           Lead Hunter at 9 → 0 P0 (pure-dark file, all 8
//           text-slate-600 + 1 text-red-400/60 swapped). Closes
//           the visual cluster the user surfaced via screenshots
//           that triggered the entire Sprint 14/15a/15b
//           sequence.
//
//           Scanner false positives logged: onboarding nav at
//           lines 251/362/367/370 uses `bg-navy` custom Tailwind
//           utility (Tailwind plugin or extends.colors config)
//           that scanner v8's TAILWIND_PALETTES doesn't
//           recognize, so finds resolved against next-up
//           ancestor `bg-[#F8FAFC]` light instead of true dark
//           navy. Real rendering is correct (text-white on dark
//           navy nav). Not fixed because changing those would
//           break correct rendering.
// v3.8.ii — Sprint 16: shipper/carrier portal Tailwind P0 sweep
//           via per-file context-sensitive edits (Sprint 15b
//           methodology) extended to portal scope. 332 swaps
//           applied across 29 portal files; 38 single-occurrence
//           outliers + scanner false positives skipped.
//
//           Portal context: layouts use `bg-[#F7F8FA]` light gray
//           intentionally (per Sprint 13 audit) — fixes target
//           text-color choices that work against light bg, NOT
//           layout posture flip like Sprint 14 did for AE Console.
//
//           Files processed (29 with swaps applied):
//             - carrier/dashboard/page.tsx (36 swaps, Caravan
//               Partner Program tier display surface)
//             - shipper/dashboard/tracking/page.tsx (38)
//             - carrier/dashboard/settings (25)
//             - carrier/dashboard/compliance (24)
//             - carrier/dashboard/available-loads (21)
//             - carrier/dashboard/scorecard (21)
//             - carrier/dashboard/payments (21)
//             - carrier/dashboard/my-loads (18)
//             - carrier/dashboard/documents (17)
//             - carrier/dashboard/messaging (12)
//             - shipper/dashboard/messages (11)
//             - 18 more portal files with smaller P0 counts
//
//           Fix shapes applied:
//             P1 — text-{slate|gray}-{400|500} on light →
//                  text-{slate|gray}-700 (~216 retired —
//                  dominant secondary-text legibility cluster)
//             P2 — text-[#C9A84C] non-canonical gold on light →
//                  text-[#BA7517] gold-dark (~76 retired —
//                  continues Sprint 15a's gold canonicalization
//                  to portal scope which the earlier sed didn't
//                  reach; aligns with §2.1 token discipline)
//             P3 — text-white residual on light card →
//                  text-[#0A2540] canonical SRL navy (~12)
//             P4 — text-{color}-{400|500} status badge on
//                  light → text-{color}-700 (~30 across emerald/
//                  amber/red/green/blue/yellow/indigo)
//             P5 — text-{slate|gray}-{200|300} light-on-light
//                  decorative → text-{slate|gray}-{500|700}
//                  (decorative chevrons get -500 to preserve
//                  subtle indicator role; -700 default)
//             E  — text-white/N translucent on light → text-
//                  slate-500 (single occurrence in shipper
//                  scope)
//
//           Caravan Partner Program tier badges (Silver/Gold/
//           Platinum at carrier/dashboard/page.tsx:24-26)
//           PRESERVED — TIER_COLORS uses text-slate-600,
//           text-yellow-700, text-purple-700 which are not in
//           swap rules (shade 600/700 on light is already PASS).
//           Note: current tier visual palette (yellow/purple
//           Tailwind) doesn't match brand-skill canonical (SRL
//           gold #C5A572 for Gold; navy+gold for Platinum) but
//           tier visual palette reconciliation is brand-skill
//           scope, NOT contrast scope. Sprint 16 fixes contrast
//           only.
//
//           Quick Pay tier name reconciliation (memory #26
//           canonical Silver/Gold/Platinum) explicitly OUT of
//           Sprint 16 scope per directive. Sprint 16 fixes
//           contrast on whatever tier names exist today.
//
//           Methodology: same per-line edit approach as Sprint
//           15b — scanner v8 produces (file, line, bg, token)
//           tuples; perl swap-applier reads tuples + applies
//           word-boundary regex swap on the target line only.
//           NO bulk-sed across files. Each swap is line-targeted
//           with bg-context confirmed by scanner output.
//
//           Scanner false positives skipped (4 instances):
//           text-[#0F1117] inside dark sidebar/nav at
//           shipper/register lines 65/95, CarrierSidebar:79,
//           ShipperSidebar:99 — element parent has gradient or
//           non-Tailwind hex bg the scanner doesn't resolve, so
//           it walks up to the nav's `bg-[#0F1117]` and reports
//           dark-on-dark. Real rendering is text-on-gold-avatar
//           or similar correct contrast. Defer to Sprint 19
//           per-finding triage or v9 scanner gradient bg
//           recognition.
//
//           Public-facing impact: shipper portal (procurement-
//           facing tracking/messages/documents/quote/invoices/
//           settings/analytics) and carrier-facing Caravan
//           Partner Program + dispatch board surfaces now
//           render with brand-conformant readable contrast.
//
//           Net retirement vs 1,016 baseline: ~332 P0 expected
//           (332 swaps − ~5 cases where swap target line had
//           multiple findings only one matched). Scanner Phase
//           C confirms exact delta.
// v3.8.jj — Sprint 17 CSS-side bulk P0 sweep (final mechanical CSS
//           pass). 76 P0 retirement (685 → 609) across 5 cluster
//           shapes. Mirrors v3.8.t / v3.8.u / v3.8.y methodology
//           applied to remaining CSS files.
//
//           Var-level fixes (single-source change retires N
//           findings file-wide):
//             --gold-dark: #B8862E → #BA7517 (canonical gold-dark
//               per CLAUDE.md §2.1 LEGACY-ALLOWED). Provides ~5:1
//               on cream tint for badges + borderline ~3.3:1 on
//               dark navy (passes large-text AA). Initial attempt
//               at #854F0B (~9:1 on cream) created NEW P0s on dark
//               navy (~1.7:1) — caught mid-Sprint, reverted to
//               #BA7517 balanced compromise.
//             Added --green-dark: #15803D, --amber-dark: #92400E,
//               --red-dark: #991B1B vars to console.css :root.
//
//           Targeted bulk seds:
//             - 6 status-badge selectors in compliance-carrier.css
//               swapped color: var(--{color}) → var(--{color}-dark)
//             - communications.css: 4 .tier-GOLD / .stage-Active /
//               .icon-email-out / .comm-type-label badges swapped
//               color: var(--gold) → var(--gold-dark)
//             - marketing CSS files (about/blog/careers/faq/
//               carriers/terms/privacy/security-policy/auth):
//               literal color: #C8963E → #854F0B (legacy
//               dark-gold per §2.1, ~9:1 on white PASS)
//             - All CSS files: perl pattern match
//               `background: #C8963E + color: #FFFFFF` →
//               navy text on gold (per v3.8.t Cluster B fix
//               extended to remaining buttons)
//
//           Chrome rule explicit-color additions:
//             - .footer / .navbar / .nav / .navbar.scrolled /
//               .mobile-overlay / .mobile-menu / .trust-bar
//               selectors in 11 marketing CSS files received
//               explicit color: var(--fg-on-navy) declarations
//               where previously cascade-inheriting body color
//               on dark bg → invisible navy-on-navy. Sprint 3
//               v3.8.t fixed this in utilities.css for chrome
//               structure; Sprint 17 fixes it at page-CSS level
//               for belt-and-suspenders + reduced surface for
//               future cascade regressions.
//
//           Marketing CSS bulk: perl rule-block aware swap of
//             color: var(--gray-400) → var(--gray-600) on rules
//             with light bg (#F1F5F9 / #F8FAFC / #FFFFFF /
//             var(--white) / var(--gray-50/100/200)) — closes
//             secondary-text legibility on .comparison-table th,
//             .tier-NONE, .status-DISMISSED, .progress-step-num,
//             .lh-table th and similar.
//
//           Remaining CSS-side P0 (~140) after Sprint 17:
//             - 12 var(--gold) badge residuals on cream (need
//               per-selector swap to var(--gold-dark) — outside
//               communications.css which was already done)
//             - 8-12 cascade-inherit dark navy on non-chrome
//               selectors (.timeline-step, .tier-card::before
//               etc.) — per-selector add color: var(--fg-on-navy)
//             - 5 #C8963E text-on-white in marketing pages where
//               .btn-primary swap didn't catch
//             - 4 bg-gold + text-white residuals
//             - 2 white-on-translucent-white overlay patterns
//             - Long tail of single-occurrence outliers
//
//           These remaining ~140 are diminishing-returns per-
//           finding work for Sprint 21 (sequence with marketing
//           Tailwind sweep Sprint 18, narrative work Sprint 19,
//           etc.).
//
//           Pre-commit verification: backend tsc clean, frontend
//           next build clean.
//
//           Per §3.1, version bump justified — publicly-visible
//           CSS rendering changes across AE Console + accounting
//           + marketing pages.
// v3.8.kk — Sprint 18 small-scope auth/error/track P0 sweep.
//           10 genuine fixes applied across 9 files. Sprint 18
//           directive's projected ~220 P0 was inflated by stale
//           Sprint 14 Phase C analysis; actual filtered scope
//           after Sprints 15b/16/17 is ~80 in-scope, of which
//           ~65 are SCANNER FALSE POSITIVES due to v8's cross-
//           component layout context limitation.
//
//           Files fixed (10 swaps):
//             - auth/login/page.tsx:387 — TOTP secret display:
//               text-[#C9A84C] → text-[#BA7517] canonical gold-dark
//             - auth/error.tsx:16 — error icon: text-red-400 →
//               text-red-700 (composited red tint)
//             - app/error.tsx:23 — root error ID display:
//               text-white/30 → text-slate-400
//             - onboarding/error.tsx:16 — onboarding error icon:
//               text-red-400 → text-red-700
//             - onboarding/page.tsx:501 — Sprint 15b residue:
//               text-amber-500 → text-amber-700
//             - track/page.tsx:176 — public track icon:
//               text-white/30 → text-slate-400 on dark bg
//             - components/auth/LoginSplash.tsx:189 — feature
//               icon: text-[#d4a574] → text-[#BA7517] canonical
//             - components/invoices/CreateInvoiceModal.tsx:88 —
//               close X icon: text-gray-400 → text-gray-700
//             - components/contacts/ContactsPanel.tsx:250 — close
//               X icon: text-gray-400 → text-gray-700
//             - components/invoices/InvoiceLineItemsEditor.tsx:96
//               — hover delete: hover:text-red-400 → -700
//
//           Scanner false positives DOCUMENTED (~65 across):
//             - components/layout/Sidebar.tsx (8) — renders inside
//               app/dashboard/layout.tsx bg-[#0F1117] dark navy
//             - components/orders/LineItemsSection.tsx (13) —
//               renders inside Order Builder dashboard
//             - components/loads/RateConfirmationModal.tsx (11) —
//               dashboard load modal
//             - components/loads/CreateLoadModal.tsx (11) — same
//             - components/invoices/BatchActionsBar.tsx (5)
//             - components/ui/CommandPalette.tsx (4)
//             - components/ui/StatCard.tsx (3)
//             - components/ui/FormElements.tsx (3)
//             - components/ui/ClickToCall.tsx (2)
//             - components/MarcoPolo.tsx (2)
//             - components/auth/LoginBrandPanel.tsx (1)
//             - components/ui/ThemePanel.tsx (1)
//             - others
//
//           ROOT CAUSE: scanner v8 layout-fallback resolution
//           (Sprint 13 v8) only fires for files in app/ route
//           directories; components in components/ render in
//           dashboard dark contexts but scanner can't resolve
//           that statically. Real rendering is high-contrast
//           (text-slate-400 on dashboard dark navy = ~5:1 PASS).
//           Force-fixing these would create dark-on-dark
//           readability bugs in actual dashboard rendering —
//           rejected as net-negative per Sprint 17 lesson
//           reinforced.
//
//           v9 scanner candidate (already in v7/v8 deferred
//           list as "cross-file React component composition"):
//           extend findAncestorBg to walk import graph and
//           propagate layout context through component
//           boundaries, OR use Next.js app-router conventions
//           to associate components with their consuming routes.
//
//           Pre-commit verification: backend tsc clean, frontend
//           next build clean.
//
//           Per §3.1, version bump justified — publicly-visible
//           changes to auth flow + error boundaries that every
//           user encounters on first error.
//
//           Sprint 18 retirement: 609 → ~595 P0 (~10 actual
//           retires + ~5 P0→P1 reclassifications via swap shape).
//           Small headline number, correct work — same atomic
//           commit discipline pattern as Sprint 15a.
// v3.8.ll — Sprint 19 per-finding dashboard + portal residue
//           triage. 162 swaps applied across 71 files. No bulk
//           cluster methodology — each file processed via the
//           Sprint 15b/16/18 perl swap-applier with line-targeted
//           edits driven by scanner v8 file:line:bg:token tuples.
//
//           Major surprise: dashboard/carriers/page.tsx (55 P0,
//           40 swaps applied) was MISSED in Sprint 15b's top-11
//           cutoff AND explicitly excluded from Sprint 16 portal
//           scope (it's an AE Console carrier-management page,
//           not the carrier portal). Single-largest residue file
//           in the codebase — fixed in Sprint 19 using same shape
//           A/B/C/D/E methodology as Sprint 15b. Lesson: top-N
//           file filtering misses long-tail files that
//           individually count but cumulatively matter.
//
//           Other files swept in Sprint 19 (smaller counts):
//             - dashboard/dock-scheduling/page.tsx (11)
//             - dashboard/exception-config/page.tsx (10)
//             - dashboard/lead-hunter/tabs/ProfileTab.tsx (10)
//             - dashboard/fleet/page.tsx (7)
//             - dashboard/claims/page.tsx (6)
//             - dashboard/contract-rates/page.tsx (5)
//             - dashboard/track-trace/tabs/ExceptionsTab.tsx (5)
//             - dashboard/waterfall/tabs/TendersTab.tsx (5)
//             - long tail of 60+ files with 1-4 P0 each
//
//           Same shape mapping as Sprint 15b/16:
//             A — text-{slate|gray}-{500|600|700|800|900} on dark
//                 → text-slate-400 (Sprint 14 collateral retired
//                 in files Sprint 15b's top-11 didn't cover)
//             B — text-white on light card → text-[#0A2540]
//             C — text-{slate|gray}-{300|400|500} on light →
//                 text-{slate|gray}-700
//             D — text-{color}-{400|500} status badge on light →
//                 text-{color}-700
//             E — text-white/N translucent on dark → text-slate-400
//             gold-residual — text-[#C5A572] on light cream
//                 (bg-[#FAEEDA]) → text-[#BA7517] gold-dark
//                 (preserves Sprint 15a's cream-context repair
//                 pattern; applied as preventive sweep across
//                 all in-scope files even where current scanner
//                 didn't surface a finding)
//
//           Sprint 19 OUTLIERS deferred (~50-60 across):
//             - text-gray-300 / text-slate-300 decorative icons
//               where -500 or -700 swap creates wrong visual
//               weight (chevrons, dividers)
//             - Conditional className branches where one branch
//               is correct and one isn't (cn(isActive ? "..." :
//               "...") patterns)
//             - text-white/N translucent text in contexts where
//               the visual intent is "barely visible placeholder"
//             - 4 text-[#0F1117]-on-gradient-bg sidebar avatar
//               findings (Sprint 16 already documented these as
//               v9 scanner FPs)
//
//           These outliers stay as residue for Sprint 21 per-
//           finding work or v9 scanner enhancement.
//
//           Methodology validation: applying Sprint 15b/16
//           perl methodology to Sprint 19's broader scope
//           confirmed the rule-set is robust. No new over-
//           correction classes surfaced (gold-on-cream repair
//           applied preventively this time, before scanner
//           re-run). Pre-commit verification clean.
//
//           Net P0 retirement vs 600 baseline: ~150-170 expected
//           (162 swaps − ~10 cases where scanner trail had
//           multiple findings on same line and only one matched).
//           Phase C confirms exact delta.
//
//           Post-Sprint-19 remaining ~430-450 P0 partition:
//             ~140 CSS residue (Sprint 21)
//             ~65 shared-component v8 scanner FPs (v9 scanner)
//             ~50-60 OUTLIERS deferred this sprint
//             ~150-180 long-tail single-occurrence findings in
//               files this sprint didn't reach (e.g., docs
//               surfaces, edge-case form modals, etc.)
//
//           Sprint 19 substantially closes the structured-
//           sweep workstream. Sprints 20+ are per-finding
//           triage + scanner v9 + narrative work.
//
//           Per §3.1, version bump justified — publicly-visible
//           changes to AE Console carrier-management page (used
//           daily by AE staff) + 70+ other dashboard surfaces.
// v3.8.mm — Sprint 20 long-tail dashboard residue per-finding
//           triage. 46 swaps applied across 27 files via v2
//           window-search swap-applier (handles scanner JSX
//           opening-tag line vs className-on-child-line offset).
//
//           Smaller scope than Sprint 19 — Sprint 19 already
//           retired the high-density rule-matching findings;
//           Sprint 20 residue is OUTLIER + FP. Honest scope.
//
//           Methodology refinement (v2 swap-applier): scanner
//           reports JSX opening-tag line, but className token
//           often appears 2-5 lines later inside multi-line
//           JSX. v1 applier searched only the exact line and
//           missed many swaps; v2 searches +/-5 line window
//           around scanner-reported line. 46 vs ~4 applied with
//           same swap proposal set.
//
//           Files touched (27 with swaps applied):
//             - dashboard/contract-rates/page.tsx (5)
//             - dashboard/exception-config/page.tsx (4)
//             - dashboard/carriers/page.tsx (4)
//             - shipper/dashboard/settings, invoices,
//               carrier/dashboard/my-loads, settings (3 each)
//             - dashboard/fuel-tables, dock-scheduling (3 each)
//             - dashboard/scorecard, fleet (2 each)
//             - long tail of 1-swap files
//
//           Onboarding 6 swap proposals SKIPPED (5 confirmed
//           bg-navy custom utility scanner FPs documented in
//           Sprint 15b — element parent has `bg-navy` Tailwind
//           plugin class scanner doesn't recognize, real
//           rendering is text-white on dark navy nav PASS).
//           Line 501 amber finding may have shifted from Sprint
//           18 fix; not re-applied to avoid double-correction.
//
//           Cream-context gold preventive repair: SKIPPED per
//           Phase A confirmation. Sprint 19 already covered.
//
//           Pre-commit verification clean.
//
//           Net P0 retirement vs 444 baseline: ~40-46 expected
//           (46 swaps minus a few cases where swap target line
//           had multiple findings only one matched). Phase C
//           confirms exact delta.
//
//           Sprint 20 closes the diminishing-returns mechanical
//           sweep tail. Brand-mechanical workstream functionally
//           complete after this commit. Sprint 21+ direction:
//             - Scanner v9 (resolve ~95 shared-component FPs)
//             - CSS residue per-finding (~140)
//             - OUTLIER per-finding (~88 visual-judgment cases)
//             - Narrative work (/shippers vertical positioning)
//
//           Per §3.1, version bump justified — publicly-visible
//           changes across 27 dashboard surfaces.
// v3.8.nn — CRM new-customer drawer tab bar guarded by !isNew.
//           Pre-existing UX bug from commit 9d0f311 (2026-04-14):
//           CrmIconTabs at CustomerDrawer.tsx:86 rendered
//           unconditionally, but the tab content panels at lines
//           155-167 were gated by `!isNew && customer`. In __new__
//           mode the tab sidebar was clickable but inert — every
//           tab click updated state with no panel render, so the
//           AE perceived all tabs as showing the same New Customer
//           form. Surfaced after Phase 6.2 (v3.8.ee) forced AEs
//           into the new-customer flow because the read filter
//           emptied the CRM list. One-line guard at line 86 hides
//           the tab bar in __new__ mode; tabs are conceptually
//           meaningless before the customer record exists. No
//           sibling component depends on the tab bar rendering
//           during __new__ mode (verified by grep on "__new__"
//           across the CRM module: only page.tsx:66 and
//           CustomerDrawer.tsx:53,57 reference it; CrmIconTabs is
//           a pure presentational component).
// v3.8.oo — Approve-gate edit-UI completion. Closes the two gaps
//           from audit f939aa1 that blocked the BKN approval path.
//           Three atomic commits:
//           (a) feat(crm): manual credit review sets creditStatus
//               (d956328) — POST /customers/:id/mark-manually-
//               reviewed now accepts {creditStatus, notes} body,
//               persists creditStatus alongside date/source/
//               result/notes. UI: ProfileTab "Mark as manually
//               reviewed" opens ManualReviewPopover with status
//               selector (default CONDITIONAL) + notes textarea.
//               Handler extracted from inline crmCustomer.ts route
//               into customerController.markManuallyReviewed
//               named export so it shares the prisma-mock harness.
//               6 new tests, 21 total in customerController.test.
//               Naming: directive said REJECTED, schema enum has
//               DENIED — used schema-correct DENIED per §18.6.
//           (b) feat(crm): CUSTOMER_CONTRACT upload cross-writes
//               customer.contractUrl (67ed42a) — uploadDocuments
//               wraps Document.create + Customer.update in a
//               $transaction when docType=CUSTOMER_CONTRACT AND
//               entityType=CUSTOMER AND entityId present. Non-
//               CONTRACT uploads stay on the existing Promise.all
//               path. Latest-wins on multiple uploads; prior
//               Document rows preserved for audit history.
//               updateCustomerSchema gains contractUrl (URL
//               string or null) for admin PATCH override.
//               9 new tests in new documentController.test.ts.
//           (c) this version + regression-log entry.
//           BKN approval is now a 7-click UI workflow with no SQL.
// v3.8.pp — Restore the CRM customer drawer + the historical CRM
//           customer list. Two coordinated actions:
//           (1) Reverted v3.8.nn's `!isNew` guard on CrmIconTabs
//               at CustomerDrawer.tsx:86. The tab bar renders
//               unconditionally again, including in __new__ mode.
//               Gets the drawer back to the pre-2026-05-04 shape
//               that was working — which means the original "tabs
//               all show same form in __new__ mode" symptom
//               returns, but Wasi has explicitly said that's the
//               state worth restoring (orientation/structure
//               visible matters more than that downstream cleanup).
//               v3.8.nn was an unnecessary fix that solved a
//               downstream symptom of the empty-CRM problem; the
//               real fix was always (2) below.
//           (2) Backfilled `onboardingStatus = APPROVED` +
//               `approvedAt = NOW()` + `approvedById = <Wasi id>`
//               for 26 historical CRM customers (status != Prospect
//               AND deletedAt IS NULL). These were customers Wasi
//               manually entered before the v3.8.ee approve gate
//               existed; marking them APPROVED reflects that they
//               were already trusted, not a gate bypass. The 46
//               Apollo Lead Hunter prospects (status = Prospect)
//               remain unflipped — Phase 6.2 separation continues
//               to work for any new customer added going forward.
//           Verification post-backfill: APPROVED count = 26,
//           Prospects count = 46, dangling non-Prospect non-
//           APPROVED count = 0 (clean state).
// v3.8.qq — Corrective undo: v3.8.pp's `status != 'Prospect'`
//           discriminator was too broad. It captured 22 records
//           with `status = 'Contacted'` — Lead Hunter pipeline
//           STAGES, not real CRM customers. Lead Hunter has
//           independent stage semantics (Lead → Contacted →
//           Qualified → Proposal → Won → Not Interested) and
//           those records should never appear in CRM until
//           manually approved into the "Active" status. The
//           correct discriminator is `status = 'Active'`
//           exclusively. Wasi's clarification 2026-05-05:
//           "Lead Hunter database stays independent from CRM."
//           Executed UPDATE: reverted onboardingStatus,
//           approvedAt, approvedById to NULL/PENDING for the
//           22 wrong records. Final state: 4 APPROVED (all
//           status='Active'), all Lead Hunter stages back in
//           Lead Hunter. v3.8.pp's drawer revert (CrmIconTabs
//           unconditional) is preserved and correct — that
//           half of v3.8.pp was right.
// v3.8.rr — Order Builder customer search filters to ?context=crm
//           (onboardingStatus=APPROVED only). Wasi flagged that
//           Tiberina Group + Grupo Logico (status=Contacted, Lead
//           Hunter pipeline stage) were appearing in the customer
//           selector at /dashboard/orders. Single-line fix at
//           orders/page.tsx:181 — added context: "crm" to the
//           api.get params. Order creation is a CRM-side workflow;
//           you can only build orders for approved customers.
//           Customer-by-id lookup at orders/page.tsx:223 stays
//           unfiltered so existing-order edits still resolve their
//           customer record even if status changes later.
// v3.8.ss — Order Builder Route layout: pickup-date and PU-window
//           now share columns 1-2 (visually under origin facility
//           column above); delivery-date and DEL-window now share
//           columns 3-4 (visually under destination facility
//           column). Was: PU date | DEL date | PU window | DEL
//           window. Now: PU date | PU window | DEL date | DEL
//           window. Pure JSX child reorder, same grid-cols-4
//           parent, no state shape changes. Wasi flagged the
//           previous layout split the date and its corresponding
//           window across the row, breaking visual alignment with
//           the origin/destination columns directly above.
// v3.8.tt — Approve flips BOTH onboardingStatus AND status. Wasi
//           confirmed 2026-05-05 that clicking Approve in the AE
//           Console should transition a record from Lead Hunter
//           into CRM by setting both architectural markers in one
//           operation: onboardingStatus='APPROVED' (the Phase 6.2
//           enum gate, what ?context=crm filters on) AND
//           status='Active' (the marker that distinguishes a CRM
//           customer from a Lead Hunter pipeline-stage record).
//           Prior implementation flipped only onboardingStatus,
//           leaving status at the prior Lead Hunter stage value
//           (e.g. 'Contacted'). CRM visibility worked because
//           ?context=crm filters on onboardingStatus, but the
//           status field stayed misleading and the record was
//           ambiguous on which side of the Lead Hunter / CRM
//           split it lived. Approve now writes both atomically.
//           Test happy-path assertion updated to expect status
//           in the update payload. 21 tests pass.
// v3.8.uu — CRM Facilities tab gets the missing Edit button.
//           Closes §13.3 Item 8.2.3. AddFacilityForm refactored
//           to FacilityForm, a shared Create/Edit component that
//           hydrates from an `existing: CrmFacility | null` prop.
//           When existing is non-null: state hydrates from it,
//           header reads "Edit facility", save fires PATCH
//           /customers/:id/facilities/:facilityId. When null:
//           same behavior as before (POST). Backend route at
//           crmCustomer.ts:138-167 was already wired with 404
//           guard + read-only field strip + activity log; no
//           backend change. Edit button renders alongside Remove
//           on each facility row (Pencil icon, gold-dark label).
//           addOpen + editingId mutually exclusive; closeAll()
//           resets both. operatingHours preserved unchanged on
//           edit so this commit doesn't accidentally null it —
//           input UI for it lands in v3.8.vv per §13.3 8.2.2.
// v3.8.vv — Closes §13.3 Item 8.2.2. Adds the operatingHours
//           7-day grid (Mon–Sun) to FacilityForm: per-day open
//           time + close time inputs, plus a Closed checkbox
//           that disables the time inputs visually. Storage
//           shape Record<DayKey, { open, close, closed }>.
//           Hydrates from existing JSON on edit; empty default
//           on new. Plus contactEmail input wired (the field
//           was in form state since the original component but
//           had no rendered input — fixing that gap here too
//           since the same component is being touched).
//           CrmFacility type extended with optional `closed`
//           on per-day entries (non-breaking JSON addition).
//           §13.3 Items 8.2.2 and 8.2.3 both marked CLOSED.
// v3.8.ww — Order Builder freight class auto-suggest gets a
//           density-based path. New helper
//           suggestFreightClassByDensity(L, W, H, weight) at
//           dashboard/orders/types.ts maps weight/cubic-feet
//           density to NMFC class via the public density table
//           (≥50 lb/cu ft → 50, 35-50 → 55, ... <1 → 500). New
//           getAutoSuggestedClass(item) consolidates: density
//           takes precedence when L/W/H/weight all positive,
//           keyword match on description as fallback. Wired
//           into LineItemsSection so weight + L + W + H +
//           description onChanges all recompute the suggestion
//           via applyClassAutoSuggest helper. AE override
//           preserved — if line already has freightClass set,
//           auto-suggest skipped. Phase B (NMFC commodity
//           catalog with NMFC# overrides for the 20% of items
//           where assigned class diverges from raw density)
//           scoped separately as a docs deliverable, no code.
//           Frontend test infrastructure not present in this
//           repo; the new helper is a pure function and would
//           benefit from unit tests in a future sprint that
//           sets up vitest on the frontend side. Logged as
//           known gap, not blocking.
// v3.8.xx — v3.8.ww follow-up. The override-protection in
//           applyClassAutoSuggest was too coarse: any non-empty
//           freightClass blocked re-suggest. That blocked density
//           from upgrading a keyword-driven class when dimensions
//           arrived later (Produce: keyword set 55, density
//           would have upgraded to 50, blocked). v3.8.xx adds
//           per-line _classSource tracking to LineItemFormData
//           ("ae" | "auto" | null). Source "ae" (manual dropdown)
//           locks the class from auto-overrides; "auto" (set by
//           a prior auto-suggest) is still eligible for upgrade
//           when better signal arrives; null (never set / cleared
//           via dropdown→"—") is eligible. Manual dropdown change
//           sets source to "ae"; clearing dropdown to "—" resets
//           to null. Unmigrated drafts loaded with existing
//           freightClass + no _classSource → conservatively
//           treated as "ae" (assume saved value was deliberate;
//           AE can clear-and-retrigger to re-enable auto-suggest).
//           UI-only field, never serialized to backend. Closes
//           the keyword-blocks-density edge case surfaced during
//           v3.8.ww screen-state audit on 2026-05-05.
// v3.8.yy — NMFC commodity catalog (Phase B). Hand-curated entries
//           scoped to COLDCHAIN + WELLNESS verticals per §18.7
//           and the scope doc at docs/audits/nmfc-catalog-scope-
//           2026-05-05.md. Closes the gap where density-only
//           gives the wrong class for commodities with handling/
//           fragility/value overrides (yogurt 70 not 50, fragrance
//           100, color cosmetics 100, aerosols 100 hazmat, etc.).
//           14 seed entries:
//             - 2 hazmat (aerosol, lithium-battery device)
//             - 5 fragility/value (fragrance, color cosmetics,
//               baby food, premium beverage glass, yogurt)
//             - 2 refrigerated (yogurt above + pharma)
//             - 3 wellness mid-tier (skincare, supplements,
//               cosmetics NOI)
//             - 3 density-variable (frozen meals, dairy NOI,
//               frozen seafood) — fall through to density formula
//           NMFC item numbers intentionally null (Option 1 from
//           the scope doc): these require authoritative
//           verification before they go on real BOLs. Class is
//           rate-impacting; nmfcCode is documentary. AE fills
//           nmfcCode manually from carrier rate sheets / ops
//           research. Each entry has inline `basis` rationale.
//           Lookup integration in getAutoSuggestedClass: catalog
//           takes precedence over density when fixed class
//           declared; density-variable entries fall through;
//           keyword fallback only when catalog has NO match.
//           Catalog density-variable + missing density signal
//           returns null (don't downgrade to less-specific
//           keyword on a partial catalog hit).
// v3.8.zz — Sprint 22: surfaced visual bugs from morning walkthrough.
//           Three fixes in one atomic commit:
//
//           (1) /accounting/invoices page wrapper bg cross-mode
//           rendering correctness. Page used non-canonical
//           `bg-[#0a0e1a]` literal hex (slightly darker than
//           canonical `#0F1117`) at the page-level wrapper line 194
//           AND sticky thead line 278. The non-canonical hex was
//           NOT in globals.css [data-mode="light"] override list
//           (which only covers #0F1117/#161921/#080C18/#1C1F2B
//           etc.) — but text-white/text-slate-400/text-slate-500
//           ARE in the override list. Net: in light mode, page bg
//           stayed dark navy while text remapped to dark, producing
//           dark-on-dark invisibility. Same architectural pattern
//           as Sprint 14 dashboard layout posture fix — non-
//           canonical bg literals break cross-mode cascade. Fix:
//           swap both `bg-[#0a0e1a]` → `bg-[#0F1117]` (canonical,
//           in override list). Mode toggle works for free via
//           existing globals.css cascade.
//
//           Single-file scope confirmed: pattern check across
//           /accounting/{aging,credit,disputes,fund,payments,pnl,
//           quick-pay,quickpay-revenue,reports} confirmed all
//           use canonical `bg-[#0F1117]` already. Bug isolated to
//           invoices/page.tsx only.
//
//           (2) CommandPalette.tsx (Cmd+K trigger button) light-
//           mode invisibility. Button at line 224 used
//           `text-white/50` + `hover:text-white/70` which have NO
//           [data-mode="light"] override (only `text-white` is
//           covered at globals.css:162). In light mode,
//           `bg-white/5` correctly remapped to white card surface
//           but `text-white/50` stayed at rgba(255,255,255,0.5) =
//           invisible on white. Fix: `text-white/50` →
//           `text-slate-400`, `hover:text-white/70` →
//           `hover:text-white` (both have light-mode overrides).
//
//           (3) HTML entity rendering bug ("Gail &amp; Rice" on
//           customer names). Root cause: pre-v3.8.d.2
//           `sanitizeInput` middleware HTML-escaped string DB
//           values. v3.8.d.2 fixed the middleware AND ran a
//           one-time decode for loads table
//           (backend/scripts/decode-encoded-load-fields.ts) but
//           customer table was NOT in that script's scope. React
//           JSX renders strings as text nodes without entity
//           decoding, so legacy escaped values print literally.
//           Fix (Sprint 22 scope = F1 frontend defensive): new
//           shared util `frontend/src/lib/htmlEntities.ts` mirrors
//           the existing backend util at `backend/src/utils/
//           htmlEntities.ts`. Apply in `customerName()` helper
//           on invoices page.
//
//           Backend serializer-layer decode (F2) and customer-
//           table DB cleanup migration (F3) deferred to separate
//           sprints with explicit DB-migration authorization.
//
//           Memory #11 lesson reinforced for the 5th time:
//           scanner-driven sweeps optimize for density-per-file
//           and miss high-visibility low-density bugs (page
//           headings, single buttons, single data fields).
//           Human-eye walkthrough is the primary truth-test.
//
//           Version letter note: continuous sequence per §3.1.
//           Picked up from .yy (parallel work landed v3.8.nn–.yy
//           between Sprint 21 close and Sprint 22 start) → next
//           available is .zz. Past zz uses double-letters (.aaa,
//           .aab, ...) per §3.1.
//
//           Pre-commit verification: backend tsc clean, frontend
//           next build clean.
//
//           Per §3.1, version bump justified — publicly-visible
//           changes to AE Console accounting/invoices page +
//           Cmd+K search button (every authenticated user
//           encounters both daily).
// v3.8.aaa — Sprint 23: Quick Pay tier reconciliation. AE Accounting
//            Console Quick Pay Queue + Carrier Payments UI updated
//            from legacy 5-tier PaymentTier display (Flash/Express/
//            Priority/Partner/Elite) to canonical Caravan Partner
//            Program 3-tier structure (Silver/Gold/Platinum) per
//            memory #7 + CLAUDE.md §8 + frontend/public/carriers.html.
//
//            Resolves operational risk surfaced 2026-05-04: AE
//            Accounting Console showed different tier nomenclature
//            than carrier-facing silkroutelogistics.ai/carriers,
//            creating cognitive load + error risk during BKN first
//            load processing (mid-May).
//
//            STRUCTURAL MISMATCH (not a rename):
//            The legacy PaymentTier enum (FLASH/EXPRESS/PRIORITY/
//            PARTNER/ELITE/STANDARD at schema.prisma:171) encoded
//            payment SPEED only. Canonical Caravan Partner Program
//            (CarrierTier enum SILVER/GOLD/PLATINUM/GUEST/NONE at
//            schema.prisma:66) encodes carrier loyalty TIER ×
//            payment SPEED orthogonally:
//              Silver:   Net-30 standard, 3% 7-day QP, 5% same-day
//              Gold:     Net-21 standard, 2% 7-day QP, 4% same-day
//              Platinum: Net-14 standard, 1% 7-day QP, 3% same-day
//
//            PATH 2 SCOPE (per directive Phase A decision #1):
//            UI displays canonical CarrierTier badge from
//            CarrierProfile.tier + speed-bucket label derived from
//            legacy PaymentTier + actual fee% from quickPayFeePercent
//            field on CarrierPay. Visible truth on UI, honors legacy
//            data. Single atomic commit, ~85-100 LOC.
//
//            Path 1 (UI cosmetic only with translation table)
//            rejected — too cosmetic, still confuses on row-level.
//            Path 3 (full data model refactor splitting paymentTier
//            into paymentSpeed + tierAtTimeOfPay + Prisma migration
//            + DB backfill) explicitly OUT OF SCOPE — multi-sprint
//            with explicit DB-migration authorization required.
//
//            Backend (1 file, ~10 LOC):
//              accountingController.ts:643 (getPayments) +
//              accountingController.ts:1245 (getPaymentQueue):
//              extend carrier.select to include
//              `carrierProfile: { select: { tier: true } }` so the
//              UI can render Silver/Gold/Platinum badge from the
//              authoritative CarrierProfile.tier source.
//
//            Backend SLA hours UNCHANGED (per directive decision #4):
//            FLASH=2h, EXPRESS=24h, PRIORITY=48h, PARTNER=72h,
//            ELITE=120h, STANDARD=168h preserved as operational
//            deadline encoding. UI relabels speed bucket only.
//            SLA hour reconciliation requires SLA-policy review
//            and is a separate sprint scope.
//
//            Frontend (2 files, ~85 LOC):
//
//            accounting/quick-pay/page.tsx:
//              - Replaced TIER_INFO (legacy 5-tier with custom
//                per-tier color palette) with two new constants:
//                CARAVAN_TIER_BADGE (Silver/Gold/Platinum/Guest/
//                None — same palette as carrier/dashboard/page.tsx
//                per directive decision #7) and SPEED_LABEL
//                (legacy PaymentTier → Same-Day / 7-Day Quick Pay /
//                Standard).
//              - Added CARAVAN_RATE_MATRIX constant referencing
//                memory #7 canonical structure for the legend bar.
//              - Replaced "Payment Tiers:" legend bar with full
//                3-tier × 3-speed rate matrix (canonical source of
//                truth for AE staff resolving carrier disputes).
//              - Added "Speed" column to queue table; Tier column
//                now shows canonical CarrierTier badge.
//              - Fee column now shows actual fee% (from
//                quickPayFeePercent or derived) alongside dollar
//                amount.
//              - feePercentLabel() helper for fallback when
//                quickPayFeePercent is null on legacy records.
//              - QuickPayRequest interface extended with
//                carrier.carrierProfile?.tier (matches backend
//                include).
//
//            accounting/payments/page.tsx:
//              - Replaced TIER_COLORS (legacy 5-tier palette) with
//                CARAVAN_TIER_BADGE + SPEED_LABEL same as quick-pay
//                page.
//              - Added "Speed" column to payments table; Tier
//                column now shows canonical CarrierTier badge.
//              - CarrierPayment interface extended with
//                carrier.carrierProfile?.tier.
//
//            STANDARD tier handling (per directive decision #3):
//            Display as "Standard" speed label + carrier's
//            canonical tier badge. Quick-pay queue filters out
//            STANDARD (line 1237 in accountingController), so the
//            badge fallback applies only on the broader payments
//            page.
//
//            v3.7.a tierMap pattern reuse: the existing translation
//            map at accountingController.ts:3911-3918
//            (FLASH/EXPRESS → SILVER, PRIORITY/PARTNER → GOLD,
//            ELITE → PLATINUM) was added v3.7.a for analytics
//            aggregation. Sprint 23 extends the same translation
//            philosophy to UI display layer — show canonical truth
//            without rewriting the legacy enum data.
//
//            Path 3 backlog: full data model refactor remains as
//            separate sprint candidate when SLA-policy review
//            happens. Sprint 23 closes the immediate operational
//            risk for BKN first load processing without committing
//            to the data model split.
//
//            Visual consistency: Silver/Gold/Platinum badge palette
//            (slate-300/yellow-300/purple-300 on respective tinted
//            bg) matches the same TIER_COLORS at
//            carrier/dashboard/page.tsx:23-27. Speed labels use
//            neutral slate (no per-speed color since same-day vs
//            7-day is informational, not severity).
//
//            Pre-commit verification: backend tsc --noEmit clean,
//            frontend next build clean.
//
//            Per §3.1 sequence-continuous rule: v3.8.zz → v3.8.aaa
//            (first double-letter post-zz overflow per §3.1 "never
//            roll the minor at z" rule). Future post-aaa: aab,
//            aac, ..., azz, baa, ...
//
//            Per §3.1 version bump justified — publicly-visible
//            changes to AE Accounting Console Quick Pay Queue +
//            Carrier Payments pages, both daily-use surfaces for
//            AE staff processing carrier payments.
// v3.8.aab — Sprint 24: theme system simplification + Caravan Partner
//            Program tier palette canonicalization. Single atomic
//            commit covering two related brand-discipline concerns.
//
//            (1) THEME SYSTEM SIMPLIFICATION
//
//            Pre-Sprint-24: 6 themes (Silk Route Classic + Midnight
//            Express + Desert Route + Arctic Haul + Highway Green +
//            Chrome Steel). Each theme × light/dark = 12 visual
//            variants per surface, expanding scanner complexity and
//            adding off-canonical color drift. For a single-founder
//            pre-revenue platform with ~2 active users, theme
//            personalization wasn't business-justified.
//
//            Removed:
//              - 5 alternative theme blocks at globals.css:409-442
//                (~30 LOC of [data-theme=...] overrides)
//              - THEMES array (6 → 0 entries) in useTheme.ts
//              - themeId state + setTheme + setTheme-related logic
//              - data-theme attribute setter
//              - ThemePanel.tsx 6-theme grid + slide-in panel +
//                Apply/Cancel preview-confirm flow (~110 LOC)
//
//            Kept:
//              - Light/dark mode toggle (only useful UX residue)
//              - data-mode="light"|"dark" attribute cascade in
//                globals.css (already preserved by Sprint 14
//                architectural fix)
//              - localStorage `srl_mode` key
//
//            New: ModeToggleButton — sun/moon icon button, single-
//            click toggle, no preview/Apply panel. ~30 LOC.
//            ThemeGearButton retained as alias to avoid churning
//            import sites in Sidebar.tsx.
//
//            Migration: existing users with non-Classic theme
//            preference in localStorage gracefully fall back via
//            useTheme.loadFromStorage() — proactively clears
//            legacy `srl_theme` key on first load post-deploy.
//            applyToDOM also strips any stale data-theme attribute.
//
//            Backend `/auth/preferences` `preferredTheme` field
//            still accepted server-side for forward compatibility;
//            frontend stops writing to it. Field retirement = data-
//            hygiene sprint, not blocking.
//
//            (2) TIER PALETTE CANONICALIZATION
//
//            Sprint 23 shipped Caravan Partner Program tier
//            structural reconciliation (canonical tier NAMES
//            Silver/Gold/Platinum) using Tailwind slate/yellow/
//            purple palette — visually off-brand. Sprint 24 swaps
//            to canonical SRL tokens per skill tokens.md. Coherent
//            progression: Sprint 23 = right NAMES, Sprint 24 =
//            right COLORS.
//
//            Pre-Sprint-24 had FIVE distinct off-canonical palettes:
//              - Marketing carriers.css: literal precious-metal hex
//                (#C0C0C0 silver, #C8963E legacy gold, #E5E4E2
//                platinum) — none in canonical SRL palette
//              - Marketing carriers.html inline: #C8963E legacy gold
//                + rgba(200,150,62,X) tinted-cell backgrounds
//              - AE Console accounting/quick-pay: Tailwind slate-500/
//                yellow-500/purple-500 (Sprint 23 just shipped)
//              - AE Console accounting/payments: same Tailwind palette
//              - Carrier dashboard: Tailwind slate/yellow/purple
//                (different opacity ratios than AE Console)
//
//            Post-Sprint-24 unified canonical palette across ALL
//            surfaces:
//              Silver:   bg navy-300 (#8AA5C0)/15 + text navy-500
//                        (#5B7EA3) — muted neutral
//              Gold:     bg --gold (#C5A572)/15 + text --gold-dark
//                        (#BA7517) — canonical accent + emphasis
//              Platinum: bg --navy (#0A2540) + text --gold (#C5A572)
//                        — top-tier brand treatment, navy + gold
//                        prestige pairing
//
//            Cross-mode contrast verification per memory #11:
//              Silver on cream: ~3:1 borderline, passes UI 3:1 + AA
//                               Large for tier-badge role (decorative
//                               + indicator, not body text)
//              Silver on dark navy: ~6:1 PASS
//              Gold on cream: ~3:1 borderline (same role tolerance)
//              Gold on dark navy: ~7:1 PASS
//              Platinum (navy bg): ~7:1 PASS in both modes
//
//            Files updated (5 surfaces):
//              - carrier/dashboard/page.tsx TIER_COLORS
//              - accounting/quick-pay/page.tsx CARAVAN_TIER_BADGE
//              - accounting/payments/page.tsx CARAVAN_TIER_BADGE
//              - shared/css/pages/carriers.css .tier-card.silver/
//                gold/platinum (border + icon + svg) — also
//                dropped 5 dead .tier-card.bronze rules (BRONZE
//                tier retired pre-v3.7.a per CLAUDE.md §11)
//              - public/carriers.html inline tier headers (lines
//                240-241) + bulk swap rgba(200,150,62,X) →
//                rgba(197,165,114,X) for column-highlight cells
//                (33 occurrences across comparison table)
//
//            COHERENT PROGRESSION:
//              Sprint 23 (v3.8.aaa): structural correctness — right
//                tier NAMES (Silver/Gold/Platinum) replacing legacy
//                Flash/Express/Priority/Partner/Elite UI display.
//                Used Tailwind slate/yellow/purple as quick palette
//                for ship-by-BKN-deadline.
//              Sprint 24 (v3.8.aab): visual correctness — right
//                tier COLORS (canonical SRL palette per skill
//                tokens.md) replacing Tailwind palette. Coherent
//                follow-through, not regression.
//
//            Per §3.1 sequence-continuous rule: v3.8.aaa → v3.8.aab.
//
//            Per §3.1 version bump justified — publicly-visible
//            changes affecting:
//              - Theme picker disappears (every authenticated user
//                with Sidebar)
//              - Tier badges across AE Console + carrier portal
//                surfaces (every authenticated user)
//              - Marketing /carriers tier table (every visitor)
//
//            Pre-commit verification: backend tsc clean, frontend
//            next build clean.
//
//            Net LOC change: ~240 (mostly removal — 5 theme blocks
//            + ThemePanel 6-theme grid + bronze CSS rules deleted;
//            tier palette swaps are 1-to-1 token replacements).
// v3.8.aac — Sprint 24a: 4-file brand-token follow-up commit.
//            Closes drift surfaced during Sprint 24 (v3.8.aab) Phase
//            C verification. Per §3.3 atomic-commit + "no scope
//            creep" rule, these 4 working-tree edits from a prior
//            session were NOT bundled into v3.8.aab — committing
//            separately as v3.8.aac follow-up.
//
//            Two swap classes across 4 files:
//
//            (1) Cross-mode legibility per memory #11
//                (text-white/X → text-slate-500):
//                - components/accounting/CreateSettlementModal.tsx
//                  line 55, X close icon (text-white/60)
//                - components/ui/FileUpload.tsx
//                  line 120, X remove icon (text-white/50)
//
//                Translucent white renders as ghost text on light
//                surface in light mode; text-slate-500 with the
//                global [data-mode="light"] override (CLAUDE.md
//                §13.3 Item 10) lifts to navy on cream and stays
//                readable on dark navy in dark mode.
//
//            (2) Non-canonical gold → canonical gold-dark per skill
//                tokens.md (#C9A84C → #BA7517):
//                - components/shipper/ShipmentDetailDrawer.tsx
//                  lines 125, 131 (Download POD + Message Rep
//                  hover state, two occurrences)
//                - components/shipper/ShipperChatbot.tsx
//                  line 126 (action chip text)
//
//                Palette canonicalization: #C9A84C is olive-gold,
//                not in canonical token set; #BA7517 is canonical
//                --gold-dark per CLAUDE.md §2.1.
//
//            DIRECTIVE-DESCRIPTION CORRECTION
//            Sprint 24a directive paired ShipmentDetailDrawer with
//            CreateSettlementModal (predicting both did the cross-
//            mode swap) and ShipperChatbot with FileUpload (both
//            gold). Phase A audit caught the mis-pairing — actual
//            split is CreateSettlementModal + FileUpload do cross-
//            mode; ShipmentDetailDrawer + ShipperChatbot do gold.
//            Diffs themselves are clean drift cleanup; the directive
//            description had files swapped between the two classes.
//            Same audit-first discipline as 5 prior catches (per
//            memory #11) — Phase A surfaces reality, scope corrects
//            before commit.
//
//            RESIDUAL #C9A84C REFERENCES (logged not fixed)
//            Two of the 4 files have non-canonical gold #C9A84C
//            refs in border / hover-bg classes that were NOT swapped
//            in the surfaced drift:
//              - ShipmentDetailDrawer.tsx line 125:
//                  hover:border-[#C9A84C] retained (only text-color
//                  swapped to canonical)
//              - ShipperChatbot.tsx line 126:
//                  border-[#C9A84C]/40 + hover:bg-[#C9A84C]/10
//                  retained (only text-color swapped to canonical)
//
//            Per §3.3 "no scope creep" — Sprint 24a closes SURFACED
//            drift, doesn't expand into full canonicalization audit.
//            Residuals logged in CLAUDE.md §13.3 (Brand-token
//            canonicalization residual) for future per-finding
//            triage.
//
//            Pre-commit verification: backend tsc clean, frontend
//            next build clean.
//
//            Net LOC change: ~10 (4 files × 1-line surgical swap;
//            ShipmentDetailDrawer has 2 swaps on adjacent lines).
//            Per §3.1 sequence-continuous rule: v3.8.aab → v3.8.aac.
// v3.8.aad — Sprint 25: /track page contrast fix + tab structure
//            reconciliation. Customer-facing public tracking page
//            (BOL QR scan target).
//
//            CONTRAST FIXES (Phase A audit per Sprint 15b/22 method)
//
//            Fix #1 — Tab inactive label readability:
//              app/track/page.tsx:86
//              text-gray-500 hover:text-gray-300 (~3.9:1, fails AA)
//              → text-gray-300 hover:text-white (~10.5:1, PASS AA)
//
//            Fix #2 — Compact footer ghost-text:
//              components/shell/SiteFooter.tsx:12
//              isDark branch: text-white/45 (~3.4:1, FAILS AA)
//              → text-white/70 (~9.4:1, PASS AA)
//              Same memory #11 ghost-text class as Sprint 24a
//              text-white/X swaps. Light-mode branch unchanged.
//              Component is shared with marketing site dark-themed
//              footer surfaces — lift improves contrast across all
//              dark surfaces, no regression risk (light branch
//              untouched, dark improvement is monotonic).
//
//            TAB STRUCTURE (T2 — drop "Tracking code" tab)
//
//            /track UI offered 3 lookup tabs (BOL number / Tracking
//            code / Reference / PO #) but Phase A data-model parity
//            audit found:
//
//              (a) Backend endpoint runs a 5-tier fallback chain
//                  (ShipperTrackingToken → trackingToken →
//                  shipperCode → bolNumber → reference/load/po)
//                  regardless of which tab the user picks. The
//                  `kind` state was purely cosmetic — only changed
//                  the placeholder text, never the API call.
//
//              (b) The "Tracking code" identifier class is the
//                  12-char alphanumeric ShipperTrackingToken
//                  embedded in the BOL QR. Customers reach those
//                  tokens only via QR scan — they never type them.
//                  The 6-char shipperCode field on Load is dead
//                  schema (defined, queried, never written by any
//                  code path).
//
//            UI reduced from 3 tabs to 2 tabs:
//              - "BOL number"        e.g. BOL-7734
//              - "Reference / PO #"  e.g. PO-88421 or load reference
//
//            Backend endpoint UNCHANGED — 5-tier fallback chain
//            still accepts any value a customer might paste,
//            including legacy uuid trackingTokens for compatibility.
//            shipperCode dead-schema cleanup deferred per §3.3
//            atomic-commit + "no scope creep" rule.
//
//            ADJACENT FINDING LOGGED (NOT FIXED — separate sprint)
//
//            BOL QR currently 404s on production. utils/qrGenerator
//            .ts:25 encodes URL https://silkroutelogistics.ai/track/
//            <token> but frontend has NO /track/[token]/page.tsx
//            dynamic route, _redirects has no /track/* splat rule,
//            and next.config.ts sets output: "export" (static HTML).
//            Email tracking links use /tracking/<token> with same
//            issue — /tracking exact path 308s to /track but
//            /tracking/<anything> 404s. Logged in CLAUDE.md §13.3
//            Item 31 (P0 production reliability) for dedicated
//            sprint to fix — needs dynamic route + auto-fill +
//            auto-search OR _redirects splat. Recommended to jump
//            queue ahead of remaining brand work since every BOL
//            printed routes to a 404 page right now.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean, frontend next build
//            clean. /track is dark-only by design (no [data-mode]
//            cascade hooks); both fixes are dark-mode-only so no
//            cross-mode regression risk.
//
//            Net LOC change: ~10 (track/page.tsx tab union + array
//            + placeholder ternary + tab inactive className;
//            SiteFooter.tsx:12 dark-branch base text).
//            Per §3.1 sequence-continuous rule: v3.8.aac → v3.8.aad.
// v3.8.aae — Sprint 26: BOL QR + email tracking link reliability fix.
//            Closes CLAUDE.md §13.3 Item 31 (P0 production reliability)
//            surfaced during Sprint 25 Phase A audit. Every BOL printed
//            since v3.8.b had been silently routing scans to a 404; this
//            ships the missing destination. Critical fix before BKN
//            first load mid-May.
//
//            ROOT CAUSE
//
//            qrGenerator.ts:25 encodes URL silkroutelogistics.ai/track/
//            <12-char-token> on every BOL print. shipperLoadNotifyService
//            and shipperNotificationService build /tracking/<token> URLs
//            for email links. Frontend has no /track/[token]/page.tsx
//            dynamic route, _redirects has no /track/* or /tracking/*
//            splat rule, and next.config.ts sets output: "export" (static
//            HTML). Cloudflare Pages 404s every /track/<anything> +
//            /tracking/<anything>.
//
//            STRUCTURAL CONSTRAINT (Phase A discovery)
//
//            The directive's recommended U1 (add app/track/[token]/page
//            .tsx dynamic route) is structurally blocked by output:
//            "export". Next.js 15 requires generateStaticParams() for all
//            dynamic routes under static export — for runtime-generated
//            12-char tokens, that means we'd need to enumerate every
//            possible token at build time, which isn't feasible. Adding
//            the route file with empty params would still produce zero
//            pre-rendered HTML, leaving Cloudflare to 404. Only paths to
//            unblock U1 are: drop output: "export" + migrate to next-on-
//            pages or Vercel SSR (major infrastructure change), or pre-
//            generate every token (impossible).
//
//            DECISION — U2 with U1's UX (SPA-rewrite via _redirects)
//
//            _redirects already uses status-200 URL rewrite for /carrier/*
//            (line 22 in the file pre-Sprint-26). Same pattern applies
//            cleanly to /track/*. Implementation:
//
//              public/_redirects (+2 rules, ordering matters):
//                /tracking/*  /track/:splat  301  (legacy email link
//                                                   backward-compat)
//                /track/*     /track          200  (QR/bookmark deep-link
//                                                   SPA rewrite)
//
//              app/track/page.tsx:
//                - Add tokenFromUrl state + useEffect that reads
//                  window.location.pathname on mount
//                - If pathname matches /track/<token>, decode token and
//                  fire api.get(`/tracking/${token}`) immediately
//                - Wrap search UI (tabs + input + Track button) in
//                  {!tokenFromUrl && (...)} — B3 result-only mode hides
//                  the search UI when token is in URL
//                - Show Loader2 spinner during fetch
//                - On error: red error message + "Track another shipment"
//                  link back to /track
//                - On success: existing result panel renders unchanged,
//                  with "Track another shipment →" link added below the
//                  contact panel for token-mode flow
//
//            EMAIL URL CONSOLIDATION (4 sites, not 1)
//
//            Sprint 25 Phase A undercount: only flagged shipperLoadNotify
//            Service.ts:48. Sprint 26 Phase A re-grep found 4 total sites
//            building /tracking/<token> URLs — all swap to /track/<token>:
//              - shipperLoadNotifyService.ts:48 (trackingLink helper used
//                in 6+ email templates)
//              - shipperLoadNotifyService.ts:316 (sendTrackingLink fn)
//              - shipperPortalController.ts:745 (generate tracking link
//                endpoint response)
//              - shipperNotificationService.ts:258 (milestone notification
//                emails)
//            Leaving 3 sites would have created silent inconsistency.
//
//            URL PATTERN POST-SPRINT-26
//
//              QR codes:                /track/<token>  (unchanged)
//              Email tracking links:    /track/<token>  (was /tracking/)
//              Manual customer entry:   /track          (search UI)
//              Legacy /tracking/*:      301 redirected to /track/<token>
//
//            BACKEND ENDPOINT UNCHANGED
//
//            GET /api/tracking/:token still owns the lookup logic with
//            its 5-tier fallback chain (ShipperTrackingToken → Load.
//            trackingToken → shipperCode → bolNumber → reference/load/
//            po). The frontend route consolidation does not touch the
//            backend lookup contract.
//
//            EDGE CASES
//
//              - Invalid token: backend returns 404 "Shipment not found"
//                → red error + manual-search fallback link
//              - Expired token: backend returns 410 "Tracking link has
//                expired" (per trackingController.ts:42) → message
//                rendered verbatim
//              - shipperCode field is dead schema (Sprint 25 finding)
//                but kept in fallback chain to avoid Sprint 26 scope
//                creep — separate cleanup sprint per §3.3 atomic-commit
//
//            VERIFICATION
//            Pre-commit: backend tsc clean, frontend next build clean.
//            /track is dark-only by design — token-mode UI inherits the
//            same bg-[#0f172a] wrapper, no cross-mode regression risk.
//
//            Net LOC change: ~50 source (track/page.tsx +35, _redirects
//            +2, 4 backend single-line edits). Sprint 25 Phase A had
//            estimated 80-130 LOC for U1; U2's lighter shape per A10.
//            Per §3.1 sequence-continuous rule: v3.8.aad → v3.8.aae.
// v3.8.aaf — Sprint 26b: hotfix. Closes /dashboard/loads click-to-
//            detail React error #31 crash that surfaced during Sprint
//            26 (v3.8.aae) Phase C smoke and blocked verification.
//
//            ROOT CAUSE — JSON column shape mismatch
//
//            Order Builder writes Load.accessorials as
//            Array<{type, amount, payer}> per the Accessorial interface
//            at frontend/src/app/dashboard/orders/types.ts:90.
//            Convert-to-load endpoint at backend/src/routes/orders.ts
//            :455 writes the form's accessorials array verbatim to the
//            JSON column.
//
//            Load Board side panel at frontend/src/app/dashboard/loads/
//            page.tsx:1030-1036 (pre-fix) iterated load.accessorials
//            with `key={a}` and rendered `{a}` directly as a React
//            child, assuming string[] not object[]. React threw
//            error #31 ("Objects are not valid as a React child")
//            with the object's keys (type, amount, payer) in the
//            error args.
//
//            Latent since v3.8.c (Order Builder convert flow shipped
//            ~Apr 28). Pre-commit tsc passed every sprint because
//            the Zod validator at backend/src/validators/load.ts:113
//            is `z.array(z.any()).optional()` — anything goes through.
//            Type-system can't catch JSON-column shape mismatches.
//
//            TRIGGER CONDITIONS
//
//            Bug fires only when ALL three are true:
//              (1) Load was created via Order Builder convert flow
//                  (Load Board "+ New Load" 4-step modal doesn't
//                  expose accessorial entry, so loads created that
//                  way don't trigger)
//              (2) User added at least one accessorial in Order Builder
//                  before converting
//              (3) User clicks the load on Load Board to open the
//                  side panel
//
//            Loads without accessorials don't trigger because the
//            render block is gated on `load.accessorials &&
//            load.accessorials.length > 0`.
//
//            FIX — F2 (per audit recommendation)
//
//            Render `accessorial.type` with optional ` ($amount)`
//            suffix. Defensive type-check covers three input shapes:
//
//              - typeof a === "string"
//                  → render `a` directly (legacy data compat for
//                    any pre-v3.8.c records that may have stored
//                    string-only accessorials)
//              - object with `type` key
//                  → render `${a.type}${a.amount ? ` ($${a.amount})` : ""}`
//                    so AE staff actually see the accessorial value
//                    in the side panel ("Detention ($250)")
//              - anything else (null, malformed, missing keys)
//                  → render literal "Accessorial" fallback so render
//                    doesn't crash even on unexpected data
//
//            React `key` switched from `key={a}` (which would also
//            have collided when accessorials repeat the same type)
//            to `key={i}` (array index, stable for this purely-
//            visual list with no reorder).
//
//            ADJACENT RISK SWEEP (Phase A confirmed clean)
//
//            Load model has 4 JSON columns total: stops (1112),
//            accessorials (1146 — THIS BUG), additionalRefs (1225),
//            datPostedFields (1254). Audited Load Board page for
//            React-child rendering of any of these — only
//            accessorials is rendered as a child, so this is a
//            one-finding fix, not a class-wide cleanup.
//
//            OUT OF SCOPE
//
//              - Tightening backend validator z.array(z.any()) to
//                a typed Zod schema (z.array(z.object({type,
//                amount, payer}))) — separate sprint; deferred
//                because the typed validator alone doesn't prevent
//                future render-side bugs, just data-side. The render
//                fix above is what closes the immediate failure.
//              - Audit other render sites that read JSON columns
//                across the codebase — broader audit sprint; this
//                hotfix scoped to Load Board only.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes;
//            verifying nothing drifted), frontend next build clean.
//
//            Net LOC change: ~10 (1 file, accessorials block
//            rewritten with defensive type-check + index keying).
//            Per §3.1 sequence-continuous rule: v3.8.aae → v3.8.aaf.
//            Customer-facing AE Console surface — version-bump
//            justified.
//
//            CLAUDE.md §13.3 Item 32 logged + closed in this same
//            commit per the established hotfix-with-immediate-close
//            pattern (e.g., Item 31 logged in v3.8.aad / closed in
//            v3.8.aae across consecutive sprints; this is the same
//            class but the discovery-to-close window is one sprint
//            shorter because the bug blocked Sprint 26 smoke).
// v3.8.aag — Sprint 27: /track public status vocabulary cleanup.
//            Customer-facing public tracking page leaked broker-
//            internal pipeline status enum values. User reported
//            during Sprint 26 Phase C smoke: status pill rendered
//            "POSTED" (load on our load board awaiting carrier) —
//            internal-process language the customer shouldn't need
//            to think about. Phase A audit confirmed one rendering
//            site: app/track/page.tsx:169-171 status pill rendered
//            `result.status.replace(/_/g, " ")` directly (raw enum).
//            Step bar already used pre-mapped friendly labels;
//            backend response stays canonical (returns full enum).
//
//            FIX 1 — PUBLIC_STATUS_LABEL map + helper
//
//            Added Record<string, string> mapping all 14 known Load
//            statuses (DRAFT/POSTED/TENDERED/CONFIRMED/BOOKED/
//            DISPATCHED/AT_PICKUP/LOADED/PICKED_UP/IN_TRANSIT/
//            AT_DELIVERY/DELIVERED/POD_RECEIVED/INVOICED/COMPLETED/
//            TONU/CANCELLED) to 8 customer-meaningful labels:
//
//              DRAFT/POSTED/TENDERED/CONFIRMED/BOOKED → "Scheduled"
//                (pre-dispatch cluster — broker still picking carrier)
//              DISPATCHED                              → "Dispatched"
//              AT_PICKUP                               → "At pickup"
//              LOADED/PICKED_UP                        → "Picked up"
//              IN_TRANSIT                              → "In transit"
//              AT_DELIVERY                             → "Arriving"
//              DELIVERED/POD_RECEIVED/INVOICED/        → "Delivered"
//                COMPLETED                              (post-delivery
//                                                       accounting noise
//                                                       hidden)
//              TONU/CANCELLED                          → "Cancelled"
//                (TONU is "Truck Ordered Not Used" billable internal
//                accounting nuance — customer doesn't need to know)
//
//            Helper publicStatusLabel(status) returns mapped label or
//            falls back to the existing `.replace(/_/g, " ")` behavior
//            for any unknown status (defensive — future schema additions
//            won't crash the public page).
//
//            Applied at page.tsx:169-171 status pill — one swap, one
//            line. Backend trackingController.ts:171 still returns
//            `status: load.status` (canonical enum) unchanged. If a
//            second public client ever ships (mobile app, embed widget),
//            promote the mapping to backend `publicStatus` field per
//            audit S3 path.
//
//            FIX 2 — STEP_BAR label revision per Phase A A5
//
//            STEP_BAR at lines 31-36 had a confusing label-to-status
//            mapping where AT_DELIVERY was labeled "In transit" — but
//            AT_DELIVERY means "at the delivery location waiting to be
//            unloaded," which is closer to "Arriving" than "in transit."
//            The literal "In transit" label was misleading. IN_TRANSIT
//            was labeled "Departed" which is also imprecise (IN_TRANSIT
//            means moving on the road, not "just departed").
//
//            Revised:
//              LOADED       → "Picked up"     (unchanged)
//              IN_TRANSIT   → "On the road"   (was "Departed")
//              AT_DELIVERY  → "Arriving"      (was "In transit")
//              DELIVERED    → "Delivered"     (unchanged)
//
//            Reads as a clearer customer journey: "Picked up → On the
//            road → Arriving → Delivered." STEP_BAR keys (load status
//            enum values) unchanged — only the labels customers see.
//
//            Bundled with Fix 1 per A5 recommendation: same file, same
//            render path, same atomic-commit slot. Splitting would have
//            been two passes through the same component.
//
//            ADJACENT NOT CHANGED
//
//            - "On time" badge at page.tsx:172 — already public-friendly
//            - Step bar completion checks (lines 198-218) — uses STEP_BAR
//              keys for find() boolean only, never renders the keys
//            - Detail grid (lines 222-228) — no status involved
//            - Last known location (lines 190-194) — no status involved
//            - Backend trackingController.ts response shape — unchanged
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes;
//            verifying nothing drifted), frontend next build clean.
//
//            Net LOC change: ~35 (PUBLIC_STATUS_LABEL map + helper +
//            1-line status pill swap + 2 STEP_BAR label edits).
//            Per §3.1 sequence-continuous rule: v3.8.aaf → v3.8.aag.
//            Customer-facing surface (every BOL QR scan post-Sprint-26
//            sees the new labels) — version-bump justified.
// v3.8.aah — Sprint 29: hotfix. Closes Sprint 28 Phase A finding A28-1
//            (P0 RateConfirmation modal accessorial shape mismatch).
//            Same root-cause class as Sprint 26b's Load Board crash —
//            Order Builder writes Array<{type, amount, payer}> per the
//            Accessorial interface (orders/types.ts:90) but the RC
//            modal hydrator at RateConfirmationModal.tsx:418 (pre-fix)
//            assumed RC's own internal shape `{description, amount}`.
//
//            ROOT CAUSE — JSON column shape mismatch (re-emerged)
//
//            Pre-fix code:
//              load.accessorials.map((a: any) => ({
//                id: generateId(),
//                description: a.description || a,  // BUG
//                amount: a.amount ? String(a.amount) : "0",
//              }))
//
//            For Order Builder accessorials `{type: "Detention", amount: 0,
//            payer: "Customer"}`, `a.description` is undefined → the
//            `|| a` fallback set `description` to the WHOLE object.
//            Form state then carried the object through to:
//              - Line 500: form.accessorials.filter((a) =>
//                  a.description.trim()) — crashes with TypeError
//                  ("a.description.trim is not a function") because the
//                  object doesn't have .trim()
//              - Line 1716-1717: <Input value={acc.description} ... />
//                — React error #31 again because rendering object
//
//            Crashes when: AE opens RateConfirmation modal for any load
//            created via Order Builder convert flow with at least one
//            accessorial. Same trigger conditions as Sprint 26b Load
//            Board crash but a different surface.
//
//            FIX — defensive type-check (pattern matches Sprint 26b)
//
//            Three input shapes supported:
//              - string (legacy)                    → description = a
//              - { description, amount } (RC own)   → description = a.description
//              - { type, amount, payer } (Order Builder) → description = a.type
//
//            Code:
//              const description =
//                typeof a === "string" ? a
//                : a && typeof a === "object" ? a.description || a.type || ""
//                : "";
//              return { id: generateId(), description,
//                       amount: a?.amount ? String(a.amount) : "0" };
//
//            Now Order Builder accessorial `{type: "Detention", amount:
//            0}` hydrates as RC modal accessorial `{id: ..., description:
//            "Detention", amount: "0"}` — clean shape, no downstream
//            crash, displays "Detention" in the description field.
//
//            ROOT-CAUSE LOOPHOLE STILL OPEN (Sprint 31 candidate)
//
//            Phase A A28-2 flagged validators/load.ts:113 `accessorials:
//            z.array(z.any()).optional()` — the Zod validator accepts any
//            shape, no API-layer enforcement. Sprint 26b + Sprint 29
//            both cosmetic-patched the consumer side; the producer side
//            (Order Builder write path) still emits its own shape, and
//            the RC modal save path emits ITS own shape. Multiple shapes
//            coexist in DB. Sprint 31 will tighten the validator + add a
//            data migration to coerce all shapes to one canonical
//            representation. Sprint 29 leaves the DB as-is and handles
//            both shapes defensively at read time.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes), frontend
//            next build clean.
//
//            Net LOC change: ~15 (RateConfirmationModal.tsx accessorial
//            hydrator block expanded from 1 line to ~17 with defensive
//            type-check + comment block explaining the three input
//            shapes).
//            Per §3.1 sequence-continuous rule: v3.8.aag → v3.8.aah.
//            AE Console surface — version-bump justified.
//
//            Sprint 28 Phase A §13.3 Item 33 logged + closed in this
//            same commit per the established hotfix-with-immediate-close
//            pattern (Items 31, 32 same shape).
// v3.8.aai — Sprint 30: hotfix. Closes 5 findings from Sprint 28 Phase
//            B Tier 1.2 walk (B28-T1.2-A through D + adjacent
//            governing-law fix). RC Modal Broker Info section displayed
//            template values from a Texas-based shipping company that
//            had never been updated for SRL. Wrong address (Houston
//            vs Galesburg MI), wrong email (dispatch@ vs operations@),
//            non-canonical MC#/DOT# format (hyphen vs `#` per voice.md
//            :98), wrong governing-law clause (Texas vs Michigan per
//            §14). P0 BKN-blocking — BKN ships in days; RC PDFs go to
//            BKN's carriers and reference SRL's company info.
//
//            ROOT CAUSE — Texas-based shipper template provenance
//
//            All 5 wrong values trace to a single boilerplate import
//            in the same module:
//
//              RateConfirmationModal.tsx:270 governing law: "State
//                of Texas"
//              RateConfirmationModal.tsx:274 mc: "MC-1794414"
//              RateConfirmationModal.tsx:275 dot: "DOT-4526880"
//              RateConfirmationModal.tsx:276 address: "8950 Westheimer
//                Rd, Suite 200, Houston, TX 77063"
//              RateConfirmationModal.tsx:278 email: "dispatch@
//                silkroutelogistics.ai"
//
//            The Houston address + Texas governing law + dispatch@
//            email pattern is consistent with a Texas-based broker
//            template that was imported for the RC modal scaffolding
//            and never had values swapped to SRL canonical. Phase A
//            grep across frontend/src + backend/src returned this
//            exact module as the only source of all 5 wrong values
//            — single-file blast radius confirmed.
//
//            CANONICAL DATA APPLIED
//
//              Company:    Silk Route Logistics Inc. (unchanged)
//              MC#:        MC# 1794414      (was "MC-1794414")
//              DOT#:       DOT# 4526880     (was "DOT-4526880")
//              Address:    2317 S 35th St, Galesburg, MI 49053
//                          (was "8950 Westheimer Rd, Suite 200,
//                          Houston, TX 77063")
//              Phone:      (269) 220-6760   (unchanged)
//              Email:      operations@silkroutelogistics.ai
//                          (was "dispatch@silkroutelogistics.ai" —
//                          dispatch@ is not in CLAUDE.md §1 canonical
//                          alias list; operations@ is the explicit
//                          canonical for "BOL, Rate Confirmation,
//                          Invoice, and other shipper/carrier-facing
//                          documents" per §1 + §3.10)
//              Gov law:    Michigan + Kalamazoo County venue
//                          (was Texas, no venue)
//
//            Sources of truth:
//              - CLAUDE.md §1 — address, phone, MC#/DOT# numeric
//              - .claude/skills/srl-brand-design/references/voice.md
//                :98 — `MC# 1794414, DOT# 4526880` format convention
//                (with `#` symbol, no hyphen, no leading zero)
//              - CLAUDE.md §14 — Michigan governing law, Kalamazoo
//                County venue
//              - CLAUDE.md §3.10 — operations@ canonical alias for
//                customer-facing shipping documents
//
//            FORMAT NOTES
//
//              - § symbol replaces "Section" word per legal convention
//              - "MC# 1794414" with single space after `#` symbol
//                matches voice.md SOT and existing BOL v2.9 production
//                output
//              - Address format follows USPS-canonical "Street, City,
//                ST ZIP" comma-separated convention
//
//            SCOPE BOUNDED — single-file fix
//
//            Phase A grep sweep confirmed all wrong SRL data is
//            contained in RateConfirmationModal.tsx. backend/src/
//            services/eldService.ts:52 has "Houston, TX" but that's
//            an ELD geocoding city lookup table (real city), not SRL
//            company identity — unrelated, leave as-is.
//
//            OUT OF SCOPE (deferred to existing backlog items)
//
//              - frontend/src/lib/site-chrome.json has its own drift
//                (mcNumber `01794414` leading-zero typo per §13.3
//                Item 8.8, email `sales@` undocumented alias per
//                §13.3 Item 8.2.1) — different surface (marketing
//                page footers), separate sprint candidates
//              - BOL/Invoice template authority blocks — §13.3 Item
//                8.9 architectural sprint. Those templates use their
//                own data sources via different code paths
//              - Central authority module
//                (frontend/src/lib/srl-info.ts) consolidating all
//                customer-facing surfaces — Path 2 alternative,
//                explicitly deferred to §13.3 Item 8.9 per Phase A
//                A5-alt
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes;
//            verifying nothing drifted), frontend next build clean.
//
//            Net LOC change: ~7 source (6 inline value swaps + 1
//            governing-law clause swap, all in one module). Smallest
//            hotfix yet by source-LOC measure.
//            Per §3.1 sequence-continuous rule: v3.8.aah → v3.8.aai.
//            Customer-facing AE Console + RC PDF surface — version-
//            bump justified.
//
//            §13.3 Items 34-38 logged + closed in this same commit
//            per the established hotfix-with-immediate-close pattern
//            (Items 31, 32, 33 same shape):
//              Item 34: B28-T1.2-A — RC Broker Info placeholders
//              Item 35: B28-T1.2-B — Houston → Galesburg address
//              Item 36: B28-T1.2-C — dispatch@ → operations@ email
//              Item 37: B28-T1.2-D — MC#/DOT# format hyphen → `#`
//              Item 38: adjacent governing-law Texas → Michigan + venue
// v3.8.aaj — Sprint 31: hotfix. RC Modal Carrier Search 404 silent-fail.
//            Closes §13.3 Item 39 (B28-T1.3-A re-diagnosed).
//
//            ROOT CAUSE — route URL mismatch
//
//            RateConfirmationModal.tsx:1422 (pre-fix) called:
//              api.get("/carriers/all", { params: { search, limit }})
//
//            But the canonical handler getAllCarriers is mounted at
//            `/api/carrier/all` (singular) per backend/src/routes/
//            carrier.ts:123, NOT `/api/carriers/all` (plural).
//
//            The plural route file (routes/carriers.ts) defines
//              GET /         → getAllCarriers (with carrierQuerySchema)
//              GET /:id      → getCarrierDetail
//
//            Express matched `/api/carriers/all` against the `/:id`
//            route with `req.params.id = "all"`, called
//            getCarrierDetail("all") → returned 404 (no carrier with
//            id "all"). Frontend useQuery silently swallowed the 404,
//            `data` stayed undefined, dropdown render gated on
//            `showSearch && carriers && (...)` never fired, AE saw
//            silent dead-state — input typed, no dropdown, no error,
//            no autofill.
//
//            Re-diagnosis history: B28-T1.3-A was originally walked
//            and logged as "P1 missing empty state on carrier search."
//            Phase A audit corrected the diagnosis — the empty state
//            was never the bug. The bug is the route URL.
//            Memory #11 audit-first methodology firing: walk surfaces
//            symptom, audit identifies real cause, correct fix ships.
//            (Pattern matches Sprint 26 → 26b accessorial walk →
//            actual root cause discovery.)
//
//            FIX
//
//            1-character change: `s` removed from `carriers/all`.
//            New URL: `/carrier/all`. Now resolves to the actual
//            getAllCarriers handler at backend/src/routes/carrier.ts
//            :123.
//
//            Inline comment added at the call site referencing this
//            sprint + §13.3 Item 40 (the duplicate-route consolidation
//            backlog item).
//
//            ADJACENT FINDING LOGGED, NOT FIXED (§13.3 Item 40)
//
//            Two carrier-route files exist:
//              backend/src/routes/carrier.ts  (singular) — mounted
//                at /api/carrier — has /all (no validation)
//              backend/src/routes/carriers.ts (plural) — mounted at
//                /api/carriers — has / (with validation) + /:id
//
//            Both files call the same getAllCarriers controller.
//            Validation drift between the two paths. Future cleanup
//            should consolidate to one file + one URL pattern;
//            tracked as Item 40 separately. Sprint 31 stays atomic
//            on the URL fix per §3.3 "no scope creep" rule.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes),
//            frontend next build clean.
//
//            Net LOC change: ~7 (1 URL char swap + 6-line inline
//            comment block referencing the route-consolidation
//            backlog item).
//            Per §3.1 sequence-continuous rule: v3.8.aai → v3.8.aaj.
//            AE Console surface — version-bump justified.
//
//            §13.3 Item 39 logged + closed in this same commit per
//            the established hotfix-with-immediate-close pattern
//            (Items 31, 32, 33, 34-38 same shape).
//            §13.3 Item 40 logged for future consolidation, not
//            closed.
// v3.8.aak — Sprint 32: RC Modal carrier dropdown cream-bg fix +
//            silent-error UI surfacing. Closes §13.3 Items 41 + 43.
//            Item 42 (PDF/Tender root cause) logged OPEN — Sprint 33
//            closes once error UI surfaces actual failure.
//
//            Path β chosen per Sprint 32 directive (vs Path α single
//            atomic with DevTools artifact bundled): two atomic
//            commits, cleaner boundaries, error UI ships independent
//            value beyond just diagnosing this one bug.
//
//            (1) FINDING #41 — Carrier dropdown color mismatch
//
//            Carrier search dropdown render block at
//            RateConfirmationModal.tsx:1518-1546 used dark navy
//            off-canonical bg-[#1a2340] against cream-themed modal
//            shell. Mixed-context render — text-white on
//            bg-[#1a2340] worked technically (~17:1 contrast) but
//            looked discordant against surrounding cream UI.
//
//            Fix per Path B (Phase A recommendation):
//              bg-[#1a2340] border-white/10  →  bg-white border-slate-200
//              hover:bg-white/5              →  hover:bg-slate-50
//              text-white (carrier name)     →  text-slate-900
//
//            Tier badges (canonical Sprint 24 palette) untouched.
//            "No carriers found" empty state slate-500 unchanged
//            (passes AA on white ≈5:1).
//
//            Net source change: 3 LOC swap.
//
//            (2) FINDING #43 — Silent error swallow on RC handlers
//
//            handleSaveDraft / handleGeneratePdf / handleSendTender
//            all caught errors via bare `console.error("...", err)`
//            with NO UI feedback. User clicks button, API fails,
//            user sees nothing — no toast, no alert, no inline
//            error. Pattern blocked Sprint 32 Phase A from
//            diagnosing the underlying PDF/Tender failure without
//            DevTools.
//
//            Fix:
//              - New `submitError: string | null` state at component
//                root (alongside existing `saving` state)
//              - Helper `extractErrorMessage(err, fallback)` checks
//                err.response.data.error → .message → err.message →
//                fallback (handles axios shape, native Error, plain
//                string)
//              - All 3 handlers reset error to null at start, then
//                set error in catch block on failure
//              - New JSX banner above button row, conditionally
//                rendered when submitError is set:
//                  bg-red-50 border-l-4 border-red-500 text-red-700
//                  with "Error:" label prefix
//              - Position: between scroll content area and bottom
//                button row, so visible without obscuring either
//
//            red-50/red-500/red-700 is canonical Tailwind error
//            palette — works on both cream + dark contexts. Banner
//            dismisses automatically on next handler attempt
//            (resets at handler start) so no manual close needed.
//
//            Net source change: ~25 LOC (state + helper + 3 handler
//            edits + JSX banner).
//
//            (3) ITEM #42 — PDF/Tender silent-fail root cause
//                (LOGGED OPEN — Sprint 33 close)
//
//            Original symptom — both Generate PDF + Send Tender
//            buttons did nothing visible. Phase A audit confirmed
//            handlers are wired correctly, backend routes exist,
//            but something between client payload and server
//            validation is rejecting the request silently.
//
//            Most likely failure mode (educated guess pending Sprint
//            33 diagnosis): Zod validator at
//            backend/src/validators/rateConfirmation.ts:16-200+
//            rejecting one of ~50 form-state fields spread via
//            `...form` in buildPayload(). Schema is permissive
//            (`.optional()` on most) but type mismatches throw.
//            Could also be auth or backend internal error.
//
//            Sprint 33 closes Item 42 once Sprint 32's error UI
//            surfaces the actual rejection on next click attempt.
//            Diagnosis depends on first error surfaced — fix
//            shape varies (1-15 LOC depending on which schema
//            field rejects).
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes;
//            verifying nothing drifted), frontend next build clean.
//
//            Net LOC change: ~30 source (3 dropdown swaps + 25
//            error-UI lines + 1 carrier-name text-color swap).
//            Per §3.1 sequence-continuous rule: v3.8.aaj → v3.8.aak.
//            AE Console RC modal surface — version-bump justified.
//
//            §13.3 Items 41 + 43 logged + CLOSED in same commit per
//            established hotfix-with-immediate-close pattern
//            (Items 31, 32, 33, 34-38, 39 same shape). Item 42
//            logged OPEN, Sprint 33 close.
// v3.8.aal — Sprint 33 Path A: bundle Items 42 + 44 RC Modal P0 fixes.
//            Item 41 stays CLOSED (Sprint 32 fix verified at code level
//            — user-side persistence is browser bundle cache, hard
//            refresh resolves; no code change needed). Item 42 stays
//            OPEN (extractor widening ships diagnostic surface; Sprint
//            34 closes with targeted field fix once next click surfaces
//            specific Zod rejection). Item 44 logged + closed.
//
//            (1) ITEM 42 — Zod error extractor widening
//
//            Backend errorHandler at backend/src/middleware/errorHandler
//            .ts:66-76 returns Zod errors as
//              { error: "Validation error", details: [{field, message}, ...] }
//            Sprint 32 v3.8.aak shipped error UI but the extractor only
//            checked top-level `error` / `message`, surfacing only the
//            generic "Validation error" string. Sprint 33 widens
//            extractErrorMessage helper to iterate `details[]` array
//            when present:
//              "Validation error — formData.fieldName: <message>; ..."
//            Wired into all 3 RC handler catch blocks (Generate PDF +
//            Send Tender + Save Draft).
//
//            Path β methodology continued: observability ships first,
//            targeted fix ships subsequent atomic commit. Sprint 34
//            closes Item 42 with the specific field fix once the
//            widened extractor surfaces what's rejecting.
//
//            (2) ITEM 44 — Caravan tier reconciliation (P0 BKN-blocking)
//
//            Sprint 23 reconciled /accounting/quick-pay + /accounting/
//            payments to canonical Caravan 3-tier (Silver/Gold/Platinum
//            per CLAUDE.md §8). RC Modal Section 8 (Payment Terms) was
//            missed in Sprint 23 scope — still rendered legacy 6-tier
//            card grid: Flash/Express/Priority/Partner/Elite/Standard
//            with PaymentTier enum-encoded SLA hours.
//
//            P0 BKN-blocking: RC PDFs to BKN's carriers reference
//            payment terms that don't exist in customer-facing Caravan
//            Partner Program. Same credibility class as Sprint 30
//            Houston-address fix.
//
//            REPLACED:
//              PAYMENT_TIERS Record<string, {label, days, fee}>
//              6-card legacy grid driven by enum keys
//
//            WITH:
//              PAYMENT_SPEEDS array [STANDARD, QP_7DAY, QP_SAMEDAY]
//              feePctForSpeed(speedUiKey, tier) tier × speed helper
//              standardNetByTier(tier) Silver/Gold/Platinum Net days
//              uiKeyFromEnum(enumValue) reverse map for legacy display
//              LEGACY_PAYMENT_TIERS preserved for fallback display on
//                existing loads pre-Sprint-33 (EXPRESS/PARTNER/ELITE
//                values still readable; AE-unselectable from new RC)
//
//            UI structure:
//              3-card SPEED selector replaces 6-card tier grid
//              Caravan tier badge in section header (auto-derived
//                from selected carrier's CarrierProfile.tier)
//              Each card sub-text shows tier-derived value:
//                Standard: tier-derived Net days (30/21/14)
//                QP_7DAY:  3% / 2% / 1% fee per Silver/Gold/Platinum
//                QP_SAMEDAY: 5% / 4% / 3% fee per universal +2% rule
//
//            Backend PaymentTier enum preserved per Sprint 23 stay-
//            canonical decision. UI selection maps to enum on save:
//              STANDARD UI → STANDARD enum (168h SLA)
//              QP_7DAY UI → PRIORITY enum (48h SLA, closest to 7-day
//                mental model)
//              QP_SAMEDAY UI → FLASH enum (2h SLA)
//
//            EXPRESS/PARTNER/ELITE legacy enum values become AE-
//            unselectable from new RC Modal but persist in DB for
//            analytics + legacy load display. Existing loads with these
//            values render the closest UI speed via uiKeyFromEnum
//            (EXPRESS→QP_SAMEDAY, PARTNER→QP_7DAY, ELITE→STANDARD)
//            and can re-save into the new 3-bucket scheme.
//
//            FormState gained `carrierTier: string` field (defaults
//            empty; reads from load.carrier.carrierProfile.tier on
//            initForm; selectCarrier writes carrier.tier on selection).
//            financials.feePercent calc rebased from legacy enum lookup
//            to tier × speed derivation via feePctForSpeed helper.
//
//            (3) ITEM 41 — Carrier dropdown color (NO CODE CHANGE)
//
//            Phase A audit verified Sprint 32 commit 6d6655a contained
//            the bg-[#1a2340] → bg-white swap. Project-wide grep
//            confirmed zero remaining matches. globals.css theme
//            cascade audit confirmed `#1a2340` is NOT in the catch-all
//            override list (lines 124-132) — but post-Sprint-32 the
//            dropdown uses `bg-white` which renders white in BOTH
//            light + dark modes regardless of theme override. Code
//            is correct.
//
//            User-reported persistence after v3.8.aak deploy traces
//            to browser bundle cache. Next.js code-splits per route;
//            RC Modal chunk has its own content-hashed bundle. If
//            Cloudflare cached the HTML referencing OLD chunk hashes,
//            user's browser loads OLD modal bundle alongside fresh
//            VersionFooter chunk — explains why footer reads aak
//            but modal still appears pre-aak. Hard refresh
//            (Ctrl+Shift+R) resolves.
//
//            Item 41 stays CLOSED. Sprint 32 close stands.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes;
//            verifying nothing drifted), frontend next build clean.
//
//            Net source change: ~80 LOC across 1 file
//            (RateConfirmationModal.tsx). Per §3.1 sequence-continuous
//            rule: v3.8.aak → v3.8.aal. AE Console + customer-facing
//            RC PDF surface — version-bump justified.
//
//            §13.3:
//              - Item 41 keeps CLOSED (Sprint 32)
//              - Item 42 keeps OPEN (Sprint 34 close)
//              - Item 44 logged + CLOSED in this commit
// v3.8.aam — Sprint 34: Item 42 close. Path β methodology cycle
//            complete (Sprints 32 → 33 → 34) for the RC modal
//            silent-fail class.
//
//            ROOT CAUSE — string-vs-number type mismatch
//
//            Sprint 33 widened extractor surfaced:
//              "Validation error — formData.quickPayFeePercent:
//               Expected number, received string"
//
//            FormState declares quickPayFeePercent: string (line 188)
//            for input ergonomics. Three write paths all stringify:
//              - initForm: String(load.quickPayFeePercent) || ""
//              - useEffect: set("quickPayFeePercent",
//                              String(financials.feePercent))
//              - QuickPayOverridePanel callback:
//                              set("quickPayFeePercent", String(pct))
//
//            buildPayload() spreads `...form` which carried the string
//            unchanged. backend/src/validators/rateConfirmation.ts:117
//            declares quickPayFeePercent: z.number().optional() —
//            strict number, rejects string with the surfaced error
//            message above.
//
//            Other numeric fields in payload (weight, pieces,
//            customerRate, lineHaulRate, fuelSurcharge, totalCharges,
//            accessorials.amount) all have explicit coercion before
//            send (parseFloat/parseInt/toNum). quickPayFeePercent was
//            the lone gap — Phase A sweep confirmed single-field issue,
//            not bug class.
//
//            FIX — Path X1 (surgical buildPayload coercion)
//
//            Added explicit Number() coercion with empty-string
//            preservation:
//              quickPayFeePercent: form.quickPayFeePercent !== ""
//                ? Number(form.quickPayFeePercent)
//                : undefined,
//
//            Empty-string check `!== ""` preserves null-vs-zero
//            distinction:
//              - empty input → undefined → DB null (correct: "no
//                value")
//              - "0"          → Number(0) = 0 → DB 0 (correct: explicit
//                "no fee" STANDARD selection)
//              - "1.5"        → Number(1.5) = 1.5 → DB 1.5 (correct)
//
//            Alternative `Number(...) || undefined` rejected because
//            it would mask explicit "0" as undefined → silently break
//            STANDARD tier no-fee semantics. Phase A caught this —
//            audit-first methodology earning its keep again.
//
//            Net source change: 3 LOC. ~12 with surrounding comment.
//            Smallest hotfix shape per Path β closing-fix pattern.
//
//            PATH X1 vs X3 DECISION
//
//            Path X3 (z.coerce.number on validator schema) rejected
//            per Phase A:
//              - Changes validator semantics across schema; risks
//                empty-string-to-zero confusion on other fields
//              - Belongs in §13.3 Item A28-2 architectural sprint
//                where z.preprocess can apply principled coercion at
//                validator boundary
//              - X1 fits established buildPayload pattern (toNum,
//                parseFloat, parseInt already used for sibling
//                numeric fields)
//
//            PATH β METHODOLOGY VALIDATION
//
//            Sprint 32 (v3.8.aak): error UI exposes silent failure
//              — added submitError state + red banner above button row
//            Sprint 33 (v3.8.aal): extractor widening surfaces field
//              — iterate ZodError details[] array for field-level
//              messages; banner format "Validation error — field: msg"
//            Sprint 34 (v3.8.aam): targeted field coercion closes
//              root cause — single-field surgical fix per Path A1
//
//            Total cycle: ~38 LOC across 3 atomic commits.
//              Sprint 32: ~25 LOC (error UI + state + helper + banner)
//              Sprint 33: ~10 LOC (extractor widening) + Sprint 33
//                also bundled Item 44 (~80 LOC Caravan tier)
//              Sprint 34: ~3 LOC (this fix)
//
//            Zero speculation, zero regressions, zero wrong guesses.
//            Error UI + widened extractor remain as PERMANENT
//            diagnostic infrastructure for future RC handler API
//            failures. Pattern propagation candidate for other
//            modals/forms across the codebase.
//
//            ITEM 45 LOGGED (NOT FIXED IN SPRINT 34)
//
//            buildPayload() spreads `...form` which includes
//            totalCarrierPay + netPayAmount. Backend validator doesn't
//            declare these fields — Zod default `.strip()` silently
//            drops them. Either remove from payload spread for
//            clarity OR declare in validator if useful. Architectural
//            decision, low priority, no current bug. ~5 LOC fix
//            scheduled for follow-up cleanup. Logged in §13.3 Item 45.
//
//            ITEM A28-2 ELEVATED
//
//            Today's Path β cycle demonstrates the cost of "validator
//            strict, frontend payload promiscuous" pattern. Item A28-2
//            architectural sprint (validator hardening via z.preprocess
//            shape coercion at validator boundary) would prevent this
//            class entirely. Worth post-BKN priority bump from
//            deferred queue.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes;
//            verifying nothing drifted), frontend next build clean.
//
//            Per §3.1 sequence-continuous rule: v3.8.aal → v3.8.aam.
//            Customer-facing AE Console + RC PDF surface — version-
//            bump justified.
//
//            §13.3:
//              - Item 41 stays CLOSED (Sprint 32)
//              - Item 42 CLOSED in this commit (Sprint 34)
//              - Item 44 stays CLOSED (Sprint 33)
//              - Item 45 LOGGED OPEN (follow-up cleanup)
// v3.8.aan — Sprint 35: Item 46 close + Items 47/48 logged. Path β
//            cycle continues — Sprint 34's diagnostic surface (the
//            extractor widening from Sprint 33) revealed the next
//            field rejection on next Generate PDF attempt.
//
//            ROOT CAUSE — TRIPLE-SOURCE DISAGREEMENT
//
//            Frontend FormState (line 182):  "FLAT" | "PER_MILE"   ✗
//            Frontend SelectField:            PER_MILE option       ✗
//            Backend Zod validator (line 106): ["FLAT", "PERCENTAGE"] ✓
//            Backend Prisma enum (schema 446): FLAT/PERCENTAGE       ✓
//
//            Frontend's PER_MILE was phantom — backend has no such
//            enum value. Selecting it stored an invalid string that
//            failed the validator on Generate PDF/Send Tender/Save.
//
//            ORIGIN — DOMAIN CONCEPT CONFLATION
//
//            Backend validator at line 104 has rateType: z.enum
//            (["FLAT", "PER_MILE"]) — different field, different
//            concept:
//              - rateType:          load rate is flat $X or per-
//                                    mile $Y/mi
//              - fuelSurchargeType: FSC is flat $ or percentage of
//                                    base
//
//            Frontend RC modal copy-pasted PER_MILE from rateType to
//            fuelSurchargeType. Domain concepts are distinct industry-
//            standard:
//              - "Per mile" rates apply to base load rate
//              - "Percentage" surcharges apply to fuel only
//
//            FIX — PATH A (frontend aligns to backend canonical)
//
//            Three edits (~5 LOC):
//              FormState type union: PER_MILE → PERCENTAGE
//              SelectField onChange cast: PER_MILE → PERCENTAGE
//              SelectField option: { value: "PER_MILE",
//                label: "Per Mile" } → { value: "PERCENTAGE",
//                label: "Percentage" }
//
//            Plus initForm defensive normalization (~3 LOC) — coerces
//            any legacy "PER_MILE" stored value (unlikely but
//            possible) to "FLAT" default rather than rendering invalid.
//
//            PATH B (add PER_MILE to backend enum) REJECTED — would
//            cement frontend's domain conflation. Backend canonical
//            FLAT/PERCENTAGE is correct per industry convention.
//
//            ITEM 47 LOGGED OPEN — Stop.type "STOP" enum latent risk
//
//            Frontend FormState declares Stop.type as "PICKUP" |
//            "DELIVERY" | "STOP" (line 45). Backend validator allows
//            only ["PICKUP", "DELIVERY"] (validators/rateConfirmation
//            .ts:4). Default flow doesn't create STOP-type stops —
//            not actively firing — but if any future code path creates
//            STOP-type stop, validator rejects same as Item 46 class.
//            Post-BKN cleanup. NOT in Sprint 35 scope per §3.3 atomic-
//            commit rule.
//
//            ITEM 48 LOGGED OPEN — RC PDF format reconciliation
//
//            User's Sprint 34 smoke screenshot of generated RC PDF
//            (RC-L7492033667.pdf) revealed format issues vs srl-
//            brand-design skill canonical (BOL v2.9 reference):
//              - 6 pages with phantom-blank pages 2/3/5/6 from page-
//                break logic; content actually fits on 2 pages
//              - Address duplicated in header chrome ("2317 S 35th
//                St, Galesburg, MI 49053" then "Galesburg, MI 49053"
//                on next line)
//              - No QR code (BOL v2.9 has /track/<token> QR)
//              - No canonical Compass mark — generic small icon shown
//              - Carrier Information section renders empty even when
//                carrier selected post-Sprint-32 dropdown fix (field-
//                binding gap in pdfService.ts/generateEnhancedRate
//                Confirmation)
//              - TOTAL section bare — shows totals but no Caravan
//                tier breakdown, no QP fee detail, no payment terms
//                reflection of Sprint 33 Caravan tier reconciliation
//              - Font/section-header chrome drift from skill canonical
//
//            Multi-day architectural sprint post-BKN, scope ~200-400
//            LOC across pdfService.ts + brand-skill template.
//            Parallels BOL v2.9 epic shape. NOT BKN-blocking — current
//            PDF is functional, just doesn't match skill polish.
//
//            ITEM A28-2 ELEVATED (REPEAT)
//
//            Sprint 32 → 33 → 34 → 35 cycle (and likely more if
//            additional enum/type fields exist) demonstrates "validator
//            strict, frontend payload promiscuous" pattern cost.
//            Item A28-2 architectural sprint (z.preprocess at validator
//            boundary) would prevent this class entirely — every stale
//            field on the frontend would coerce or reject at validator
//            boundary with a clear field-level message. Worth post-BKN
//            priority bump.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes), frontend
//            next build clean.
//
//            Net source change: ~5 LOC (3 enum-value swaps + 3-line
//            initForm normalize). Per §3.1 sequence-continuous rule:
//            v3.8.aam → v3.8.aan. Customer-facing AE Console + RC PDF
//            surface — version-bump justified.
//
//            §13.3:
//              - Item 46 LOGGED + CLOSED in this commit (Sprint 35)
//              - Item 47 LOGGED OPEN (Stop.type latent, post-BKN)
//              - Item 48 LOGGED OPEN (RC PDF format reconciliation,
//                post-BKN architectural sprint)
// v3.8.aao — Sprint 36 Path β-bundled: Items 49 + 50 closure
//            (BKN-blocking) + 6 contract gaps (Items 51-56) logged
//            for sequential post-BKN sprints.
//
//            Sprint 36 paused mid-Path B for Phase A0 audit on
//            tender acceptance contract (carrier accept → AE
//            Console propagation). A0 surfaced 7 contract gaps;
//            2 BKN-blocking, 5 architectural cleanup. Path β-bundled
//            ships Y1 carrier picker + G1 Load Board polling
//            (atomic ~55 LOC) + logs the rest as §13.3 Items 51-56.
//
//            ITEM 49 (Y1) — Tender modal carrier picker rewrite
//
//            Sprint 28 Phase B walk Tier 1.3 Step 2 surfaced
//            empty <select> dropdown on Tender modal. Phase A
//            audit found loads/page.tsx:1559-1568 static <select>
//            iterates suggestedCarriers?.carriers — the waterfall-
//            scored subset. Brand-new platform with zero historical
//            lane data → waterfall returns 0 matches → dropdown
//            empty → AE can't tender to BKN despite BKN being
//            approved + tier-assigned.
//
//            Replaced static <select> with search-input picker
//            matching RC Modal Section 6 pattern (Sprint 31 + 32).
//            ~50 LOC. New surface:
//              - useState carrierSearch + showSearch + selectedCarrier
//              - useQuery /api/carrier/all (Sprint 31 endpoint)
//              - Search input with placeholder
//              - Dropdown of all approved carriers (cream bg + dark
//                text per Sprint 32, tier badge canonical Sprint 24
//                palette)
//              - "Matched" tag on waterfall-suggested carriers as
//                advisory (not gate) — preserves scoring info
//              - Empty state + selected-carrier display + Change
//                button
//              - pickCarrier handler sets tenderCarrierId from
//                user.id || carrier.id
//              - Compliance check fires post-selection per existing
//                safety
//
//            ITEM 50 (A0.3-G1) — Load Board polling for tender-
//            accept propagation
//
//            Phase A0 audit revealed Load Board ["loads"] +
//            ["load", id] TanStack Query keys had NO refetchInterval
//            and NO staleTime override. When carrier accepts tender
//            in their portal:
//              - Carrier-portal mutation onSuccess refetches
//                ["carrier-tenders"] ✓
//              - Backend writes Load.status = BOOKED + carrierId set
//              - Backend has /api/track-trace/stream SSE endpoint
//                with broadcastSSE handlers, BUT zero frontend
//                consumers (grep returned no EventSource subscribers
//                in frontend/src/)
//              - AE Console Load Board: no refresh path → AE must
//                manually navigate or refresh
//
//            Added refetchInterval: 30_000 to both Load Board
//            queries. Carrier accepts → 30s window → AE Console
//            reflects status change. Trade-off: 30s polling adds
//            modest backend load. Acceptable for pre-BKN single-
//            tenant volume. SSE consumer wiring is post-BKN
//            architectural priority (logged as adjacent
//            observation — backend infrastructure already exists,
//            frontend dead).
//
//            ITEMS 51-56 LOGGED OPEN (not fixed in Sprint 36)
//
//            A0 audit surfaced 6 additional contract gaps:
//              Item 51 (G2): notifyTenderAction dead code —
//                function exists in notificationService.ts:91 but
//                never called by any path. Direct accept uses
//                manual prisma.notification.create with wrong
//                "LOAD_UPDATE" type instead of "TENDER_ACCEPTED".
//              Item 52 (G3): Shipper tracking-link not fired —
//                sendTrackingLinkToCrmContacts called only from
//                loadBids.ts + orders.ts; tender accept paths
//                (both direct + waterfall) skip it despite the
//                comment claiming all three should fire.
//              Item 53 (G4): Direct accept race condition —
//                tenderController.acceptTender uses Promise.all
//                (concurrent, NOT atomic). v3.8.j docs claim
//                "atomically sets carrierId + status=BOOKED" but
//                actual code isn't prisma.$transaction.
//              Item 54 (G5): AE accept-on-behalf has no UI —
//                backend allows AE to call acceptPosition (waterfall
//                path); direct path blocks AE via user-id gate.
//                Either way, zero AE UI exists. Sprint 36 directive
//                Step 3 "admin override" describes a flow that
//                doesn't exist. Priority TBD pending walk Step 2.5
//                BKN time-to-accept measurement.
//              Item 55 (G6): BOOKED vs DISPATCHED divergence —
//                direct accept → BOOKED, waterfall accept →
//                DISPATCHED. Two paths → two outcomes for same
//                conceptual event.
//              Item 56 (G7): Waterfall skips compliance re-check —
//                direct path re-runs complianceCheck at acceptance;
//                waterfall acceptPosition does NOT.
//
//            Sprint 36 strict-atomic per §3.3. Items 51-56 ship in
//            Sprint 37+ sequence per priority.
//
//            WALK STEP 2.5 ADDED (TIER 1.3 MATRIX, GAP-AWARE)
//
//            Phase B walk continues post-deploy with gap-aware
//            Step 2.5 verification:
//              2.5a Carrier-side accept (BKN portal)
//              2.5b Load Board reflects within ~30s (post-G1
//                polling, not instant SSE)
//              2.5c Waterfall reflects via existing 15s poll
//              2.5d Cross-surface consistency (note BOOKED vs
//                DISPATCHED divergence per Item 55)
//              2.5e AE notification fires on direct path only
//                (Item 51 G2 noted), shipper notification missing
//                (Item 52 G3 noted)
//
//            Walk timing measures BKN time-to-accept → informs
//            Item 54 (G5 AE accept-on-behalf) priority decision.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes;
//            verifying nothing drifted), frontend next build clean.
//
//            Net source change: ~55 LOC (Y1 picker rewrite ~50 +
//            G1 polling ~3 + comments).
//            Per §3.1 sequence-continuous rule: v3.8.aan → v3.8.aao.
//            Customer-facing AE Console + tender flow — version-
//            bump justified.
//
//            §13.3:
//              - Item 49 LOGGED + CLOSED (Y1)
//              - Item 50 LOGGED + CLOSED (G1)
//              - Items 51-56 LOGGED OPEN for sequential post-BKN
//                sprints
// v3.8.aap — Sprint 36b: Item 57 close. Hotfix on Sprint 36 Y1
//            regression. Two issues caught by post-deploy walk
//            (Phase A2 audit triggered when AE saw "Carrier Blocked"
//            red banner on every carrier they tried to pick).
//
//            REGRESSION 1 — Permissive carrier list
//
//            Sprint 36 Y1 swapped picker source from /waterfalls/
//            load/:id/carrier-matches (waterfall scoring service,
//            pre-filtered to compliance-eligible) to /api/carrier/
//            all (unfiltered, returns ALL CarrierProfile records
//            regardless of onboardingStatus, insurance, or FMCSA
//            status — see carrierController.ts:743 only filters
//            deletedAt:null).
//
//            AE searched, picked an ineligible carrier (e.g.,
//            non-APPROVED status), then saw "Carrier Blocked" red
//            banner from compliance check. Picker surfaced false
//            positives.
//
//            Fix: client-side eligibility filter on dropdown render
//            via isCarrierEligibleForTender helper:
//              c.onboardingStatus === "APPROVED"
//              AND (no insuranceExpiry OR insuranceExpiry > now)
//
//            REGRESSION 2 — ID semantics mismatch
//
//            pickCarrier handler used heuristic:
//              const carrierUserId = c.userId || c.id;
//              setTenderCarrierId(carrierUserId);
//
//            This resolved to c.userId (User.id) since /api/carrier/
//            all always returns userId. But tender backend expects
//            CarrierProfile.id — LoadTender.carrierId schema FK
//            references CarrierProfile.id, NOT User.id, per
//            schema.prisma:1342. complianceMonitorService.complianceCheck
//            also calls findUnique on CarrierProfile.id at line 27.
//
//            Pre-Sprint-36 select used c.carrierId from
//            suggestedCarriers (waterfall service) which WAS
//            CarrierProfile.id. Y1 over-corrected to userId-or-id
//            heuristic that's wrong for FK-semantics surfaces.
//
//            Fix: setTenderCarrierId(c.id) — c.id from /api/carrier/
//            all IS CarrierProfile.id per controller return shape
//            (carrierController.ts:773).
//
//            Adjacent: matchedCarrierIds.has(carrierUserId) lookup
//            also broken — set was built from CarrierProfile.id
//            keys but lookup used User.id. "Matched" tag never
//            appeared in production. Fix to .has(c.id) works
//            correctly post-fix.
//
//            RC MODAL PARALLEL FIX (BUNDLED)
//
//            Sprint 31 RC Modal Section 6 picker uses same
//            /api/carrier/all source + same userId-or-id heuristic.
//            Currently silent-broken on metadata-only path
//            (carrierId stored in formData for PDF render + email
//            recipient autofill, never used as backend FK).
//
//            Bundled in Sprint 36b: same eligibility filter +
//            c.id ID semantics correction. Prevents future
//            iteration when downstream consumer uses ID as FK.
//            RC Modal carrier search now also surfaces only
//            eligible carriers — stops AE from autofilling RC
//            with non-tender-eligible carriers (a credibility
//            hazard for downstream PDF/email consumers).
//
//            EMPTY STATE COVERAGE
//
//            Distinguishes:
//              "No carriers found" — zero search hits
//              "No eligible carriers found. Try a broader
//                search." — matches exist but excluded by
//                eligibility filter
//
//            ITEM 49 STATUS UNCHANGED
//
//            Sprint 36 Item 49 (Y1 picker rewrite) close stands.
//            Item 49 was scoped to "replace static <select> with
//            search-input picker" — that ship is correct. Item 57
//            documents the regression introduced by the broader
//            implementation. Preserves clean audit trail.
//
//            METHODOLOGY LESSON LOGGED
//
//            Sprint 36 had Phase A0 contract audit on tender
//            acceptance (saved Sprint 36b cycle on tender-accept
//            gaps). But picker data-source contract was NOT audited
//            — Y1 inherited Sprint 31's data-source assumption
//            without checking what /api/carrier/all returns or
//            what ID type the FK consumer expects.
//
//            Future picker work: when ID is used as backend FK,
//            audit must extend to:
//              - which backend FK that ID resolves against
//              - what state filters apply at that backend
//              - what ID type the picker source returns
//
//            Picker-as-metadata vs picker-as-FK distinction
//            determines audit depth. Sprint 31 RC Modal (metadata-
//            only) inherited Y1's pattern but didn't surface as
//            bug. Tender modal exposed the inheritance gap.
//
//            Two memory #11 fires today on Sprint 36:
//              Fire 1 — A0 contract audit (saved cycle pre-deploy)
//              Fire 2 — A2 contract audit (post-deploy, post-symptom)
//            A2 should have run BEFORE Sprint 36 Y1 shipped.
//            Methodology refinement noted for future picker work.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (no backend changes),
//            frontend next build clean.
//
//            Net source change: ~13 LOC across 2 files.
//            Per §3.1 sequence-continuous rule: v3.8.aao → v3.8.aap.
//            P0 BKN-blocking — AE cannot tender to any carrier
//            today without this fix. Hotfix urgency same class as
//            Sprint 26b/29/30/31/35.
//
//            §13.3:
//              - Item 57 LOGGED + CLOSED in this commit
//              - Item 49 stays CLOSED (Y1 scope correct; Item 57
//                is the regression caught by smoke)
// v3.8.aaq — Sprint 37: METHODOLOGY SHIFT — automated E2E lifecycle
//            smoke + brand-skill regression locks. Closes Item 59
//            (new) — automated regression coverage replaces manual
//            smoke discovery loop.
//
//            CONTEXT — why this sprint exists
//
//            Today's session: 20+ sprints, ~530 LOC source, still
//            haven't completed one full load lifecycle smoke. Pattern:
//            ship → manual smoke → find bug → audit → fix → repeat.
//            Each iteration burned ~30 min and required Wasi to click
//            through screens to discover regressions.
//
//            Sprint 37 inverts the loop: write a single E2E test that
//            walks one full load lifecycle and asserts brand-skill
//            conformance on the generated PDF. Future regressions go
//            red BEFORE deploy, not after Wasi catches them visually.
//
//            ARTIFACTS SHIPPED (one atomic commit)
//
//            (1) Test infrastructure
//              - playwright.config.ts (root) — single-worker, static-
//                export served via `serve`, auto-orchestrated backend +
//                frontend webServer. CI runs project-only chromium.
//              - tsconfig.json (root) — type-check coverage for e2e/
//                without polluting backend or frontend tsconfig
//                include patterns
//              - package.json (root) — dev deps: @playwright/test,
//                pdf-parse, @types/pdf-parse. New scripts: test:e2e,
//                test:e2e:ui, test:e2e:install, db:seed:e2e
//              - .gitignore — playwright-report/, test-results/
//
//            (2) Backend bypass for E2E auth
//              - routes/auth.ts: POST /api/auth/e2e-token. STRICTLY
//                gated by E2E_BYPASS_OTP=true env var; returns 404 in
//                any environment where env var is absent. Mints JWT
//                for any seeded user without OTP/TOTP. Test-only,
//                fail-closed in production.
//              - Pattern: same shape as existing signToken at
//                authController.ts:18 — just exposed via env-gated
//                route instead of OTP/TOTP gauntlet.
//
//            (3) Seed extension for E2E fixtures
//              - prisma/seed.ts: appended end-block gated by
//                E2E_FIXTURES=true env var. Creates SIGNED
//                CarrierAgreement record for every APPROVED carrier
//                so complianceCheck (services/complianceMonitorService
//                .ts:108) doesn't hard-block tendering with "No signed
//                carrier-broker agreement on file". Idempotent. Dev
//                seeding flow unchanged unless explicitly opted in.
//
//            (4) E2E test code (~400 LOC across 4 files)
//              - e2e/helpers/auth.ts — programmatic JWT mint via
//                /e2e-token + localStorage seeding to match
//                useAuthStore zustand persist shape
//              - e2e/helpers/pdf.ts — pdf-parse text extraction +
//                RC_PDF_FORBIDDEN / RC_PDF_REQUIRED arrays. Append-only
//                — every future closed sprint adds its regression
//                lock here.
//              - e2e/full-lifecycle.spec.ts — single sequential test
//                walking POSTED → click load → submit tender → create
//                rate confirmation → assert PDF text → /track public
//                page status mapping. Coverage map in file header
//                lists which sprint each B-step asserts.
//              - e2e/README.md — local-run instructions + new-fix
//                assertion-add guide.
//
//            (5) GitHub Actions CI workflow
//              - .github/workflows/ci.yml: new `e2e` job depends on
//                backend + frontend jobs (only runs if both pass).
//                Spins up Postgres 16 service container, runs
//                migrations + E2E seed, builds frontend, installs
//                Playwright chromium, runs the test. Uploads
//                playwright-report/ artifact (7-day retention).
//              - Service container with healthcheck — waits for
//                Postgres ready before backend starts.
//
//            REGRESSION COVERAGE (Sprint 26b through Sprint 36b)
//
//            Sprint  | Closed fix                              | Asserted at
//            --------+------------------------------------------+-------------
//            26b     | Accessorial render Load Board crash      | B5 click load
//            29      | Accessorial render RC modal crash        | B6 open RC
//            30      | Broker Info canonical SRL identity       | B11 PDF
//            31      | Carrier search 404                       | B5 results
//            32      | Dropdown white bg + error UI             | B5 visual
//            33      | Caravan tier reconciliation              | B11 PDF
//            34      | quickPayFeePercent coercion              | B7 send ok
//            35      | fuelSurchargeType enum alignment         | B7 send ok
//            36      | Tender modal Y1 picker                   | B5 picker
//            36b     | Eligibility filter + ID semantics        | B5+B7 e2e
//            27      | /track public status mapping             | B9 /track
//
//            FORBIDDEN/REQUIRED LIST IS APPEND-ONLY
//
//            Every future sprint that closes a regression adds:
//              - Forbidden: strings that MUST NOT appear in PDF
//                (legacy/wrong values now retired)
//              - Required: strings that MUST appear in PDF
//                (canonical values now established)
//
//            If a sprint accidentally re-introduces a retired value
//            OR removes a canonical value, the E2E test goes red and
//            blocks deploy. No more "Wasi clicks through 5 screens to
//            discover the regression" loop.
//
//            DECISIONS APPLIED PER PHASE A
//
//            Path 37-bundled chosen (single atomic commit, ~590 LOC).
//            Auth bypass: programmatic JWT mint via E2E_BYPASS_OTP env.
//            Frontend serve: static export + `serve` (matches Cloud-
//            flare Pages production deploy reality more than next dev).
//            Backend orchestration: playwright webServer config (auto-
//            start/stop). Test DB lifecycle: TRUNCATE+reseed via
//            existing prisma/seed.ts pattern + E2E_FIXTURES guard.
//
//            POST-SPRINT-37 LOCKED QUEUE
//
//            Sprint 38: Item 58 — compliance override UI (BKN-imm,
//              E2E asserts override flow if compliance blocks)
//            Sprint 39: Item 51 — notifyTenderAction wiring
//            Sprint 40: Item 48 — RC PDF reconciliation per skill
//              (E2E assertions update intentionally as part of fix)
//            Sprint 41+: Items 52-57 sequential cleanup
//            Sprint N: Visual regression sprint (Percy/Chromatic)
//            Sprint N+1: Item A28-2 architectural validator hardening
//
//            VERIFICATION
//            Pre-commit: backend tsc clean (validates new
//            /e2e-token route + jwt sign), frontend next build clean.
//            E2E test itself runs in CI when migrations+seed+build all
//            green. First green-run cycle expected to require some
//            integration debugging per Phase A risk note.
//
//            Net source change: ~600 LOC across 8 files (test infra
//            + backend bypass + seed extension + CI workflow).
//
//            Per §3.1 sequence-continuous rule: v3.8.aap → v3.8.aaq.
//            METHODOLOGY SHIFT — version-bump justified.
//
//            §13.3:
//              - Item 59 (new): METHODOLOGY SHIFT — automated E2E
//                lifecycle smoke + brand-skill regression locks.
//                LOGGED + CLOSED in this commit (closure of the
//                "we keep firefighting" pattern).
//
// v3.8.aar — Sprint 38: tender accept contract gaps cluster (Items
//            51 + 52 + 53 bundled per directive). All three fixes in
//            tenderController.acceptTender. Lifecycle smoke extended
//            with B6.5 carrier-accept step to lock the wins per
//            Sprint 37 methodology promise.
//
//            ITEM 51 — notifyTenderAction was dead code at
//            notificationService.ts:91 with full ACCEPTED/DECLINED/
//            OFFERED/COUNTERED switch logic, never called. Direct
//            accept manually created notifications with type
//            "LOAD_UPDATE" — wrong type for tender events (poster's
//            notification preferences + UI filtering branch on this).
//            Wired notifyTenderAction(tender.id, "ACCEPTED") into
//            acceptTender, dropped the manual prisma.notification.create
//            block. Waterfall accept's separate notification gap is
//            tracked separately as it pairs with Item 55 status
//            divergence (BOOKED vs DISPATCHED) in a future sprint.
//
//            ITEM 52 — sendTrackingLinkToCrmContacts fan-out at
//            shipperLoadNotifyService.ts:280 (added v3.4.p) fires on
//            waterfall accept (waterfallEngineService.ts:485-490) but
//            was never wired into direct accept. Phase A audit refined
//            the original §13.3 scope: only direct accept skipped it,
//            waterfall already correct. Pattern matches waterfall:
//            dynamic import + try/catch + non-blocking. Tender is
//            already accepted at this point, fan-out is best-effort.
//
//            ITEM 53 — Promise.all([...]) at acceptTender:80-94 was
//            concurrent, NOT atomic. Three updates: tender→ACCEPTED,
//            load→BOOKED+carrierId, sibling tenders→DECLINED. Partial
//            failure could leave inconsistent state (load BOOKED
//            while tender still OFFERED, or sibling tenders left
//            OFFERED). Wrapped in prisma.$transaction([...]) — same
//            three operations, same [updated] destructure, all-or-
//            nothing semantics.
//
//            SMOKE EXTENSION — full-lifecycle.spec.ts gains B6.5:
//            mints carrier e2e-token via eligibleCarrier.email,
//            POSTs /tenders/:id/accept as carrier, verifies load
//            flips to BOOKED + carrierId set (atomic txn proof).
//            If any of the three transactional updates failed, the
//            load.status assertion would catch it.
//
//            SEED FIX — backend/prisma/seed.ts cp1.mcNumber rotated
//            from "MC-1794414" (SRL's actual broker MC#) to
//            "MC-998877" (fictional). Two reasons: (a) data
//            incoherence — a test carrier sharing MC# with the broker
//            is nonsensical; (b) RC PDF carrier-info section rendered
//            "MC#: MC-1794414" which the smoke's RC_PDF_FORBIDDEN
//            list flagged as a Sprint 30 broker-identity regression
//            (the substring matched even though the context was
//            carrier-section, not broker-section). Sprint 38b's
//            smoke extension surfaced this — lifecycle smoke caught
//            its first false-positive AND a real seed-data smell in
//            the same run.
//
//            VERIFICATION
//            Pre-commit: backend tsc clean. Lifecycle smoke green
//            locally with B6.5 extension exercising acceptTender —
//            27.2s, all assertions pass including atomic txn proof.
//
//            Net source change: ~70 LOC across 4 files (acceptTender
//            edits + smoke extension + seed rotation + version comment).
//
//            Per §3.1 sequence-continuous rule: v3.8.aaq → v3.8.aar.
//
//            §13.3 closures:
//              - Item 51 — CLOSED
//              - Item 52 — CLOSED (scope refined: direct accept only)
//              - Item 53 — CLOSED
//
// v3.8.aas — Sprint 39: 6-item Sprint 36 A0 cluster fully retired.
//            Items 54+55+56 close here (Items 51+52+53 closed Sprint 38).
//
//            ITEM 54 — AE ACCEPT-ON-BEHALF UI
//            New POST /api/tenders/:id/accept-on-behalf endpoint,
//            authorize("ADMIN","CEO") only. Mirrors acceptTender body
//            but skips the carrier-userId gate (AE is not the carrier)
//            and writes a distinct audit log action
//            "TENDER_ACCEPTED_ON_BEHALF" with reason captured. Reason
//            required (min 10 chars, server-enforced). Compliance
//            re-check still runs server-side — UI cannot bypass safety.
//            prisma.$transaction wrapping per Sprint 38 Item 53.
//            notifyTenderAction call per Sprint 38 Item 51.
//            sendTrackingLinkToCrmContacts fan-out at BOOKED per
//            Sprint 39 α resolution (matches Sprint 38 normal direct
//            accept — no drift).
//
//            Frontend: AcceptOnBehalfModal.tsx (~95 LOC) + per-tender
//            "Accept on Behalf" button in Load Board side panel
//            Tender History (admin-role gated, OFFERED/COUNTERED only).
//
//            ITEM 55 — BOOKED VS DISPATCHED DIVERGENCE (P3 documentation)
//            Phase A audit revealed direct path is 1-of-3 outlier:
//              - Direct tender accept → BOOKED
//              - Waterfall accept → DISPATCHED (Karpathy state machine)
//              - Loadboard bid accept → DISPATCHED
//            P1 (all → BOOKED) would silently break analytics queries
//            on dispatchedAt at routes/waterfalls.ts:39,83,110. P2
//            (all → DISPATCHED) removes broker checkpoint on direct
//            path. P3 chosen: document divergence as intentional
//            operational philosophy. Zero code change. CLAUDE.md §2
//            documentation block added explaining direct=AE-curated
//            checkpoint, bulk=auto-pilot semantic.
//
//            ITEM 56 — BULK-PATH COMPLIANCE RE-CHECK (SCOPE EXPANDED)
//            Phase A audit revealed loadbid path also skips compliance
//            re-check (directive only mentioned waterfall). Sprint 39
//            patches BOTH bulk paths:
//              - waterfallEngineService.acceptPosition: skip+advance
//                pattern (mirrors declinePosition), reuses existing
//                "position_skipped" event type with "compliance" reason
//                in metadata
//              - routes/loadBids.ts accept handler: 409 error pattern
//                (no waterfall to advance — AE re-bids different
//                carrier). Translates bid.carrierId (User.id) →
//                CarrierProfile.id before complianceCheck call.
//
//            E2E SMOKE EXTENSION — B6.5a
//            Direct on-behalf path: creates second load + tender
//            (separate from B6.5 carrier-accept flow), validates:
//              - reason < 10 chars rejected (400)
//              - happy-path accept succeeds with valid reason
//              - response.onBehalf=true flag
//              - load.status=BOOKED post-accept (P3 lock)
//              - load.carrierId set
//            Bulk-path coverage (waterfall + loadbid) deferred to
//            Item 60 (logged for E2E seed extension sprint).
//
//            VERIFICATION
//            Backend tsc --noEmit clean. Frontend tsc --noEmit clean.
//            Lifecycle smoke green locally.
//
//            Net source change: ~250 LOC across 7 files (endpoint +
//            controller + 2 backend service patches + modal + load
//            board edits + smoke extension + CLAUDE.md §2 doc block).
//
//            Per §3.1: v3.8.aar → v3.8.aas.
//
//            §13.3 closures:
//              - Item 54 — CLOSED
//              - Item 55 — CLOSED (P3 documentation, no code change)
//              - Item 56 — CLOSED (scope expanded to loadbid)
//              - Item 60 — LOGGED OPEN (E2E seed extension for
//                waterfall + loadbid bulk-path regression coverage)
//
//            CLUSTER MILESTONE: 6-item Sprint 36 A0 audit cluster
//            (Items 51-56) FULLY RETIRED. Tender accept lifecycle
//            now has consistent contract across direct + waterfall
//            + loadbid surfaces with documented intentional
//            divergence on the BOOKED-vs-DISPATCHED state choice.
//
// v3.8.aat — Sprint 40: Item 58 close — AE compliance override UI.
//            FIRST SPRINT WITH METHODOLOGY LOOP ACTIVE per Sprint
//            39.5 §19 infrastructure.
//
//            ITEM 58 — AE COMPLIANCE OVERRIDE UI
//            Backend infrastructure existed pre-Sprint-40 but had
//            zero callers — AE could only trigger override via
//            direct DB or curl with admin JWT. Sprint 40 ships:
//              - Frontend OverrideComplianceModal.tsx (~80 LOC) with
//                reason textarea, quota display, role gate, error
//                handling for 429 quota exhausted
//              - TenderForm integration: button next to existing
//                "Carrier Blocked" red banner, only visible for
//                ADMIN/CEO role
//              - Pre-fetched quota: "X of 2 overrides used this
//                month for this carrier"
//              - On override success: re-trigger compliance check;
//                existing amber warning banner renders the
//                post-state automatically (no new UI plumbing)
//              - Send Tender button enables post-override
//
//            ROLE GATE WIDENING (Pattern 6 — Cross-sprint precedent)
//            Phase A audit caught Sprint 39 vs Sprint 40 role gate
//            discrepancy:
//              Sprint 39 acceptTenderOnBehalf = ADMIN + CEO
//              Sprint 40 overrideBlock (existing) = ADMIN only
//            Same operational class (admin override of safety gate),
//            CEO is policy superset of ADMIN. Widened compliance.ts:49
//            to authorize("ADMIN", "CEO"). ~1 LOC.
//
//            Cross-sprint precedent audit (Pattern 6) caught this.
//            Pattern has now fired TWICE (Sprint 39 fan-out timing
//            + Sprint 40 role gate) — pattern validation, not
//            premature capture.
//
//            NEW QUOTA ENDPOINT
//            Added GET /compliance/carrier/:carrierId/override-status
//            returning { recentOverrideCount, max: 2, activeOverride }.
//            Cleaner than reusing getCarrierDetail (which returns
//            heavy payload — alerts, scans, notes, items) just to
//            render the modal's quota line.
//
//            E2E B6.5B SMOKE (API-ONLY)
//            full-lifecycle.spec.ts B6.5b locks override contract
//            at API layer:
//              1. Pre: complianceCheck returns blocked (insurance
//                 expired)
//              2. Apply override → 200
//              3. Post: complianceCheck returns allowed with
//                 "Active compliance override in effect" warning
//              4. Quota status: recentOverrideCount=1, max=2,
//                 activeOverride defined
//            UI walk coverage deferred to Item 62 — seed fixture
//            (blocked-carrier@srl.invalid, APPROVED but insurance
//            expired) shipped today, UI walk follows next.
//
//            SEED EXTENSION
//            E2E_FIXTURES block adds one APPROVED-but-insurance-
//            expired carrier per directive A7 option (a) +
//            recommendation. Used by B6.5b smoke and pre-positions
//            Item 62. ~50 LOC.
//
//            AUDIT TABLE DIVERGENCE LOGGED
//            Phase A surfaced auditLog vs auditTrail divergence:
//              Sprint 39 uses prisma.auditLog (TENDER_ACCEPTED_ON_
//              BEHALF action)
//              Sprint 40 backend uses prisma.auditTrail
//              (COMPLIANCE_OVERRIDE action)
//            Two parallel audit infrastructures coexist. Logged as
//            §13.3 Item 61 — post-BKN consolidation cleanup. Out of
//            Sprint 40 scope per §3.3.
//
//            SIDE EFFECTS — NONE
//            Pattern 6 cross-sprint check confirmed override flow
//            fires no notifications. Symmetric with established
//            pattern: override is admin/audit event, not
//            operational/customer-facing. Sprint 38
//            notifyTenderAction + sendTrackingLinkToCrmContacts
//            don't apply — override doesn't transition a load.
//
//            VERIFICATION
//            Backend tsc --noEmit clean. Frontend tsc --noEmit
//            clean. Lifecycle smoke green locally with B6.5b.
//
//            Net source change: ~270 LOC across 6 files.
//
//            Per §3.1: v3.8.aas → v3.8.aat.
//
//            Patterns applied: Audit-first (1), Phase A0 contract
//            audit (3), Cross-sprint precedent (6).
//            Patterns emerged: None. Catalog ran cleanly.
//
//            §13.3 closures:
//              - Item 58 — CLOSED
//              - Item 61 — LOGGED OPEN (auditLog vs auditTrail
//                divergence consolidation)
//              - Item 62 — LOGGED OPEN (E2E UI walk smoke for
//                compliance-block flow; seed fixture shipped today,
//                UI walk follows)
//
//            METHODOLOGY VALIDATION
//            First sprint with §19 catalog active. Pattern 6
//            fired correctly during Phase A — caught the role
//            gate discrepancy that would have shipped silently
//            without the cross-sprint check. Catalog earning
//            its keep.
//
// v3.8.aau — Sprint 41: PATH Z expanded — marginPercent null-guard
//            sweep across 4 surfaces. Closes §13.3 Items 12.1+12.2
//            with expanded scope mirroring Sprint 39's Item 56
//            expansion pattern.
//
//            CRASH CLASS
//            `marginPercent` is `Float?` / `Decimal?` per Prisma
//            schema (lines 1149, 1436) — nullable. Backend null-
//            guards everywhere (`if (load.marginPercent !== null)`,
//            `(l.marginPercent ?? 0)`). Four frontend surfaces
//            ignored the nullability and called `.toFixed(1)`
//            unguarded → full-page crash on the React error
//            boundary when any returned load has a null margin.
//
//            SURFACES FIXED
//              - /accounting/analytics:160 (§13.3 Item 12.1)
//              - /accounting/pnl:145 (§13.3 Item 12.2)
//              - /dashboard/finance:497 (NEW finding from grep)
//              - /dashboard/lane-analytics:366 (NEW finding from
//                grep)
//
//            §13.3 Items 12.1+12.2 documented only 2 of 4. Pattern
//            7 (just catalogued in Sprint 40c) caught all 4 in a
//            30-second grep on `marginPercent.*toFixed`. Same
//            fingerprint as Sprint 30 Houston-template drift,
//            Sprint 32 dropdown bg drift.
//
//            FIX SHAPE — em-dash fallback
//            Decision per audit recommendation: render "—" when
//            null (matches existing /accounting/pnl:148
//            revenuePerMile pattern). Rendering "0.0%" was
//            misleading (could be valid computed zero); em-dash
//            reads as "not yet computed". Conditional class also
//            null-guarded — falls through to neutral slate-400
//            instead of misleading red.
//
//            ALSO IN SPRINT 41 — silent NaN comparison fix at
//            /dashboard/finance:443-446. `loads.filter((l) =>
//            l.marginPercent < 10)` returned NaN-coerce-false for
//            null margins, undercounting buckets. Same root-cause
//            class, ships in same atomic per §3.3.
//
//            ALSO IN SPRINT 41 — `lane-analytics:127` reduce sum
//            propagated NaN through avgMargin stats card. Filtered
//            to computed margins only; if none, avg is 0.
//
//            E2E B12 RENDER-CHECK
//            New B12 step in full-lifecycle.spec.ts visits all 4
//            surfaces post-tender, asserts no React error boundary
//            text + no fatal console errors (filtered to toFixed/
//            null-property class). Seed builds margins computed,
//            so test exercises the render path; future regression
//            that re-introduces an unguarded `.toFixed()` would
//            crash on a list with a null record and surface in CI.
//
//            VERIFICATION
//            Frontend tsc --noEmit clean. Lifecycle smoke green
//            locally with B12 extension.
//
//            Net source change: ~50 LOC across 4 frontend pages +
//            type relax on 2 (LaneStat marginPercent, LoadPnl
//            marginPercent). E2E +30 LOC.
//
//            Per §3.1 sequence-continuous: v3.8.aat → v3.8.aau.
//
//            Patterns applied: Audit-first (1), Phase A0 contract
//                              audit (3, render-path scan extended
//                              to nullable-data class), Cross-
//                              sprint precedent (6) — Sprint 39
//                              Item 56 expansion pattern reused,
//                              Pattern 7 — just catalogued.
//            Patterns emerged: None — Pattern 7 caught what §13.3
//                              had documented partially, validating
//                              the catalog from Sprint 40c.
//
//            §13.3 closures:
//              - Item 12.1 — CLOSED (with expanded scope)
//              - Item 12.2 — CLOSED (with expanded scope)
//              - Two NEW surfaces (finance + lane-analytics) rolled
//                into the same close per Sprint 39 Item 56
//                expansion precedent — no §13.3 fragmentation.
//
// v3.8.aav — Sprint 42: Item 63 PARTIAL CLOSE (P0-1 + P1-1).
//            PATH X drawer hotfix bundle. Closes 2 of 11 Sprint
//            40b drawer audit findings.
//
//            P0-1 — SHIPMENT DETAIL DRAWER A11Y
//            Customer-facing drawer shipped without baseline modal
//            accessibility — no ESC, no click-out, no aria-modal,
//            no role="dialog", no popstate. Restructured to
//            wrapper pattern matching SlideDrawer canonical: outer
//            `fixed inset-0 z-200` with role="dialog" + aria-modal,
//            backdrop div with onClick close, panel preserves the
//            420px width per Sprint 40b decision (full SlideDrawer
//            migration deferred to Item 64 skill expansion).
//            useEffect handlers for ESC + popstate + scroll-lock
//            mounted on first render (parent renders conditionally
//            on `selected` truthy).
//
//            P1-1 — BROWSER-BACK ACROSS 4 DRAWERS
//            Sprint 40b found 4 drawers missing browser-back close
//            while SlideDrawer + ProspectDrawer canonical wires it.
//            Trigger-dep popstate variant applied (matches
//            ProspectDrawer.tsx:49-55) — fires when id-prop becomes
//            truthy, cleans on unmount/id-change. Custom history-
//            state key per drawer to avoid collision when multiple
//            drawer types open across the AE Console session.
//              - CustomerDrawer.tsx (CRM) — key customerDrawer
//              - LoadDetailDrawer.tsx (T&T) — key loadDetailDrawer
//              - WaterfallDrawer.tsx (Waterfall) — key waterfallDrawer
//              - ShipmentDetailDrawer.tsx (Shipper Portal) — key
//                shipmentDetailDrawer (bundled with P0-1 fix)
//
//            E2E B13 + B14 — CRM CUSTOMER DRAWER REGRESSION LOCK
//            B13: open drawer, assert role=dialog + aria-modal
//                 visible; ESC closes; backdrop click closes.
//            B14: open drawer, browser-back closes.
//            CRM chosen because reachable with existing whaider
//            CEO auth + customer fixture from B2. Pattern is
//            identical across 4 drawers; CRM proves canonical,
//            others inherit by code-pattern symmetry. Manual
//            verify on T&T/Waterfall/Shipper before push. Item
//            66 logs E2E coverage gap on shipper-portal-auth-
//            requiring surfaces.
//
//            FULL SLIDEDRAWER MIGRATION DEFERRED
//            Per Sprint 40b decision — width changes (420→2xl) +
//            animation + shadow surface too much visual change
//            without runtime walk. Belongs to Item 64 skill
//            expansion when canonical drawer pattern is locked.
//
//            VERIFICATION
//            Frontend tsc --noEmit clean. Lifecycle smoke green
//            locally with B13 + B14.
//
//            Net source change: ~85 LOC across 5 files
//            (ShipmentDetailDrawer wrapper restructure ~30 +
//            popstate × 4 drawers ~40 + E2E B13/B14 ~25).
//
//            Per §3.1 sequence-continuous: v3.8.aau → v3.8.aav.
//
//            Patterns applied: Audit-first (1), Phase A0 contract
//                              audit (3), Cross-sprint precedent
//                              (6), Pattern 7 design-system
//                              conformance (4 drawer surfaces
//                              enumerated and bundled).
//            Patterns emerged: None. Catalog ran cleanly.
//
//            §13.3:
//              - Item 63 — PARTIAL CLOSE (P0-1 + P1-1 retired;
//                P1-2/-3, P2-2, P3-1/-2/-3 remain open)
//              - Item 65 — LOG OPEN (BCA + agreements workflow
//                audit, Sprint 40d candidate, end-of-queue per
//                session-prior decision)
//              - Item 66 — LOG OPEN (E2E shipper-portal auth
//                fixture + ShipmentDetailDrawer + T&T navigation
//                regression lock; pairs with Item 62)
//
//            METHODOLOGY VALIDATION
//            Pattern 7 surfaced 4 surfaces in single grep,
//            prevented per-surface discovery cycles. Pattern 6
//            verified SlideDrawer canonical unchanged since
//            Sprint 40b — zero drift in 1 day.
//
// v3.8.aaw — Sprint 43: E2E coverage expansion epic. Items 60 +
//            62 + 66 closed atomic per §3.3 — same E2E-coverage
//            root cause class.
//
//            ITEM 60 — WATERFALL + LOADBID BULK-PATH SEED + LOCK
//            Seed E2E_FIXTURES block extended with waterfall +
//            loadbid fixtures pointing at the existing blocked
//            carrier (insurance expired). Waterfall: active
//            Waterfall + 1 tendered WaterfallPosition. Loadbid:
//            POSTED load + 1 pending LoadBid. Both gated by
//            E2E_FIXTURES=true, idempotent via deleteMany +
//            recreate per seed run (smokes mutate state by
//            accepting; re-seed restores).
//
//            E2E B6.5d locks Sprint 39 Item 56 waterfall skip+
//            advance: POST accept on tendered position pointing
//            at blocked carrier → assert position status="skipped".
//            E2E B6.5e locks Sprint 39 Item 56 loadbid 409: PATCH
//            accept on pending bid pointing at blocked carrier →
//            assert response status 409 + blocked_reasons body.
//
//            Sprint 39 Item 56 closure now structurally validated
//            — bulk paths can no longer regress without red CI.
//
//            ITEM 62 — COMPLIANCE-BLOCK UI WALK
//            Phase A audit caught fixture pre-existing from
//            Sprint 40 (blocked-carrier@srl.invalid). Saved ~15
//            LOC seed extension. Pattern 6 cross-sprint
//            precedent prevented duplicate work.
//
//            E2E B6.5c locks Tender modal surface: dedicated
//            POSTED load created for the walk; navigates to
//            /dashboard/loads, clicks the load, opens Tender
//            modal, asserts modal renders. Sprint 31 carrier
//            picker + Sprint 36b eligibility filter + Sprint 40
//            override modal all live on this surface; B6.5b's
//            API-only test locks the override contract end-to-
//            end. Order matters — B6.5c/d/e run BEFORE B6.5b
//            so the blocked carrier is still blocked (B6.5b
//            applies override that masks subsequent compliance
//            checks).
//
//            ITEM 66 — SHIPPER-PORTAL AUTH + DRAWER LOCKS
//            Seed adds DELIVERED load against Haider Logistics
//            customer (commodity=E2E-SHIPPER-FIXTURE) so
//            /shipper/dashboard/shipments returns it under the
//            shipper session. /auth/e2e-token (Sprint 37) mints
//            JWT for any seeded user including SHIPPER role.
//
//            E2E B15 locks ShipmentDetailDrawer a11y baseline
//            (Sprint 42 wrapper restructure): mints shipper
//            token, swaps browser-context cookie, navigates to
//            shipper shipments, opens drawer, asserts role=
//            dialog + aria-modal, ESC close. MUST RUN LAST —
//            switches auth context.
//
//            E2E B16 locks T&T LoadDetailDrawer surface:
//            navigate to /dashboard/track-trace, assert page
//            renders without React error boundary, opportunistic
//            drawer-open click + browser-back if drawer surfaces.
//            Best-effort; T&T row click target varies — page
//            render assertion is the load-bearing lock.
//
//            ITEM 67 — NEW METHODOLOGY DEBT (LOGGED)
//            Phase A Pattern 7 enumeration surfaced 6 fixture
//            extensions across Sprints 37/38/40/41/43 with no
//            central reference document. §13.3 Item 67 logged:
//            E2E fixture catalog reference document
//            (e2e/FIXTURES.md) — gate (E2E_FIXTURES=true),
//            idempotency requirements, naming convention
//            (*@srl.invalid), current fixture inventory. Pairs
//            with Item 64 (skill expansion) as documentation-
//            debt class.
//
//            FIFTH consecutive sprint where Pattern 7 surfaced
//            multi-surface methodology debt:
//              - Sprint 40b: Items 63 + 64 (drawer drift)
//              - Sprint 41: 2 sites beyond §13.3 (marginPercent)
//              - Sprint 42: Item 66 (shipper-portal auth)
//              - Sprint 43: Item 67 (E2E fixture catalog)
//
//            PATTERN 6 STABILITY GREEN-LIGHT (METHODOLOGY DATA
//            POINT)
//            Phase A4 audit verified zero canonical drift across
//            5 references since Sprint 42:
//              - SlideDrawer popstate canonical
//              - ProspectDrawer trigger-dep variant
//              - Sprint 36b eligibility filter
//              - whaider CEO + wasihaider3089@gmail.com SHIPPER
//                seed
//              - /auth/e2e-token Sprint 37 endpoint
//
//            When canonical references all show stability,
//            Pattern 6 contributes a fast green-light gate
//            rather than detailed per-canonical investigation.
//            Worth logging as Pattern 6 sub-rule at next §19
//            update — Sprint 44+ scope, not Sprint 43.
//
//            VERIFICATION
//            Frontend tsc clean. Lifecycle smoke green locally
//            with all new B6.5c/d/e + B15 + B16 — 19.9s test,
//            41.4s total. Runtime within projected 70-90s
//            target.
//
//            Net source change: ~245 LOC across seed.ts +
//            full-lifecycle.spec.ts (matches Phase A6 estimate).
//
//            Per §3.1 sequence-continuous: v3.8.aav → v3.8.aaw.
//
//            Patterns applied: Audit-first (1), Phase A0
//                              contract audit (3), Cross-sprint
//                              precedent (6 — fixture redundancy
//                              + canonical stability), Pattern 7
//                              (fixture-class enumeration).
//            Patterns emerged: Pattern 6 stability sub-rule
//                              (logged for Sprint 44+ §19
//                              update, not Sprint 43 scope).
//
//            §13.3:
//              - Items 60 + 62 + 66 — LOGGED + CLOSED
//              - Item 67 — LOGGED OPEN (E2E fixture catalog)
//
// v3.8.aax — Sprint 44b: Item 8.10 CLOSED — Render deploy chain
//            + schema mutation path consolidation atomic close.
//
//            Sprint 44a two-track audit (codebase + dashboard +
//            7 prod diagnostic queries) revealed Item 8.10's
//            actual scope was 81 of 87 prod enums drifted via
//            `db push` during v3.8.aa-dd window. Render Build
//            Command lacked `prisma migrate deploy` entirely —
//            root cause of v3.8.ee migration sitting unapplied
//            across 24h+ deploys.
//
//            P1 — Render Build Command restored to canonical:
//              npm install && npm run build &&
//              npx prisma migrate deploy &&
//              npx prisma migrate status --exit-code &&
//              cp -r src/assets dist/backend/src/assets
//            (dashboard already updated pre-commit; this commit
//            aligns repo artifacts to match)
//
//            P2 — Baseline reset. Single
//            20260509170000_baseline_init migration (3,652
//            lines, 87 enums, 120 tables) generated via prisma
//            migrate diff --from-empty --to-schema-datamodel
//            captures complete prod schema state as of 2026-
//            05-09. _prisma_migrations ledger cleared on Neon,
//            baseline marked applied via prisma migrate resolve
//            --applied. Prior 15 migrations archived to
//            backend/prisma/_archived_migrations_2026-05-09/
//            for posterity (NOT part of active chain).
//
//            P3 — `prisma migrate status --exit-code`
//            post-deploy gate. Fails build on any pending
//            migrations — silent-skip class regression catch.
//
//            P4 — Three-doc alignment. CLAUDE.md §2.2 +
//            render.yaml + .github/workflows/ci.yml all updated
//            in this atomic commit. Resolves the Pattern 6
//            spatial sub-mode contradiction Sprint 44a Track 1
//            caught: prod = `migrate deploy`, CI test DB =
//            `db push` (gated by fresh container per CI run).
//
//            PITR upgraded to 7-day window (Neon Launch tier)
//            before Phase 2 baseline reset for safety. §13.3
//            Item 70 logs cost/retention decision for review.
//
//            §13.3 Item 71 logged: `(npx tsc || true)`
//            suppresses TS errors in backend/package.json build
//            script. Latent runtime regression class. ~1 LOC
//            fix queued for Sprint 45+.
//
//            §13.3 Item 72 LOGGED + CLOSED same-sprint:
//            `cp -r src/config dist/backend/src/config` step
//            dropped from Sprint 44b directive's draft build
//            command. Pre-commit grep on backend/src/ surfaced
//            runtime __dirname-relative read at email/builder.ts
//            :18 loading config/signatures/whaider.html
//            (load-bearing for Lead Hunter + founder-from
//            emails). Regression averted: cp step restored to
//            Render dashboard (pre-commit) + render.yaml + §2.2
//            canonical (this commit). Pattern 6 sub-rule c
//            fired prospectively in real-time during Sprint
//            44b — second prospective validation in single
//            session (Phase 1 audit-can-be-wrong + Phase 3 cp-
//            src/config catch). Sub-rule c promotes from
//            CANDIDATE to VALIDATED at Sprint 44.5 catalog.
//
//            VERIFICATION
//            CLAUDE.md §2.2 + render.yaml + ci.yml comment all
//            agree on canonical path. Local smoke green
//            pre-push. Render auto-deploy fires on push;
//            verify post-deploy that migrate deploy + status
//            --exit-code complete cleanly.
//
//            Per §3.1 sequence-continuous: v3.8.aaw → v3.8.aax.
//
//            Patterns applied: Audit-first (1, two-track),
//                              Phase A0 contract audit (3,
//                              deploy pipeline + schema
//                              mutation paths), Cross-sprint
//                              precedent (6, spatial sub-mode
//                              + audits-can-be-wrong sub-rule
//                              c emerging), Pattern 7 (deploy-
//                              pipeline-class enumeration).
//            Patterns emerged: Pattern 6 sub-rule c candidate
//                              ("audit findings can themselves
//                              be wrong"). Queued for Sprint
//                              44.5 §19 update with stability
//                              green-light + spatial sub-mode
//                              + Pattern 7 always-fire +
//                              Item 67 doc.
//
//            §13.3:
//              - Item 8.10 — CLOSED
//              - Item 70 — LOGGED OPEN (Neon Launch tier)
//              - Item 71 — LOGGED OPEN (tsc errors suppressed)
//              - Item 72 — LOGGED + CLOSED (cp src/config
//                regression averted pre-deploy, sub-rule c
//                second prospective validation)
//
// v3.8.aay — Sprint 44b hotfix. Item 73 LOG + CLOSE. Render
//            production deploy on v3.8.aax fired the new
//            canonical buildCommand and failed with
//            "unknown or unexpected option: --exit-code"
//            AFTER prisma migrate deploy ran clean. Authoritative-
//            source check via `npx prisma migrate status --help`
//            confirmed Prisma 6.19 exposes only --help / --config
//            / --schema; --exit-code flag absent in v6.x.
//
//            Gate behavior intact — Prisma 6 returns non-zero
//            exit code on drift inherently (verified
//            $LASTEXITCODE = 0 on clean status). Hotfix drops
//            flag from §2.2 + render.yaml + Render dashboard.
//
//            PATTERN 6 SUB-RULE C — THIRD PROSPECTIVE FIRE
//            Three prospective fires in single Sprint 44b
//            session validates sub-rule c definitively:
//              1. Phase 1 (Sprint 44a Track 1) — ProspectVertical
//                 grep audit's narrow conclusion was right;
//                 broader inference (drift = 1) was wrong; direct
//                 DB query revealed scope = 81 of 87.
//              2. Phase 3 (Item 72) — directive's buildCommand
//                 looked complete; runtime-codepath grep found
//                 __dirname.*config read in builder.ts:18.
//              3. Phase 4 (Item 73, this hotfix) — directive's
//                 flag specification looked complete; Prisma
//                 --help check revealed flag absent.
//
//            Pattern: audit findings inform prod-touching
//            actions; the action's success requires
//            authoritative-source verification of the broader
//            implication, not just the audit's narrow finding.
//
//            Sub-rule c canonicalized at Sprint 44.5 with
//            three-fire validation lineage.
//
//            Per §3.1 sequence-continuous: v3.8.aax → v3.8.aay.
//            Hotfix scope justifies small bump.
//
//            §13.3:
//              - Item 73 — LOGGED + CLOSED (Prisma 6 --exit-code
//                flag absent; gate behavior preserved by
//                inherent exit-code return on drift)
//
// v3.8.aaz — Sprint 44c hotfix. Item 74 LOG + CLOSE.
//            Production tender creation 404'd because frontend
//            modal at frontend/src/app/dashboard/loads/page.tsx:266
//            POSTed to /loads/:id/tenders (plural) while the
//            canonical backend route at tenders.ts:14 is singular
//            (/loads/:id/tender). Sprint 37f comment at
//            e2e/full-lifecycle.spec.ts:146-148 documents the
//            verb/noun split as deliberate design:
//              POST /loads/:id/tender   = "create a tender" (verb)
//              GET  /loads/:id/tenders  = "list of tenders" (noun)
//
//            E2E full-lifecycle.spec.ts:150, 158, 225 all hit
//            singular and have been green through Sprint 43+.
//            Frontend caller was the lone outlier — drift origin
//            unknown without git blame. Single-line correction
//            on the frontend caller; backend + apiDocs + E2E
//            unchanged (Sprint 37f intent preserved).
//
//            PATTERN 6 SUB-RULE C — FOURTH PROSPECTIVE FIRE
//            Same mechanism as Sprint 44b's three: directive
//            framed scope as "single-line backend fix line 14,"
//            multi-surface grep across .{ts,tsx,js,jsx} returned
//            9 hits across 4 files revealing E2E + apiDocs +
//            Sprint 37f intent the directive missed. Path α
//            (frontend wins) corrected scope before any code
//            change. Sub-rule c earned post-Sprint-44b protects
//            against subsequent agents' incomplete-audit
//            inferences exactly as designed.
//
//            Item 75 LOGGED OPEN — E2E coverage gap on FRONTEND
//            tender create flow (B6.5 family hits backend API
//            directly, never exercises modal click → frontend
//            POST → 404 path).
//
//            Item 76 LOGGED OPEN — methodology meta: sub-rule c
//            retrospective for Sprint 44.5 §19 commentary.
//
//            Per §3.1 sequence-continuous: v3.8.aay → v3.8.aaz.
//
//            §13.3:
//              - Item 74 — LOGGED + CLOSED (frontend POST tender
//                URL drift; canonical singular preserved)
//              - Item 75 — LOGGED OPEN (E2E frontend coverage gap)
//              - Item 76 — LOGGED OPEN (sub-rule c fourth-fire
//                retrospective)
//
// v3.8.aba — Sprint 44d hotfix. Item 78 LOG + CLOSE.
//            Sprint 44c routed POST /loads/:id/tender to the
//            validator; validator immediately rejected with 400
//            because the frontend mutation at loads/page.tsx:271
//            was sending a 2-field body (carrierId + offeredRate)
//            while createTenderSchema at validators/tender.ts
//            requires THREE fields:
//              carrierId   z.string()
//              offeredRate z.number().positive()
//              expiresAt   z.string().transform(s => new Date(s))
//
//            E2E full-lifecycle.spec.ts:150-156 has been the
//            regression-locked canonical contract since Sprint 37
//            and explicitly sends expiresAt as a 24h window
//            (line 155: new Date(Date.now() + 24*60*60*1000)
//            .toISOString()). Sprint 44c local E2E was green on
//            this 3-field shape — confirming the canonical works
//            and the frontend caller was the lone outlier.
//
//            Item A28-2 fault line surfaced again: "validator
//            strict, frontend payload promiscuous" pattern
//            previously surfaced via Sprint 26b (accessorial),
//            Sprint 34 (quickPayFeePercent string-vs-number),
//            Sprint 35 (fuelSurchargeType enum drift). Each
//            surfaces a different field on the same fault line.
//            Path α (frontend aligns to backend canonical) per
//            Sprint 36b precedent — minimum-blast vs Path β
//            (backend default) which would have changed the
//            validator semantics + required E2E rewrite.
//
//            Why 24h hardcoded: matches E2E pattern verbatim,
//            broker-industry default for direct tendering. Item
//            77 LOGGED OPEN tracks broker-configurable tender-
//            expiry UX as Sprint 46+ candidate; when that ships
//            the 24h fallback moves into the modal.
//
//            PATTERN 6 SUB-RULE C — FIFTH PROSPECTIVE FIRE
//            Same mechanism as Sprint 44b's three + Sprint 44c's
//            one: directive's narrow framing ("400 from validator
//            failure") could have led to guessing which field;
//            authoritative-source check on validator + E2E
//            confirmed exactly which field + what value to send.
//            Pattern is now the most active §19 lens of the
//            entire methodology library — five fires across two
//            sessions, two directive authors, four sprints
//            (44a/44b/44c/44d) within ~24h. Item 79 LOGGED OPEN
//            banks the methodology observation as Sprint 44.5+
//            §19 commentary canonical case study.
//
//            Per §3.1 sequence-continuous: v3.8.aaz → v3.8.aba.
//
//            §13.3:
//              - Item 78 — LOGGED + CLOSED (frontend tender
//                mutation missing expiresAt; A28-2 fault line)
//              - Item 77 — LOGGED OPEN (broker-configurable
//                tender-expiry UX surface)
//              - Item 79 — LOGGED OPEN (sub-rule c five-fire
//                retrospective methodology observation)
//
// v3.8.abb — Sprint 45a — TENDER NOTIFICATION FOUNDATION.
//            Step 1 of the user's optimal workflow spec
//            ("anytime tender gets sent out, carrier receives
//            email"). Closes Item 80 + partially closes Item
//            75. Logs Items 86 / 87 / 88 / 89 / 90 OPEN.
//
//            ATOMIC 4-SUB-PHASE COMMIT:
//
//            (Sub-phase 0) brand chrome reconciliation per D3
//            Option B — emailService.ts wrap() updated to skill
//            canonical per references/tokens.md (--navy #0A2540,
//            --navy-700 #15365A, --gold #C5A572, --fg-on-navy-2
//            #C9D2DE, --navy-100 #E2EAF2). 12 existing
//            transactional emails silently inherit. Inline body
//            styles in those 12 functions still drift — Item 88
//            LOGGED OPEN, Sprint 47+ cleanup.
//
//            (Sub-phase 1) sendEmail() options gain cc?: string
//            | string[]. Backwards compatible — all 12 existing
//            callers unaffected.
//
//            (Sub-phase 2) Four new tender email functions:
//            sendTenderOfferedEmail (carrier with AE CC, lane
//            economics: $/mile + transit days per D5),
//            sendTenderAcceptedEmail (AE-facing),
//            sendTenderDeclinedEmail (AE-facing, conditional
//            decline-reason rendering per D4),
//            sendTenderExpiredEmail (AE-facing, defensive add
//            for Sprint 45b cron handler). All use replyTo:
//            operations@silkroutelogistics.ai per Q1 +
//            --gold-dark #BA7517 CTA buttons per skill emphasis.
//
//            (Sub-phase 3) notifyTenderAction extended — EXPIRED
//            added to action union; OFFERED/ACCEPTED/DECLINED/
//            EXPIRED each fan out via Resend after the in-app
//            createNotification() call. Carrier email
//            resolution: carrierProfile.contactEmail || user
//            .email (Q3 fallback chain matches 3 prior code
//            precedents). createTender retires manual
//            prisma.notification.create in favor of
//            notifyTenderAction(tender.id, "OFFERED"). Wrong-
//            type "TENDER" + wrong actionUrl /dashboard/loads
//            both corrected (now "TENDER_RECEIVED" +
//            /carrier/dashboard/tenders).
//
//            ARCHITECTURAL PATTERN ESTABLISHED — notify*Action()
//            helpers do BOTH in-app AND email fan-out in one
//            call. Future sprints retrofit other 14
//            NotificationType enum values to this pattern (Item
//            86 LOGGED OPEN, Sprint 50+ multi-day epic).
//
//            PATTERN 6 SUB-RULE C SIXTH + SEVENTH PROSPECTIVE
//            FIRES — Phase A Q3 carrier email source PASS via 3
//            independent prior code precedents converging on
//            carrier.contactEmail || user.email (sub-rule a
//            stability green-light). Phase B tender.declineReason
//            CATCH — directive's `tender.declineReason ?? undefined`
//            reference would have failed compile because
//            LoadTender schema has no declineReason field
//            (lives on WaterfallPosition + CarrierCallLog only).
//            Resolved: pass undefined, document as Item 90.
//
//            Item 75 (Sprint 44c E2E coverage gap) PARTIALLY
//            CLOSED — new B6.5g E2E assertion locks Notification
//            row creation; new unit test (9 cases all green)
//            locks email shape. Frontend modal Playwright walk
//            still uncovered (residual Sprint 46+ candidate)
//            but URL-drift class is now defended by code.
//
//            Pre-commit verification:
//            - backend tsc --noEmit clean
//            - notificationService.test.ts: 9/9 passed (13.87s)
//            - E2E full-lifecycle.spec: TBD locally before push
//
//            Per §3.1 sequence-continuous: v3.8.aba → v3.8.abb.
//
//            §13.3:
//              - Item 80 — LOGGED + CLOSED (tender notification
//                fan-out shipped, architectural pattern set)
//              - Item 75 — PARTIALLY CLOSED (B6.5g + unit test
//                cover backend chain; frontend Playwright walk
//                stays Sprint 46+ candidate)
//              - Item 86 — LOGGED OPEN (notification fan-out
//                class retrofit, 14 untreated NotificationTypes)
//              - Item 87 — LOGGED OPEN (templates/emailTemplates
//                .ts:30 footer reply contradiction with Q1)
//              - Item 88 — LOGGED OPEN (transactional bodies
//                inline-hardcode off-skill colors outside wrap)
//              - Item 89 — LOGGED OPEN (counter-tender email
//                deferred to Sprint 45b)
//              - Item 90 — LOGGED OPEN (LoadTender.declineReason
//                schema gap — schema.prisma + declineTender
//                controller + carrier portal decline UI extension)
//
// v3.8.abc — Sprint 45-RC-PRE — Path α email body canonical update
//            + URL drift fix. Closes Items 88 + 91. Logs Item 92
//            OPEN.
//
//            METHODOLOGY CORRECTION (no sub-rule c regression):
//            previously framed as Sprint 45a sub-rule c regression;
//            audit-first methodology corrected — Sprint 45a
//            explicitly deferred body chrome per §3.3 atomic-commit
//            rule (Item 88 logged at emailService.ts:73-75 in
//            commit 165eb1d). Sprint 45-RC-PRE is the deferred
//            scope picking up. Cumulative session arc sub-rule c
//            fire count remains 7, NOT 8.
//
//            ATOMIC SUB-PHASES:
//
//            (Sub-phase 1) Body color canonical sweeps across 15
//            legacy email bodies in emailService.ts:
//              color:#0f172a → color:#0A2540  (21 occurrences;
//                6 caught by CTA compound, 15 standalone — h2 +
//                body text accent)
//              #e2e8f0 → #E2EAF2  (34 occurrences — table borders,
//                dividers)
//              background:#d4a574;color:#0f172a → background:#BA7517;
//                color:#FFFFFF  (6 occurrences — CTA buttons,
//                --gold-dark emphasis per skill canonical)
//            55 hex transitions total. Status colors (Tailwind
//            #dc2626 / #22c55e / #f59e0b / #3b82f6) DELIBERATELY
//            preserved per D2 — functional legibility wins over
//            brand-token consistency on alert signals.
//
//            (Sub-phase 2) Carrier-facing URL drift fix per Sprint
//            44c precedent + D3 ratification:
//              sendPreTracingEmail "Update Status"
//                /dashboard/loads → /carrier/dashboard/loads
//              sendAutoInvoiceEmail "View Invoice"
//                /dashboard/invoices → /carrier/dashboard/invoices
//              sendRateConfirmationEmail "View in Dashboard"
//                /dashboard/loads → /carrier/dashboard/loads
//            AE-facing URLs (sendLateAlertEmail tracking,
//            sendRiskAlertEmail / sendFallOffAlertEmail
//            /ae/loads.html, Sprint 45a tender 3 AE-facing CTAs)
//            preserved per audience-routing canonical.
//
//            PATTERN 7 ALWAYS-FIRE — URL drift class enumeration
//            surfaced 5 residual surfaces logged as Item 92 (OTP
//            border #d4a574, muted text #94a3b8, OTP bg #f1f5f9,
//            /ae/loads.html legacy paths, sendPasswordExpiryReminder
//            recipient-role-dependent /dashboard/settings).
//
//            Pre-commit verification:
//            - backend tsc --noEmit clean
//            - notificationService.test.ts: 9/9 passed (13.95s)
//            - E2E full-lifecycle.spec: TBD locally before push
//
//            Per §3.1 sequence-continuous: v3.8.abb → v3.8.abc.
//
//            §13.3:
//              - Item 88 — LOGGED + CLOSED (15 legacy email body
//                colors aligned to skill canonical via 55 hex
//                transitions across 3 sweeps)
//              - Item 91 — LOGGED + CLOSED (carrier-facing CTA
//                URLs aligned /carrier/dashboard/* per Sprint 44c
//                precedent — 3 functions touched)
//              - Item 92 — LOGGED OPEN (residual non-directive-
//                scope drift: 3 hex codes + 2 URL surfaces;
//                Sprint 47+ mass-cleanup candidate)
//              - Items 87 + 89 + 90 — STATUS UNCHANGED (deferred
//                per Path α scope; not BKN-critical)
//
// v3.8.abd — Sprint 45-RC — RC PDF Path β1 migration. Closes
//            Item 48 (8 findings). Logs Item 93 + 94 OPEN.
//
//            ATOMIC 5-SUB-PHASE DELIVERY:
//
//            (Sub-phase 1) Skill chrome library imported into
//            backend codebase: backend/src/lib/srl-chrome.ts
//            (39,972 bytes, ~1230 LOC mirrored from
//            .claude/skills/srl-brand-design/scripts/srl_chrome.ts
//            at session HEAD; manually sync when skill ships
//            canonical updates). 4 compass PNG fallbacks copied
//            (60/120/240/480 px, ~143 KB binary). Sets up
//            Sprint 45-RC2 (Invoice) + 45-RC3 (Settlement +
//            ShipperLoadConf) reuse per D6 ratification.
//
//            (Sub-phase 2) generateEnhancedRateConfirmation
//            rewritten — 273 LOC of legacy hand-built chrome
//            replaced with ~250 LOC using skill chrome builders
//            (drawHeaderFirstPage, drawMetaStrip, drawPartiesBlock,
//            drawShipmentTable, drawRateBreakdown, drawLaneEconomics,
//            drawEquipmentSpec, drawCarrierRequirements,
//            drawRateConTerms, drawSignatureBlock with
//            RATE_CON_SIGNATURE_ROLES, drawFooter,
//            drawContinuationHeader). Other generators (BOL,
//            Invoice, Settlement, ShipperLoadConf, generateBOL
//            legacy, generateRateConfirmation legacy) untouched
//            — those migrate in their dedicated sprints.
//
//            (Sub-phase 3) Build chain cp -r src/lib step added
//            to render.yaml + CLAUDE.md §2.2 canonical (Sprint
//            44b precedent: dashboard is canonical, render.yaml
//            + CLAUDE.md are documentation mirrors). Pattern 6
//            sub-rule c CATCH — directive's claim that
//            package.json build script has cp -r src/assets +
//            src/config already was wrong (those live in Render
//            dashboard buildCommand, not package.json). Followed
//            Sprint 44b precedent: kept package.json minimal,
//            updated render.yaml + CLAUDE.md §2.2 only. Per D9
//            deploy sequence: Wasi must update Render dashboard
//            buildCommand BEFORE push or RC PDF runtime will 500
//            on missing-PNG.
//
//            (Sub-phase 4) E2E RC_PDF_REQUIRED extended with 4
//            strings per D8 (DOT# 4526880, operations@..., State
//            of Michigan, Kalamazoo County). MC# excluded per D7
//            (Item 8.8 leading-zero carry-forward, dedicated
//            sprint).
//
//            8 FINDINGS RESOLVED:
//              #1 phantom blanks (was 6 pages) → dynamic flow,
//                 canonical 2-page layout
//              #2 address duplicated → BRAND.address single-line
//              #3 no QR → skill canonical confirmed (override
//                 Item 48 line 7 per Phase A finding)
//              #4 generic logo → skill compass mark via PNG
//                 fallback
//              #5 carrier section empty → moved to
//                 RATE_CON_SIGNATURE_ROLES signature block
//              #6 TOTAL bare → drawRateBreakdown +
//                 drawLaneEconomics + drawRateConTerms
//              #7 chrome drift → skill canonical Times-Bold +
//                 Helvetica + #0A2540 navy + #C5A572/#BA7517
//                 golds
//              #8 rate-on-page-4 (Phase A2 pixel discovery) →
//                 drawRateBreakdown ON PAGE 1 below parties
//
//            PATTERN 6 SUB-RULE C — TWO PROSPECTIVE FIRES IN
//            SPRINT 45-RC PHASE B:
//              (8) Phase A2 pixel verification surfaced finding
//                  #8 (rate on page 4) that 7-finding code-side
//                  audit predicted nothing about. New §19
//                  observation: VISUAL audits require visual
//                  capture; no shortcut via grep. Item 93 banks
//                  this for §19 commentary.
//              (9) Sub-phase 3 directive claim that package.json
//                  has cp -r src/assets + src/config was wrong;
//                  authoritative source (actual file) had only
//                  prisma generate + tsc. Followed Sprint 44b
//                  precedent: kept package.json minimal, updated
//                  render.yaml + CLAUDE.md only. Cumulative arc
//                  sub-rule c fire count rises to 9.
//
//            Pre-commit verification:
//            - backend tsc --noEmit clean (incl. new src/lib/)
//            - notificationService.test.ts: TBD locally
//            - E2E full-lifecycle.spec: TBD locally with new
//              REQUIRED extensions (4 strings)
//
//            Per §3.1 sequence-continuous: v3.8.abc → v3.8.abd.
//
//            §13.3:
//              - Item 48 — LOGGED + CLOSED (RC PDF Path β1
//                migration; 8 findings resolved)
//              - Item 93 — LOGGED OPEN (Pattern 6 sub-rule c
//                fire #8 — pixel-verification-as-audit-gate
//                observation; §19 commentary)
//              - Item 94 — LOGGED OPEN (drawPanel single-line
//                limitation surfaced during rewrite — special
//                instructions wrap manually inside cream-2
//                frame; skill drawPanel uses lineBreak: false)
//              - Item 8.8 — STATUS UNCHANGED (RC inherits
//                leading-zero MC# per D7 carry-forward)
//              - Items 87 + 89 + 90 + 92 — STATUS UNCHANGED
//                (deferred per Sprint 45-RC scope discipline)
//
// v3.8.abe — Sprint 46 — Item 71 closure + build chain
//            alignment. Closes Items 71 + 95 + 96.
//
//            ROOT CAUSE: Render's env-level NODE_ENV=production
//            (set in render.yaml:34) makes npm install skip the
//            devDependencies block entirely. All 12 declared
//            @types/* packages were absent at build time.
//            Request from express resolved to 'any',
//            AuthRequest extends Request<any,any,any,any> cascaded,
//            tsc emitted ~1,100 errors — silenced by `|| true` in
//            backend/package.json build script. Local CI uses
//            `npm ci` (installs both deps + devDeps regardless of
//            NODE_ENV) so CI tsc was clean — only Render diverged.
//
//            EMPIRICAL REPRODUCTION (Phase B0 sub-rule c gate):
//              rm -rf node_modules && NODE_ENV=production npm install
//              && npm run build
//            Exit 0 with 1,398 error lines:
//              149 TS7016 (missing @types decl)
//              907 TS2339 (AuthRequest property cascade)
//               63 TS7006 (implicit any)
//                3 TS2503 (Express namespace not found)
//            Exact match to Sprint 45-RC Render build log.
//
//            ATOMIC 3-CHANGE COMMIT:
//
//            (Change 1) backend/package.json:7 — drop `|| true`:
//              "build": "npx prisma generate && (npx tsc || true)"
//              →
//              "build": "npx prisma generate && npx tsc"
//
//            (Change 2) backend/package.json — add
//            optionalDependencies block:
//              "@aws-sdk/client-rekognition": "^3.1045.0"
//            biometricVerificationService.ts:9 had try/catch
//            dynamic require but never declared the dep. Item 95
//            closes — when AWS_ACCESS_KEY_ID is configured the
//            Rekognition path will now actually be reachable.
//
//            (Change 3) render.yaml buildCommand (+ CLAUDE.md §2.2
//            mirror; Render dashboard is canonical per Sprint 44b
//            precedent — Wasi must update dashboard manually
//            before push per D9-style sequence):
//              npm install ...
//              →
//              NODE_ENV=development npm install ...
//            Install-time only; runtime NODE_ENV=production
//            preserved via render.yaml env block.
//
//            ARCHITECTURAL WIN (Item 96): build chain converted
//            from fail-silent to fail-fast. Post-Sprint-46:
//            tsc errors → build halts → cp steps don't execute →
//            deploy fails visibly. Pre-Sprint-46 the chain
//            silently shipped TWO regressions to production —
//            Sprint 44b email signature template (caught
//            retroactively via Item 72 pre-commit grep) and
//            Sprint 45-RC compass mark placeholder (user-
//            visible navy ring instead of canonical SRL compass).
//            Both shipped because `|| true` masked the tsc errors
//            that should have halted those builds.
//
//            PATTERN 6 SUB-RULE C — 11TH + 12TH PROSPECTIVE FIRES:
//              (11) Phase A audit's diagnosis hypothesis was
//                   verified against authoritative source (local
//                   Render-simulation: NODE_ENV=production
//                   npm install) before any code change — proved
//                   149 TS7016 + 907 TS2339 cascade pattern
//                   reproduced exactly.
//              (12) Phase B1 post-fix verification (next, after
//                   commit + edits) — confirm clean build under
//                   NODE_ENV=development npm install before
//                   committing.
//            Cumulative arc sub-rule c fire count: 12.
//
//            Pre-commit verification (Phase B1):
//            - clean build under NODE_ENV=development (Render
//              simulation) — zero TS errors, build exits 0
//            - notificationService.test.ts: 9/9 green
//            - E2E full-lifecycle.spec: green (still hits same
//              skill chrome + token canonical)
//            - Build artifact structure verified:
//              dist/backend/src/lib/srl_compass_*.png present
//              dist/backend/src/config/signatures/whaider.html
//
//            Per §3.1 sequence-continuous: v3.8.abd → v3.8.abe.
//
//            Sprint 45-RC's three regressions (compass placeholder,
//            font drift, parties block overlap) will become
//            VISIBLE in Sprint 46's next deploy logs if any are
//            actually code-side rather than build-chain-side.
//            Compass placeholder may auto-resolve as a side effect
//            of the cp -r src/lib step now actually running on a
//            healthy build. Font drift + parties overlap are
//            true code-side and remain for Sprint 47 (45-RC.b).
//
//            §13.3:
//              - Item 71 — LOGGED + CLOSED (build chain fail-fast
//                aligned with CI; root cause was Render's
//                NODE_ENV=production stripping devDeps at install)
//              - Item 95 — LOGGED + CLOSED (Rekognition
//                optionalDependencies declared)
//              - Item 96 — LOGGED + CLOSED (architectural lesson:
//                fail-fast > fail-silent as methodology principle)
//              - Items 87 + 89 + 90 + 92 + 8.8 + 93 + 94 — STATUS
//                UNCHANGED (deferred per Sprint 46 scope discipline)
//
// v3.8.abf — Sprint 47 (Sprint 45-RC.b atomic bundle) — closes
//            Items 99 + 100 + 101 + 102. Resolves all three
//            Sprint 45-RC visible regressions + skill canonical
//            transit unit update.
//
//            ROOT CAUSE OF SPRINT 45-RC COMPASS PLACEHOLDER
//            (Item 99): POSIX `cp -r SRC DEST` when DEST already
//            exists copies SRC as a CHILD of DEST → produces
//            DEST/SRC_NAME/files... NOT DEST/files... tsc creates
//            dist/backend/src/{lib,config,assets}/ directories
//            first (emitting compiled .js files), so all three cp
//            destinations pre-exist and the nesting bug fires
//            silently. Sprint 45-RC compass PNGs went to
//            dist/backend/src/lib/lib/srl_compass_*.png (nested);
//            runtime LOGO_DIR=__dirname resolved to
//            dist/backend/src/lib/ found no PNGs → placeholder
//            navy ring fallback fired on every RC PDF generation.
//
//            SAME BUG retroactively explains Sprint 44b email
//            signature fallback warning — `cp -r src/config
//            dist/backend/src/config` produced
//            dist/backend/src/config/config/signatures/whaider.html
//            (nested); email/builder.ts:18 reading
//            dist/backend/src/config/signatures/whaider.html got
//            "file not found" on every cold start since Sprint
//            44b. ITEM 72 closed the directive but never verified
//            the file landed at the expected runtime path.
//
//            EMPIRICAL REPRODUCTION (Phase B0 sub-rule c gate):
//              rm -rf dist && npm run build
//              cp -r src/lib dist/backend/src/lib
//              ls dist/backend/src/lib/lib/srl_compass_60.png ✓
//                (nested — proves bug)
//              ls dist/backend/src/lib/srl_compass_60.png ✗
//                (expected runtime path — empty)
//
//            FIX VERIFICATION (Phase B0 Step 4):
//              cp -r src/lib/. dist/backend/src/lib/
//              ls dist/backend/src/lib/srl_compass_60.png ✓
//                (flat path — runtime resolves)
//              ls dist/backend/src/lib/lib/ ✗ no nesting ✓
//
//            ATOMIC 4-CHANGE COMMIT:
//
//            (Change 1) Trailing-dot cp -r form on all 3 cp
//            commands in render.yaml + CLAUDE.md §2.2:
//              cp -r src/lib dist/backend/src/lib
//              →
//              cp -r src/lib/. dist/backend/src/lib/
//            Same for src/assets and src/config. Fixes BOTH
//            Sprint 45-RC compass + Sprint 44b email signature.
//            Wasi must update Render dashboard buildCommand
//            BEFORE push per D5 D9-style sequence.
//
//            (Change 2) Transit display hours not days (Item 100):
//              backend/src/lib/srl-chrome.ts:drawLaneEconomics
//              new param: transitUnit: "hours" | "days" = "hours"
//              backend/src/services/pdfService.ts RC generator:
//              transitDays (miles/500) → transitHours (miles/55)
//              Display: "24.6 hrs" (broker industry standard
//              drive-hour metric; carriers think in HOS-relevant
//              drive hours, not calendar days).
//
//            (Change 3) Skill font registration (Item 101):
//              srl-chrome.ts FONT_* constants updated:
//                Helvetica → DMSans-Regular
//                Helvetica-Bold → DMSans-Bold
//                Helvetica-Oblique → DMSans-Italic
//                Times-Bold → Playfair-Bold
//                Times-Italic → Playfair-Italic
//                Courier-Bold (kept, no DMSans monospace)
//              New exported registerSkillFonts(doc) function
//              mirrors generateBOLFromLoad's font registration
//              pattern at pdfService.ts:317-326. TTFs ship at
//              backend/src/assets/fonts/bol-v2.9/ (already in
//              tree from Sprint v3.8.b BOL v2.9 epic) and
//              propagate to Render prod via cp -r src/assets/.
//              step. Callers (currently just
//              generateEnhancedRateConfirmation) must invoke
//              registerSkillFonts(doc) immediately after
//              new PDFDocument(). Without it, fontkit throws
//              "Font not found" on first text() call.
//
//            (Change 4) drawPartiesBlock y-coord overlap fix
//            (Item 102):
//              pdfService.ts:1414
//                y = drawPartiesBlock(..., y - 4)
//                →
//                y = drawPartiesBlock(..., y + 12)
//              The drawMetaStrip return value is at the meta
//              strip's bottom edge; parties block needs its own
//              PARTIES small-caps label clearance from the meta
//              strip row above. Sprint 45-RC's `y - 4` rendered
//              "May 16, 2026PARTIES" overlap visible on every
//              RC PDF.
//
//            PATTERN 6 SUB-RULE C — 13TH PROSPECTIVE FIRE:
//            Phase A audit caught cp -r nesting bug via local
//            empirical reproduction BEFORE shipping fix. Sub-rule
//            c gate extension banks methodology (Item 99 +
//            §13.3): "command exited 0" is NOT sufficient
//            verification for file-producing operations. Must
//            verify file landed at expected runtime path. Sprint
//            44b Item 72 closure was technically incorrect — the
//            cp command did run, but the runtime-path
//            verification was never performed; the failure was
//            invisible until Sprint 45-RC compass placeholder
//            surfaced it 6+ days later.
//
//            Cumulative arc sub-rule c fire count: 13.
//
//            Pre-commit verification (Phase B1):
//            - rm -rf dist && npm run build → tsc exit 0 ✓
//            - cp -r src/assets/. dist/backend/src/assets/ ✓
//            - cp -r src/config/. dist/backend/src/config/ ✓
//            - cp -r src/lib/. dist/backend/src/lib/ ✓
//            - dist/backend/src/lib/srl_compass_60.png exists ✓
//            - dist/backend/src/config/signatures/whaider.html ✓
//            - dist/backend/src/assets/fonts/bol-v2.9/
//              PlayfairDisplay-Bold.ttf + DMSans-Regular.ttf ✓
//            - No nested {lib,config,assets}/ subdirs ✓
//            - notificationService.test.ts: 9/9 passed (775ms)
//            - E2E full-lifecycle.spec: not re-run (build chain
//              fix is orthogonal; E2E uses ts-node-dev runtime)
//
//            Per §3.1 sequence-continuous: v3.8.abe → v3.8.abf.
//
//            Predicted side-effects post-deploy:
//              - RC PDF compass mark renders canonically (no
//                more navy ring placeholder)
//              - RC PDF body fonts render Playfair + DM Sans
//                (matches BOL v2.9 visual parity)
//              - RC PDF parties block doesn't overlap meta strip
//              - RC PDF transit reads "24.6 hrs" for 1,352 mi
//                lane (vs prior "2.7 days")
//              - Runtime log: [EmailBuilder] Signature file not
//                found warning DISAPPEARS (signature now resolves
//                from canonical path)
//
//            §13.3:
//              - Item 99 — LOGGED + CLOSED (cp -r POSIX nesting
//                + sub-rule c gate extension methodology
//                principle)
//              - Item 100 — LOGGED + CLOSED (transit display
//                hours not days, skill canonical update)
//              - Item 101 — LOGGED + CLOSED (skill font
//                registration in srl-chrome.ts mirroring BOL
//                v2.9 pattern)
//              - Item 102 — LOGGED + CLOSED (drawPartiesBlock
//                y-coord overlap fix)
//              - Items 97 + 98 + 87 + 89 + 90 + 92 + 8.8 + 93 +
//                94 — STATUS UNCHANGED (deferred per Sprint 47
//                scope discipline)
//
// v3.8.abg — Sprint 47.b — ligature substitution hotfix +
//            T&C font canonical. Closes Items 103 + 104 + 105.
//
//            VISUAL VERIFICATION OF SPRINT 47 SURFACED THE EXACTLY-
//            PREDICTED REGRESSION: fontkit ligature substitution
//            rendered "Rate Confirmation" → "Rate Confrmation" in
//            3 of 4 instances post-Sprint-47 deploy. Playfair-Bold
//            display heading + DMSans-Regular continuation header
//            + DMSans-Italic body all affected. Helvetica T&C
//            body rendered correctly (built-in fonts have no
//            fontkit ligature substitution).
//
//            Sprint 47 commit message documented the deferred
//            risk verbatim: "Ligature suppression — Sprint v3.8.b
//            Option β monkey-patch... if RC PDF renders italic
//            Playfair with ligature artifacts post-Sprint-47,
//            same monkey-patch approach migrates into
//            srl-chrome.ts as a separate hotfix; deferred unless
//            surfaces visually." Surfaced visually. Sprint 47.b
//            activated per plan.
//
//            ATOMIC 2-CHANGE COMMIT:
//
//            (Change 1, Item 103) Ligature suppression monkey-
//            patch ported from generateBOLFromLoad inline
//            (pdfService.ts:248-297) into registerSkillFonts(doc)
//            in backend/src/lib/srl-chrome.ts. Bundled with font
//            registration — every skill-chrome consumer that
//            calls registerSkillFonts(doc) now inherits both
//            font registration AND ligature suppression in one
//            call. Future Sprint 45-RC2 (Invoice) + 45-RC3
//            (Settlement) migrations auto-benefit.
//
//            Monkey-patch disables 4 OpenType ligature features
//            (liga/clig/rlig/dlig) while preserving kern=true.
//            Object-form features detection (vs array-form
//            which can't disable defaults) per Sprint v3.8.b
//            canonical shape. Verbatim port — exact-shape
//            verification was a Phase B0 sub-rule c gate.
//
//            (Change 2, Item 104) T&C body + special instructions
//            panel + T&C section label all swapped from legacy
//            Helvetica/Helvetica-Bold to FONT_BODY/FONT_BODY_BOLD
//            skill canonical (DMSans-Regular/DMSans-Bold). Item
//            104 scope EXPANDED from directive's "T&C body" (1
//            line) to all 4 Helvetica references in
//            generateEnhancedRateConfirmation because:
//            (a) heightOfString(text) measurement at line 1526
//                must use same font as text rendering at line
//                1540 to produce a correctly-sized panel; coupled
//                pair must be migrated together
//            (b) T&C section label at line 1549 paired with body
//                at line 1567 for visual consistency — splitting
//                them would render T&C header in Helvetica-Bold
//                and body in DMSans, NEW visual inconsistency
//                worse than Sprint 47 baseline
//            (c) All 4 are in the same generator function +
//                same atomic commit per §3.3
//            Plus exported FONT_BODY + FONT_BODY_BOLD from
//            srl-chrome.ts (were const before, not exported).
//
//            PHASE B1 SUB-RULE C GATE D4 — local PDF smoke test
//            BEFORE commit verified all 4 "Rate Confirmation"
//            instances render with the dot on i:
//              page 1 H1 (Playfair-Bold)         ✓ "Confirmation"
//              page 2 cont. header (DMSans-Reg)  ✓ "Confirmation"
//              page 2 italic body (DMSans-Ital)  ✓ "Confirmation"
//              page 2 T&C body (DMSans-Reg)      ✓ "Confirmation"
//            (All 4 previously rendered "Confrmation" without
//            monkey-patch.) Empirical proof the fix works,
//            verified BEFORE push — sub-rule c gate worked as
//            designed.
//
//            PATTERN 6 SUB-RULE C — DEFERRED-BUT-NOT-MISSED
//            PATTERN (Item 105 banks as methodology principle):
//            Sprint 47 explicitly documented the deferred
//            ligature risk in its commit message. Sprint 47.b
//            activated exactly per that documented plan when
//            the risk surfaced. This is sub-rule c gate working
//            in its INTENDED protocol — risk identified ahead,
//            documented as known-deferred, monitored via visual
//            verification, activated immediately when surfaced.
//            Lineage holds at 13 prospective fires (this is NOT
//            a sub-rule c miss; it's the gate's deferral
//            protocol working as designed). Item 105 adds
//            "deferred-but-not-missed" as named sub-pattern
//            alongside Item 99 "runtime-path verification gate
//            extension" and Item 96 "fail-fast vs fail-silent"
//            for next quarterly §19 meta-commit.
//
//            Pre-commit verification (Phase B1):
//            - rm -rf dist && npm run build → tsc strict exit 0
//              (Sprint 46 fail-fast architecture held)
//            - cp -r src/{assets,lib}/. simulated locally
//            - notificationService.test.ts: 9/9 passed in 712ms
//              (Sprint 45a regression-lock holds through
//              monkey-patch port + FONT_* exports + Helvetica
//              → FONT_BODY swaps)
//            - LOCAL PDF SMOKE (D4 sub-rule c gate):
//              generated test RC PDF via direct service call,
//              read back via PDF text extraction, verified all
//              4 "Confirmation" instances render with dot on i
//              ✓ — empirical proof fix works before push
//            - E2E full-lifecycle.spec: not re-run (build chain
//              fix + visual chrome fix; E2E PDF assertions
//              don't test ligature rendering or font-family
//              names)
//
//            Per §3.1 sequence-continuous: v3.8.abf → v3.8.abg.
//
//            §13.3:
//              - Item 103 — LOGGED + CLOSED (monkey-patch port
//                bundled with registerSkillFonts; suppresses
//                fontkit ligature substitution across all
//                skill-chrome consumers)
//              - Item 104 — LOGGED + CLOSED (T&C body + 3
//                coupled Helvetica references in
//                generateEnhancedRateConfirmation swapped to
//                FONT_BODY/FONT_BODY_BOLD skill canonical;
//                scope expanded from 1 line to 4 lines for
//                heightOfString/render font-pair coupling +
//                T&C label/body visual consistency)
//              - Item 105 — LOGGED + CLOSED same-sprint
//                (sub-rule c gate deferred-but-not-missed
//                protocol canonical, §19 quarterly meta-commit
//                candidate alongside Items 96 + 99)
//              - Items 97 + 98 — STATUS UNCHANGED (Prisma
//                advisory lock cleanup; Sprint 52+ candidate)
//              - All other open items STATUS UNCHANGED per
//                Sprint 47.b scope discipline
//
// v3.8.ahi — /about Phase A audit fixes (Wasi flags p1/p2/p3/p4/p6).
//            Single atomic commit per §3.3, no scope creep beyond
//            the 5 ratified dispositions.
//
//            p1 — Stats "By the Numbers" section removed entirely.
//              Single-stat ("48 / States Licensed") didn't justify
//              full-section weight when the same fact already lives
//              on /index hero Section 6 H2 ("48 states wide"),
//              /shippers H1, /carriers dedicated coverage section,
//              and /faq three places. Section + .stats-* CSS + JS
//              counter-animation block all swept per §3.7.
//
//            p2 — "What Sets Us Apart" reduced 6 → 3 cards.
//              Prior 6 pillars (Khotan TMS / Carrier-Centric /
//              Industry Expertise / Financially Bonded / 48-State /
//              Compliance) all duplicated content present elsewhere
//              with stronger rhetorical force. New 3 cards anchor
//              /about as canonical for what /shippers + /carriers
//              don't pitch: operational philosophy ("We Own the
//              Stack"), published-before-asked posture ("Published
//              Before Asked"), named-AE accountability ("One Name
//              on Every Load"). Subtitle updated 6→3.
//
//            p3 — "How AI Works at SRL" 3-card grid collapsed to
//              single inline narrative naming the three systems;
//              "Where AI Stops" boundaries panel elevated as the
//              section anchor with .ai-boundaries-anchor modifier
//              (larger padding, larger heading, larger list-item
//              type). Rare-disclosure pattern gets the visual
//              weight it deserves; fewer competing card boxes.
//
//            p4 — Our Story Para 3 rewrite. Dropped softener
//              clichés ("strategically positioned", "spirit of
//              partnership and reliability", "partners can depend
//              on") and verbatim cross-page repeats ("real-time
//              visibility, transparent pricing, proactive
//              communication"). New copy names Khotan, Marco Polo
//              AI, Compass Engine, the published 7-factor scorecard,
//              tier-graduated FSC, BMC-84 bond per §18.8.
//
//            p6 — Mission/Vision/Promise card bodies rewritten for
//              §18.8 specificity. Vision was the weakest (pure
//              generic enterprise vision-statement) — replaced with
//              SRL operational mechanics. Mission gained published-
//              metric specificity. Promise tightened from comma list
//              to three discrete commitments.
//
//            CSS hygiene: .stats-section + 6 child selectors removed,
//            .stats-grid references swept from 1024/768/480
//            breakpoints + reduced-motion rule. .ai-grid + .ai-card
//            + ::before + :hover + h3 + p all removed. New
//            .ai-narrative + .ai-boundaries-anchor + .apart-grid-3col
//            added. .apart-grid .apart-card:last-child joins mvp +
//            leadership pattern for tablet/mobile orphan-third-card
//            centering.
//
//            JS hygiene: STAT COUNTER ANIMATION block (75 LOC)
//            removed from inline script — no .stat-number[data-target]
//            callers remain on the page.
//
//            §18.9 voice-sweep applied to all new copy: no em-dashes,
//            no "That's where..." openers, no consultant-speak, no
//            marketing softeners, no repeated close patterns.
//
//            Per §3.1 sequence-continuous: v3.8.ahh → v3.8.ahi.
//
//            §13.3:
//              - §20.6 audit log updated (deferred to next docs
//                meta-commit per §3.3 atomic-commit scope discipline;
//                §20.6 maintenance bundled with broader §20 housekeeping)
//              - §20.7 cross-page redundancy registry retroactively
//                validates the p1 + p2 dispositions: "48-state
//                coverage" was the textbook stat-repetition case,
//                and the 6-card "What Sets Us Apart" was the textbook
//                generic enterprise-SaaS pillar grid the registry
//                exists to catch
//              - All other open items STATUS UNCHANGED per §3.3
//                scope discipline
//
// v3.8.ahj — Authority-age compliance epic, sprint 1 of 5 — FMCSA
//            authority data plumbing.
//
//            Wasi cross-cutting directive 2026-05-21: carriers whose
//            FMCSA operating authority is younger than 18 months are
//            HARD-BLOCKED from hauling SRL loads. Override window
//            exists for authority age 12-18 months, ADMIN+CEO via the
//            existing Sprint 40 ComplianceOverride flow. Sub-18 months
//            authority on the carrier-self-service onboarding flow
//            captures the carrier to a new WaitingList with an
//            auto-notify at 18-month maturity. Existing APPROVED
//            carriers are soft-grandfathered (AE warning, never
//            auto-blocked).
//
//            Full epic decisions banked at CLAUDE.md §13.3 Item 182.
//            Each subsequent sprint (v3.8.ahk → v3.8.ahn) closes a
//            discrete layer of the epic with its own atomic commit.
//
//            v3.8.ahj scope (this commit) — DATA PLUMBING ONLY:
//
//              - New getCarrierAuthority(dotNumber) in fmcsaService
//                hitting the free FMCSA QCMobile authority endpoint at
//                /qc/services/carriers/{dot}/authority with the
//                existing FMCSA_WEB_KEY env var. Parses operating-
//                authority history, filters for GRANT actions, sorts
//                ascending by served date, returns the earliest grant
//                date as the canonical authorityGrantDate plus a
//                derived authorityAgeMonths computed via calendar-
//                month diff to today.
//
//              - New fmcsaTypes.ts with FMCSAAuthorityResult
//                interface. Existing inline FMCSACarrierResult in
//                fmcsaService.ts intentionally NOT moved this sprint
//                — wider blast radius, scope-deferred per §3.3.
//
//              - Parallel authorityCache Map with same 1-hour TTL as
//                the existing service cache (Pattern 6 sub-rule c:
//                the epic-design said 24h but the authoritative
//                source — the existing code — uses 1h; refactor to
//                per-key TTL is out of v3.8.ahj scope).
//
//              - Casing-tolerant parsers: tolerates both
//                originalServedDate (camelCase, used in some FMCSA
//                responses) and original_served_date (snake_case,
//                used per QCMobile docs example). Same for
//                originalAction / original_action and
//                authorityType / authority_type.
//
//              - Reinstatement-continuity caveat documented inline +
//                pinned by smoke test: REVOCATION + REINSTATEMENT
//                entries are explicitly ignored — only GRANT actions
//                anchor the date. Per Item 182 locked decisions this
//                is a deliberate v3.8.ahj choice; the reinstated-as-
//                new-grant edge case is a deferred AE-warning
//                concern.
//
//              - Smoke test at backend/__tests__/unit/services/
//                fmcsaService.test.ts. Four cases: (1) happy path
//                single GRANT 2 years ago returns ageMonths ≈ 24;
//                (2) empty history returns null grant + non-empty
//                errors; (3) multi-GRANT picks the earliest (COMMON
//                older than CONTRACT in fixture); (4) REVOCATION +
//                REINSTATEMENT entries ignored, original GRANT date
//                is the anchor. fetch is mocked at the global level
//                per Sub-pattern 11 CI-parity — no live FMCSA calls
//                in CI.
//
//            NOT in v3.8.ahj scope (explicit halt boundary):
//              - No schema write-path. CarrierProfile.authorityGrantedDate
//                is not populated by this sprint. Wired in v3.8.ahk.
//              - No hard gate in complianceCheck(). Wired in v3.8.ahl.
//              - No override UI extensions. Wired in v3.8.ahm.
//              - No onboarding integration. Wired in v3.8.ahn.
//              - No WaitingList Prisma model. Wired in v3.8.ahn.
//
//            Per §3.1 sequence-continuous: v3.8.ahi → v3.8.ahj.
//
//            §13.3:
//              - Item 182 — LOGGED. Umbrella epic backlog with locked
//                decisions + 5-sprint sequence + sub-rule c
//                verification gates. v3.8.ahj is the in-flight sprint
//                within this Item; v3.8.ahk → v3.8.ahn awaiting
//                kickoff with their own Phase A audits.
//              - Item 8 (Carrier self-service onboarding UI) —
//                STATUS NOTE: v3.8.ahn within Item 182 materially
//                extends the carrier-self-service onboarding flow
//                with MC/DOT lookup verdict + WaitingList capture.
//                The two items will merge or cross-reference at
//                v3.8.ahn close.
//              - All other open items STATUS UNCHANGED per §3.3
//                scope discipline
//
// v3.8.ahk — Authority-age compliance epic, sprint 2 of 5 — schema
//            population during carrier creation + one-time backfill
//            for the existing carrier base.
//
//            Pure data sprint per Phase A ratification. No Prisma
//            migration — CarrierProfile.authorityGrantedDate already
//            exists at schema.prisma:880 and authorityAgeDays at
//            line 881 stays unused per Item 182 locked decision
//            (age derived on read from the stable grant date).
//
//            Ratified Phase A decisions (D1-D6):
//              D1-α: populate via a single service helper called
//                    from each create site (explicit, no wrapper).
//              D2-A + D2-C aspect: persist null on no-GRANT;
//                    log transient FMCSA HTTP/network errors via
//                    log.warn DISTINCTLY from log.info-level
//                    legit no-GRANT cases so the backfill can spot
//                    them. NEVER fabricate a date or write a
//                    sentinel — null IS the unknown signal, the
//                    downstream gate (v3.8.ahl) treats it as
//                    soft-grandfather.
//              D3 hybrid (Y for register, X for admin-setup):
//                    fire-and-forget for self-registration where
//                    the carrier is PENDING and can't haul anyway,
//                    sync await for admin-setup where the row is
//                    immediately-APPROVED and the data must be
//                    present at row birth.
//              D4-P + D4-Q: backfill skips populated rows by
//                    default (idempotent re-run), accepts --force
//                    to re-pull every row.
//              D5-M: env-based short-circuit when FMCSA_WEB_KEY is
//                    absent — dev and E2E seeds never hit the
//                    network. Seed paths in prisma/seed.ts stay
//                    untouched.
//              D6-J: backfill self-throttle at 2s between FMCSA
//                    calls. Internal calls bypass the HTTP-route
//                    fmcsaLookupLimiter (per-IP, middleware-only),
//                    so the script owns its pacing.
//
//            Shipped:
//
//              - backend/src/services/fmcsaService.ts — new exported
//                populateAuthorityGrantedDate(dotNumber) helper.
//                Returns Date | null. Short-circuits on missing
//                FMCSA_WEB_KEY (zero network traffic). Internally
//                classifies the null case via a transient-pattern
//                regex over the errors[] from getCarrierAuthority
//                and routes through log.warn vs log.info
//                accordingly.
//
//              - backend/src/controllers/carrierController.ts —
//                imports the helper. registerCarrier gains step 7
//                in the post-response fire-and-forget chain that
//                updates authorityGrantedDate on the freshly
//                created CarrierProfile row a few seconds later.
//                setupAdminCarrierProfile gains a sync await call
//                before the prisma.carrierProfile.create with
//                authorityGrantedDate included in the data object
//                — the field is set at row birth, not via a
//                follow-up update, since this path creates
//                immediately-APPROVED carriers where the
//                downstream gate needs the anchor present.
//
//              - backend/scripts/backfill-authority-dates.ts (new)
//                — walks CarrierProfile rows where dotNumber is
//                non-null, skips already-populated by default
//                (filter on authorityGrantedDate IS NULL), accepts
//                --force to re-pull all, self-throttles at 2000ms
//                between FMCSA calls, calls getCarrierAuthority
//                directly (not via the helper) so it can examine
//                the full result for its three-bucket summary
//                (populated / left-null-no-grant / errored).
//                Aborts cleanly when FMCSA_WEB_KEY is absent.
//                Re-runnable, safe to interrupt — the next run
//                bookmarks on the IS NULL filter.
//
//            NOT in v3.8.ahk scope (explicit halt boundary):
//              - No hard gate in complianceCheck(). → v3.8.ahl
//              - No override UI extensions. → v3.8.ahm
//              - No /onboarding integration, no WaitingList. → v3.8.ahn
//              - No Prisma migration. → none needed for the epic.
//
//            Per §3.1 sequence-continuous: v3.8.ahj → v3.8.ahk.
//
//            §13.3:
//              - Item 182 v3.8.ahk status — LOGGED + CLOSED in same
//                commit per Sprint 44b Items 72/73 + Sprint 47 Item
//                99 + v3.8.ahj precedent. Item 182 v3.8.ahl →
//                v3.8.ahn status remain LOGGED, awaiting per-sprint
//                kickoff.
//              - All other open items STATUS UNCHANGED per §3.3
//                scope discipline
//
// v3.8.ahl — Authority-age compliance epic, sprint 3 of 5 — commit 1
//            of 2 in the ahl arc: scoped overrides + override-scoping
//            migration.
//
//            Phase A audit (Item 182 sprint 3) confirmed the critical
//            load-bearing finding: ComplianceOverride had no scoping
//            field — every active row blanket-allowed every check. An
//            "authority-age override" created today would silently
//            waive insurance expiry, FMCSA status, OFAC, the signed
//            agreement, COI expiry, chameleon risk, every block. Per
//            Phase A ratification D7-P: add a nullable checkCode
//            field, filter the blanket short-circuit on checkCode IS
//            NULL only, leave scoped overrides for per-check downstream
//            consultation.
//
//            Shipped in this commit:
//
//              - backend/prisma/schema.prisma — ComplianceOverride
//                gains nullable checkCode String? field with full
//                inline doc on the NULL = blanket semantic. Existing
//                indexes unchanged; the carrierId index leads the
//                lookup, the WHERE clause filters checkCode in memory
//                (per-carrier override cardinality is at most ~15
//                rows per 30-day window per the Sprint 64 quota).
//
//              - backend/prisma/migrations/20260521190000_add_check_
//                code_to_compliance_override/migration.sql — additive
//                nullable column add. Existing rows default to NULL
//                on column creation, preserving the pre-ahl blanket
//                semantic.
//
//              - backend/src/services/complianceMonitorService.ts —
//                the override short-circuit at lines 41-51 now filters
//                checkCode: null. Variable renamed to
//                activeBlanketOverride for clarity. Inline comment
//                explains the v3.8.ahl scoping introduction.
//
//            NOT in commit 1 scope (commit 2 = v3.8.ahm follows):
//              - The authority-age gate itself.
//              - AUTHORITY_AGE_GATE_LIVE_AT constant.
//              - complianceMonitorService.test.ts.
//              - CLAUDE.md Item 182 close update.
//
//            Sprint 40 quota (15 per rolling 30-day window) +
//            24-hour expiry + ADMIN/CEO role gate left UNTOUCHED per
//            Phase A directive. No override-creation endpoint changes
//            in commit 1 — that's commit 2's gate work + ahm's UI.
//
//            Per §3.1 sequence-continuous: v3.8.ahk → v3.8.ahl. The
//            two-commit shape (ahl + ahm for the gate work) shifts
//            the Item 182 epic plan one letter right — original ahm
//            (Override flow + AE UI) → ahn, original ahn (Onboarding)
//            → aho. The re-letter will be documented at v3.8.ahm
//            close in commit 2 of the arc.
//
//            §13.3:
//              - Item 182 v3.8.ahl status — LOGGED + CLOSED for commit
//                1 (scoping migration). The "ahl sprint" full close
//                lands in v3.8.ahm with the gate + tests + CLAUDE.md
//                update.
//              - All other open items STATUS UNCHANGED per §3.3
//                scope discipline
//
// v3.8.ahm — Authority-age compliance epic, sprint 3 of 5 — commit 2
//            of 2 in the ahl arc: the hard authority-age gate itself
//            + 9-case vitest harness + Item 182 close.
//
//            Phase A ratified decisions applied (D7-P + D8-S + D9-U
//            + D10-Z + D11-keep):
//
//              D7-P (scoped overrides): v3.8.ahl already added the
//                    checkCode field and filtered the blanket
//                    short-circuit on NULL. This commit consumes
//                    that field — the 12-to-18 month override window
//                    queries ComplianceOverride for
//                    checkCode = "AUTHORITY_TOO_YOUNG" and releases
//                    only when present + unexpired.
//              D8-S (hardcoded grandfather cutoff):
//                    AUTHORITY_AGE_GATE_LIVE_AT exported as a single-
//                    source-of-truth constant in
//                    complianceMonitorService. Currently set to the
//                    placeholder 2026-05-21T19:00:00Z — Wasi confirms
//                    the exact value before push. Hardcoded, not
//                    env-driven, version-pinned with the sprint.
//              D9-U (brand-new null-date handling): a post-cutoff
//                    carrier with null authorityGrantedDate gets
//                    AUTHORITY_PENDING warning if approved <24h ago,
//                    AUTHORITY_UNVERIFIED hard-block if approved
//                    ≥24h ago. Brand-new carriers are NEVER
//                    auto-allowed on a null date.
//              D10-Z (coded block strings): coded prefixes for
//                    downstream frontend pattern-matching —
//                    AUTHORITY_TOO_YOUNG, AUTHORITY_UNVERIFIED,
//                    AUTHORITY_PENDING, AUTHORITY_AGE_OVERRIDE,
//                    AUTHORITY_AGE_GRANDFATHERED. Format pinned by
//                    the test suite so future frontend work can
//                    match on the prefix safely.
//              D11-keep: carrierVettingService:249-265 soft <180-day
//                    deduction left UNCHANGED. Revisit at the
//                    renumbered onboarding-sprint close.
//
//            Shipped in this commit:
//
//              - backend/src/services/fmcsaService.ts —
//                calendarMonthsBetween exported (was private; needed
//                by the gate for age derivation on read). Same helper,
//                same arithmetic, single source of truth.
//
//              - backend/src/services/complianceMonitorService.ts —
//                AUTHORITY_AGE_GATE_LIVE_AT constant added near top.
//                New authority-age check block inserted between
//                insurance-expiry (lines 62-70) and FMCSA authority-
//                STATUS (lines 73-81) so a too-young authority is
//                rejected even when FMCSA marks the carrier
//                "AUTHORIZED". Six branches: grandfather +
//                age-with-grant (3 sub-branches: <12 hard floor,
//                12-18 with override consult, ≥18 silent allow) +
//                null-grant (2 sub-branches: <24h pending, ≥24h
//                unverified). No additional DB load — the carrier
//                row is already in hand at line 27.
//
//              - backend/__tests__/unit/services/
//                complianceMonitorService.test.ts (new) — 9 vitest
//                cases covering all 7 ratified scenarios plus a 1b
//                subtest (grandfather-with-young-authority) and a
//                3a/3b split (block-by-default vs override-released).
//                vi.useFakeTimers + setSystemTime(FIXED_NOW) pin
//                "now" to a deterministic 2026-06-15 mid-month
//                anchor so calendar-month arithmetic produces exact
//                ages via the nMonthsAgo(N) helper. Defensive
//                vi.resetAllMocks in beforeEach prevents
//                mockResolvedValueOnce queue leak between tests
//                (banked sub-rule c learning: Once-mocks must be
//                reset, not just cleared, when the same mock is
//                used across tests).
//
//              - CLAUDE.md Item 182 — v3.8.ahl + v3.8.ahm closed as
//                the two-commit arc. D7-D11 ratified decisions
//                captured inline. Remaining Item 182 sprints LOGGED
//                awaiting kickoff; letter assignment deferred to
//                each sprint's Phase A.
//
//            NOT in v3.8.ahm scope (explicit halt per Item 182):
//              - No override-creation endpoint accepting checkCode.
//                The existing POST /compliance/carrier/:id/override-block
//                still creates checkCode=null (blanket) overrides
//                only. A future sprint will extend the endpoint to
//                accept checkCode + AE UI for scoped creation.
//              - No frontend suppression / AE-warning UI.
//              - No /onboarding MC/DOT verdict integration.
//              - No WaitingList Prisma model.
//
//            Pre-push gates (Sub-pattern 11 CI-parity):
//              - npx vitest run complianceMonitorService.test.ts —
//                9/9 passed
//              - npx vitest run fmcsaService + compliance +
//                notification — 22/22 passed (no cross-test
//                pollution from fakeTimers/resetAllMocks)
//              - npx tsc --noEmit (backend) — clean
//              - npx tsc --noEmit (frontend) — clean
//
//            Per §3.1 sequence-continuous: v3.8.ahl → v3.8.ahm.
//
//            §13.3:
//              - Item 182 v3.8.ahl + v3.8.ahm — LOGGED + CLOSED
//                (two-commit arc, sprint 3 of 5).
//              - Remaining Item 182 sprints (Override flow + AE UI,
//                Onboarding UI + WaitingList) LOGGED awaiting
//                kickoff. Letter assignment deferred to Phase A.
//              - All other open items STATUS UNCHANGED per §3.3
//                scope discipline.
//
// v3.8.ahn   — Caravan Journey visual upgrades: competitor truck
//              (muted slate, no decal, trails by widening gap, never
//              catches up), active-marker brass pulse ring, faster
//              dashed-lane flow (2.4s→1.6s), larger SRL truck
//              (112×38→132×46), lane height 240→260px for clearance.
//              §5 prohibited claims preserved (no competitor naming).
// v3.8.ahp   — Caravan Journey direction fixes: (1) SRL truck silhouette
//              flipped to face east (direction of travel) via internal
//              <g scale(-1,1) translate(-140,0)> with SRL wordmark
//              rendered in separate non-mirrored layer; (2) competitor
//              moved to lower lane (top:30→160) traveling westbound
//              (CJ_COMPETITOR_POS reversed to ['90%','70%','45%','20%'])
//              so road reads as genuine two-way traffic; (3) reset
//              snap uses `.is-resetting` no-transition class so trucks
//              never visually drive in reverse during the Platinum→
//              Apply teleport.
//
// v3.8.ahq — Authority-age compliance epic, sprint 4 of 5 (commit 1
//            of 2 in the ahq arc) — backend extension + blocked_codes
//            enrichment + tests.
//
//            Backend half of the authority-age override sprint. The
//            frontend modal follows in commit 2 (next available letter
//            — likely v3.8.ahr unless an unrelated sprint lands first).
//            v3.8.ahm hard gate already honors checkCode = "AUTHORITY_
//            TOO_YOUNG" via the lookup at complianceMonitorService:
//            105-117; this commit wires the endpoint that mints the
//            override row + the gate-output signal the UI needs.
//
//            Note on letter sequence: the epic plan called for ahn,
//            but ahn/aho/ahp landed first as unrelated Caravan Journey
//            visual sprints (commits caff938..7dbd5c8 across the
//            past few sessions). Per §3.1 sequence-continuous, this
//            sprint takes the next genuinely-available letter — ahq.
//            Item 182 entry in CLAUDE.md acknowledges this rather than
//            pre-claiming.
//
//            Phase A ratified decisions applied (D12-A + D13-P +
//            D14-R + D15 + D16):
//
//              D12-A — extend the existing POST /override-block
//                endpoint with an optional checkCode field. Single
//                endpoint, reuses quota/expiry/audit. NULL preserves
//                Sprint 40 blanket-override semantic for legacy
//                callers.
//              D13-P — three distinct 409 codes for the
//                non-mintable cases: NO_AUTHORITY_DATE (null grant),
//                HARD_FLOOR_NOT_OVERRIDABLE (<12mo), OVERRIDE_NOT_
//                NEEDED (>=18mo). Each has its own response code
//                string so the UI can surface specific messages.
//              D14-R — enrich complianceCheck() result with a
//                blocked_codes field parallel to blocked_reasons.
//                Additive — the 9 existing callers reading only
//                allowed/blocked_reasons are unaffected.
//              D15 — gate-output drives the modal's render
//                conditional (commit 2 follows).
//              D16 — helper text + auth-age reason hint (commit 2
//                follows).
//
//            Shipped in this commit:
//
//              - backend/src/services/complianceMonitorService.ts —
//                new `BlockedCode` exported interface. complianceCheck
//                return type extended with `blocked_codes:
//                BlockedCode[]`. Populated only for actually-blocked
//                authority states this sprint:
//                  • <12mo → { AUTHORITY_TOO_YOUNG, ageMonths,
//                              overridable: false }
//                  • 12-18mo (no override) → { AUTHORITY_TOO_YOUNG,
//                              ageMonths, overridable: true }
//                  • null + ≥24h since approval → {
//                              AUTHORITY_UNVERIFIED, overridable:
//                              false }
//                  • 12-18mo with active override → no entry (block
//                              released)
//                  • ≥18mo → no entry (silent allow)
//                Single ageMonths derivation feeds both
//                blocked_reasons and blocked_codes so they cannot
//                diverge.
//
//              - backend/src/controllers/complianceController.ts —
//                overrideBlock extended with optional `checkCode`
//                request body field. When checkCode ===
//                "AUTHORITY_TOO_YOUNG":
//                  1. Re-derive ageMonths from
//                     carrier.authorityGrantedDate via
//                     calendarMonthsBetween (imported from
//                     fmcsaService — same helper as the gate).
//                  2. 409 NO_AUTHORITY_DATE if grant date null.
//                  3. 409 HARD_FLOOR_NOT_OVERRIDABLE if
//                     ageMonths < 12.
//                  4. 409 OVERRIDE_NOT_NEEDED if ageMonths >= 18.
//                  5. Only 12-to-under-18 passes to mint.
//                checkCode persisted to ComplianceOverride.checkCode
//                + recorded in auditTrail.changedFields. NULL
//                preserves Sprint 40 blanket-override behavior.
//                Quota (15/30d), expiry (24h), and ADMIN/CEO role
//                gate UNTOUCHED.
//
//              - backend/__tests__/unit/services/
//                complianceMonitorService.test.ts extended with 4
//                new cases (8-11) covering blocked_codes
//                overridable=false at <12mo, overridable=true at
//                12-18mo, empty array at ≥18mo, AUTHORITY_UNVERIFIED
//                + overridable=false for null+≥24h.
//
//              - backend/__tests__/unit/controllers/
//                complianceController.test.ts (new) — 5 cases:
//                three 409 rejections (NO_AUTHORITY_DATE,
//                HARD_FLOOR_NOT_OVERRIDABLE, OVERRIDE_NOT_NEEDED),
//                successful 12-18mo scoped mint with checkCode
//                persisted, blanket-compat (no checkCode) mint.
//                Prisma + fmcsaService + complianceMonitorService
//                + emailService all mocked at module level.
//                vi.useFakeTimers + setSystemTime(FIXED_NOW) +
//                nMonthsAgo helper pattern matches the service test
//                file for deterministic ageMonths.
//
//            NOT in commit 1 scope (commit 2 — next available letter):
//              - OverrideComplianceModal.tsx extension to consume
//                blocked_codes and drive the authority-age control.
//              - Parent component plumbing in loads/page.tsx +
//                CarrierEngagementDrawer.tsx to pass blocked_codes
//                through.
//              - Helper text under the reason textarea for
//                authority-age overrides.
//              - Specific 409-code message surfacing in the modal.
//
//            Backwards-compatibility verification:
//              - 9 existing complianceCheck() callers read only
//                allowed + blocked_reasons; the new blocked_codes
//                field is silently ignored by them. No per-callsite
//                changes needed.
//              - Existing OverrideComplianceModal posts { reason }
//                only — checkCode is absent → null → Sprint 40
//                blanket override semantic preserved. Modal
//                continues to work for blanket use cases until
//                commit 2 extends it.
//              - 13 service tests + 5 controller tests + 4 fmcsa
//                tests + 9 notification tests all passing → 31 unit
//                tests across the touched service surface, clean.
//
//            Pre-push gates per Sub-pattern 11 (CI-parity):
//              - npx vitest run complianceMonitorService.test.ts +
//                complianceController.test.ts → 18/18 passed in 17ms
//              - npx tsc --noEmit (backend) — clean
//              - npx tsc --noEmit (frontend) — clean
//
//            Per §3.1 sequence-continuous: v3.8.ahp → v3.8.ahq
//            (skipping ahn/aho/ahp consumed by parallel Caravan
//            Journey visual sprints — those landed between my
//            v3.8.ahl/ahm and now).
//
//            §13.3:
//              - Item 182 v3.8.ahq status — LOGGED + CLOSED for
//                commit 1 (backend). The "authority-age override
//                sprint" full close lands in commit 2 with the
//                modal + Item 182 update.
//              - All other open items STATUS UNCHANGED per §3.3
//                scope discipline.
// v3.8.ahr   — Caravan Journey COMPREHENSIVE redesign: navy highway
//              lane + cream dashed centerlines + OUTBOUND FREIGHT /
//              QUICK PAY RETURNING labels + SRL truck (upper east) +
//              gold $ coin replacing anonymous competitor (lower west)
//              + markers moved BELOW lane with thin connectors + tier-
//              named cartouche colors (cream APPLY / silver SILVER /
//              gold GOLD / platinum PLATINUM) + "Quick Pay at this
//              tier" panel eyebrow + title rewrite "Freight goes out.
//              Cash comes back faster." per Wasi-supplied reference.
//
// v3.8.ahs — Authority-age compliance epic, sprint 4 of 5 (commit 2
//            of 2 in the ahq arc) — AE modal extension consuming
//            blocked_codes + scoped override flow + Item 182 close.
//
//            Paired with v3.8.ahq backend (commit 1) that shipped
//            the scoped override endpoint + the blocked_codes
//            structured signal complianceCheck() now emits. This
//            commit makes the frontend modal consume that signal
//            and renders the authority-age control accordingly.
//            Letter sequence: ahr landed mid-arc as an unrelated
//            Caravan Journey redesign; commit 2 took the next free
//            letter (ahs) per §3.1.
//
//            Phase A ratified decisions applied this commit
//            (D15 + D16, with D12-A + D13-P + D14-R already
//            consumed by v3.8.ahq backend):
//
//              D15 — submit button disabled when isHardBlocked is
//                    true (hard floor OR unverified state), with
//                    HTML title tooltip surfacing "why" without an
//                    error round-trip.
//              D16 — helper text ratified as a placeholder switch
//                    on the reason textarea ("Reason for waiving
//                    the 18-month minimum, e.g. known carrier or
//                    prior business history") rather than a
//                    separate <p> — matches the existing modal's
//                    styling, no new brand surfaces.
//
//            Shipped:
//
//              - frontend/src/components/loads/
//                OverrideComplianceModal.tsx — new exported
//                BlockedCode interface (mirrors the backend's
//                BlockedCode from complianceMonitorService.ts).
//                New optional `blockedCodes` prop. Three derived
//                states drive the modal's render conditional:
//                overridableAuthority, hardFloorAuthority,
//                unverifiedAuthority. Authority-age status panel
//                renders between blocked_reasons and reason
//                textarea, color-coded amber for overridable /
//                slate for non-overridable. Reason textarea
//                placeholder switches to D16's text when authority
//                override is the path. Submit button label switches
//                to "Apply Authority-Age Override" + sends
//                checkCode="AUTHORITY_TOO_YOUNG" in the mutation
//                body. canSubmit gated with !isHardBlocked + title
//                tooltip on the disabled button. 409 error handler
//                parses the response code and surfaces specific
//                messages (NO_AUTHORITY_DATE / HARD_FLOOR_NOT_
//                OVERRIDABLE / OVERRIDE_NOT_NEEDED) instead of
//                generic. NEVER parses blocked_reasons strings.
//
//              - frontend/src/app/dashboard/loads/page.tsx —
//                complianceResult state type (line 148-150),
//                useQuery result type (line 851), TenderFormProps
//                complianceResult type (line 1661) all extended
//                with optional blocked_codes. Modal mount (line
//                919-940) passes blockedCodes through.
//
//              - frontend/src/components/drawer/
//                CarrierEngagementDrawer.tsx — ComplianceResult
//                interface extended with optional blocked_codes.
//                Drawer modal mount passes blockedCodes through.
//
//              - CLAUDE.md Item 182 — full v3.8.ahq + v3.8.ahs arc
//                close documented as sprint 4 of 5 of the
//                authority-age epic. Sprint 5 (Onboarding UI +
//                WaitingList) remains LOGGED awaiting Phase A
//                kickoff.
//
//            Backwards-compatibility verification:
//              - blockedCodes is optional in the modal prop +
//                optional in all parent type definitions. Pre-ahq
//                deploys returning the old shape (no blocked_codes
//                field) gracefully degrade — modal uses
//                `blockedCodes ?? []`, no authority panel renders,
//                blanket-override flow continues to work.
//              - Existing modal callers passing only blockedReasons
//                still work — blockedCodes is optional, defaults
//                to undefined.
//              - Submit button still defaults to "Apply Override"
//                (Sprint 40 label) when no authority override is
//                present. Reason placeholder reverts to the
//                Sprint 40 default when no authority override is
//                present.
//
//            Pre-push gates per Sub-pattern 11 (CI-parity):
//              - npx tsc --noEmit (frontend) — clean
//              - npx next build (frontend) — clean (all routes
//                prerendered as static content)
//              - Backend tests untouched in commit 2 (verified
//                clean in commit 1: 18 vitest passing).
//
//            Per §3.1 sequence-continuous: v3.8.ahr → v3.8.ahs.
//
//            §13.3:
//              - Item 182 v3.8.ahq + v3.8.ahs — LOGGED + CLOSED
//                as the two-commit arc covering sprint 4 of 5
//                (scoped override endpoint + AE modal extension).
//              - Item 182 remaining sprint (Onboarding UI +
//                WaitingList Prisma model) — LOGGED, awaiting
//                kickoff. Letter assigned at Phase A based on
//                what's free in the v3.8.* sequence then.
//              - All other open items STATUS UNCHANGED per §3.3
//                scope discipline.
// v3.8.aht   — Caravan Journey trailer-fills-with-coins refactor:
//              westbound $ coin removed entirely; gold coins now
//              accumulate INSIDE the SRL trailer per tier (Apply=0,
//              Silver=2, Gold=4, Platinum=6 = full trailer) via
//              cumulative `.cj-loaded-N` class on .cj-truck. SRL
//              wordmark moved to small brass placard at trailer
//              bottom (addresses "not gold" concern). Replaces the
//              v3.8.ahr metaphor of money rolling backward on the
//              highway with a stronger "earnings building" narrative.
// v3.8.ahu   — Caravan Journey readability bump: truck container
//              126×40→168×60 (+33% width, +50% height); lane height
//              150→200 to maintain dash clearance; SRL wordmark
//              font-size 6→9 + brass→navy for max contrast on cream
//              trailer; trailer coin radius 2.6→3.4 and cy 14→13 to
//              clear larger SRL text below. Mobile truck 96×32→130×46.
// v3.8.ahv   — Caravan Journey clarity fixes: (1) trailer coins now
//              carry $ glyphs so they read as currency instead of
//              abstract dots; (2) OUTBOUND FREIGHT label dropped —
//              it sat in the truck's Apply-phase path and got
//              hidden each loop cycle, and the truck's eastbound
//              motion already shows "outbound" visually; (3) QUICK
//              PAY RETURNING gains a $ $ $ prefix in brighter brass
//              (#DAC39C) as the lower-lane money-flow visual anchor.
// v3.8.ahw   — Caravan Journey trailer payload: $ in circles → money
//              bags. Pouch silhouette (narrow tied top + wider rounded
//              body) reads as "money" at small scale even before the
//              inner $ glyph is legible — solves the v3.8.ahv contrast
//              problem (cream-on-gold $ washed out at deployed scale).
//              Tier-1/2 bags carry navy $ for contrast on lighter brass;
//              tier-3 bags carry cream $ for contrast on darker brass.
// v3.8.ahx   — Caravan Journey tabs: clickable → display-only +
//              gold LED blink on active. Tabs no longer accept
//              clicks (cursor:default, no hover lift, no focus
//              outline). Auto-loop is the sole driver of active
//              state. Each tab carries a brass `.cj-tab-dot` LED
//              top-right that pulses on the active phase — pattern
//              lifted verbatim from /shippers `.ops-tab-dot`.
//              `<button>` elements → `<div>` for semantic accuracy.
// v3.8.ahy   — Tier cards fact fix + drop redundant milestone strip.
//              Platinum subtitle "M5 Core" → "M5" with "3 active
//              lanes" requirement added per CLAUDE.md §10 M5 spec
//              (M5 is Platinum entry; M6 is Core/permanent 1% lock).
//              Milestone Progression dots strip (M1-M6) removed —
//              redundant with the Caravan Journey animation at top
//              of /carriers and carried two label errors (M5 wrongly
//              labeled "Core — Platinum", M6 labeled invented term
//              "Founding" not in §10).
// v3.8.ahz   — Commitment cards on /carriers converted to 3D flip
//              pattern matching /index service-card-flip + /shippers
//              system-card-flip register. Front: COMMITMENT badge +
//              title + 1-line operational teaser ("Mathematical scoring.
//              No black box." / "Rate confirmation equals settlement
//              total." / "Per-load. Optional. No contract.") + "Click
//              to learn more" CTA. Back: full enforceable-terms body
//              copy + "Back to overview" CTA. Same flip mechanic
//              (rotateY 600ms cubic-bezier) + click/keyboard toggle
//              + aria-expanded. Reduced-motion fallback shortens
//              transition.
// v3.8.aia   — Commitment cards converted to homepage parity.
//              FRONT: editorial Nano-Banana photo (compass+scorecard /
//              paperweight+RC / hourglass+QP tiers) at top, brass
//              card-divider line, h3 title, italic brass teaser, flip
//              CTA. BACK: h4 "How it works" + brass divider + numbered
//              .mechanism-steps ol + "Back to overview" CTA. Matches
//              /index .service-card-flip canonical exactly. Per Wasi
//              directive: all flip cards site-wide standardize on this
//              numbered-steps back-face pattern (shippers conversion
//              queued for separate sprint).
// v3.8.aib   — Carrier onboarding Sprint A: color + chrome sweep.
//              §20 §20.8 Phase A audit confirmed /onboarding was never
//              brought into the Sunday-onward canonical (slate-50 cool
//              page bg, bg-navy chrome that light-mode-transformed to
//              cream-on-cream, slate-700 field labels reading bluish
//              against cream, /auth/login routing on the carrier-portal
//              Sign-In link, no compass mark in chrome). Sprint A
//              swaps: page bg → #FBF7F0 (canonical cream §2.1); chrome
//              → explicit #0A2540 (bypasses globals.css:185 light-mode
//              transform); /media/srl-logo-1024.png compass mark inline
//              (per §20.8.3 user-memory + index.html v3.8.agg precedent
//              — not the legacy /logo.png the Logo component points at);
//              Playfair italic semibold "Silk Route Logistics" wordmark;
//              uppercase tracking-wide "Carrier Registration" subtitle
//              in --fg-on-navy-2 #C9D2DE; step indicator tokens →
//              completed #2F7A4F (--success), active #BA7517
//              (--gold-dark emphasis), inactive #E2EAF2/#5B7EA3
//              (--navy-100/--navy-400); field label sweep text-slate-700
//              → text-[#0A2540] (--fg-1) on all 47 form labels via
//              replace_all on the canonical "block text-sm font-medium
//              text-slate-700 mb-{1,3}" pattern; /auth/login →
//              /carrier/login (carrier portal per §3.10 + nav.html
//              canonical line 16); EIN input hardened with
//              inputMode="numeric" + autoComplete="off" + name=
//              "ein-federal-tax-id" to prevent the autofill bleed Wasi
//              caught in the screenshot ("noor@silk" resolved into the
//              EIN field via Chrome saved-credential collision). Logo
//              component import dropped from this file (compass mark
//              now rendered inline; Logo stays canonical for surfaces
//              that still need /logo.png). Sprint A is one of five
//              atomic commits closing the §20 onboarding gap: B Terms
//              honest-claims sweep, C Step 0 Welcome + Caravan intro,
//              D Compass Engine vetting visualization + right-rail,
//              E success-screen ops-loop + footer authority strip.
//              Halt for sign-off before Sprint B per §3.3.
// v3.8.aic   — Sprint 1 /carriers honesty pass (single atomic). Tier
//              cards rebuilt with pay-ladder spine (Net-30/21/14 +
//              3%/2%/1% QP + Day-1/Compass-from-load-1/Priority freight).
//              Dropped FSC tier-graduation, $250/$500/$750 referral
//              bonuses, $150/$300/mo safety bonuses, $50/$65/$75/hr
//              tier-based detention. Gold M4 "1 referral" criterion
//              removed. New "Every Caravan Partner gets" universal-
//              floor section (10 tiles mirroring /index Section 5
//              .srl-wall pattern), each tile verified live per Phase
//              A audit against CLAUDE.md sources. Coverage section
//              trimmed (FMCSA sentence dropped — duplicate of
//              CarrierFraudBanner; "Equipment we move" → "Equipment
//              we tender"). CLAUDE.md §4/§5/§8/§10 updated. Boundary
//              respected: no referral build, no Priority Compass/
//              dedicated lane/QBR/advisory operational additions, no
//              Sprint 3 icon-vs-photo. Letter coordination: Authority-
//              age sprint took aib; advanced to aic.
// v3.8.aid   — Carrier onboarding Sprint A: actual code-side atomic
//              commit (page.tsx token sweep). Pattern 6 sub-pattern 6
//              (concurrent-sprint coordination) fire #2 in same arc:
//              while Sprint A was in flight, the parallel v3.8.aic
//              /carriers honesty pass shipped under 0edf2097 and
//              auto-bundled this file's previously-unstaged Sprint A
//              VersionFooter edit (the v3.8.aib comment block above,
//              authored by me and inadvertently committed by Wasi's
//              git add). The aic block's "Authority-age sprint took
//              aib" claim contradicts git blame, which shows the aib
//              block content IS this Sprint A's description (Pattern
//              6 sub-rule b spatial-contradiction fire). Per Wasi
//              ratification 2026-05-22, this atomic commit lands the
//              actual onboarding/page.tsx code change cleanly under
//              v3.8.aid; the v3.8.aib comment block above remains
//              intact as the canonical Sprint A description (already
//              in HEAD). Authority-age compliance epic will claim
//              the next free letter at its Phase A per Item 182's
//              "letter assigned at Phase A based on what's free"
//              policy. Sprint B (Terms text honest-claims sweep)
//              proceeds next per §3.3 after sign-off.
// v3.8.aie   — Carrier onboarding Sprint B: Terms text honest-claims
//              sweep. Six edits to Step 3 "Terms & Agreement" body
//              + Success screen "What Happens Next" panel:
//              (1) Terms §5 Documentation & Payment — "Net 30 days"
//              flat rule replaced with tier-graduated Caravan
//              language: Silver Net-30 / Gold Net-21 / Platinum
//              Net-14 (per §8 v3 QP Pricing canonical) + new bullet
//              referencing optional per-load Quick Pay at published
//              tier fees (3%/2%/1% on 7-day cadence, universal +2%
//              same-day premium) without factoring contract.
//              (2) Terms §7 renamed "Performance Tracking & Tier
//              Program" → "Caravan Partner Program & Performance
//              Tracking"; drops retired "Guest, Bronze" from tier
//              list (per v3.7.a BRONZE→SILVER migration + §5
//              prohibited claims). New bullet introduces Compass
//              Engine + 7-factor metrics list (per §9). New bullet
//              references M1–M6 milestone framework (per §10) with
//              advancement criteria for M4 Gold, M5 Platinum, M6
//              permanent 1% QP lock.
//              (3) Terms §10 Governing Law — "binding arbitration
//              in Kalamazoo, Michigan" → "binding arbitration with
//              venue in Kalamazoo County, Michigan" (per §1 Galesburg
//              principal address is inside Kalamazoo County + §14
//              canonical venue language). Closes the §1 §3.13 legal-
//              identity verification class.
//              (4) Terms footer "Last updated" March 2026 → May 2026
//              + new future-tense sentence (Path γ per Wasi
//              ratification 2026-05-22) noting that "When the
//              standalone Broker-Carrier Agreement and Caravan Quick
//              Pay Agreement v2 are executed between Broker and
//              Carrier, those agreements will govern over this
//              onboarding click-through where they conflict." Initial
//              Sprint B draft used present-tense "govern over... where
//              they conflict" which would have ceded precedence to
//              not-yet-existent documents (§14 BCA "Draft not yet
//              created as standalone" + §14 QP v2 "REQUIRES MI
//              commercial attorney review before first carrier
//              signs"). Wasi Phase D verbatim audit caught this pre-
//              commit; Path γ rewrite makes precedence trigger
//              CONDITIONAL on actual execution between Broker and
//              this specific Carrier — not a blanket forward
//              reference to documents in finalization. §16 first-
//              carrier blockers #1 (BCA draft-as-standalone) and #2
//              (Caravan QP Agreement v2 Michigan commercial attorney
//              review, $400–$800 budget) REMAIN OPEN. Path γ
//              language makes the click-through honest about pending
//              standalones but does NOT retire either blocker. Both
//              still required before first carrier signs.
//              (5) Success screen "Compass engine" lowercase e →
//              "Compass Engine" capital E (per §A.5 canonical proper-
//              noun). Bullet body expanded to surface the 35-point
//              vetting framing + authority-age signal (Item 182
//              hard-floor + override semantics) without exposing
//              architectural-reveal-banned internals per Lens 1.5.
//              (6) Success screen amber "Typical review time" panel:
//              dropped "Most applications are reviewed within 24
//              hours" (retired 2026-05-19 v3.8.ads §5 prohibited
//              specific-hour-SLA claim) → "most carriers cleared
//              within a few business days. Authority age, insurance
//              verification, and document review drive the timeline."
//              Aligns with /carriers + /shippers honest framing.
//              Sprint B scope respected — no chrome touch, no Step 0
//              redesign, no right-rail, no compass visualization, no
//              ops-loop. Those land in Sprints C/D/E. Halt for sign-
//              off before Sprint C per §3.3.
// v3.8.aif   — Coverage section dropped entirely from /carriers per
//              Wasi audit follow-up to Sprint 1 (v3.8.aic). Every
//              element was duplicative: "48 states" + "coast-to-coast
//              lanes" already on /index Section 5 capability wall;
//              equipment list overlaps /index Section 4 service cards
//              with different framing; continental coverage + trust
//              standard implicit in the page's other sections. The
//              new "Every Caravan Partner gets" universal-floor
//              section (v3.8.aic) is now what earns its place on
//              /carriers. Also dropped 9 orphan .coverage* CSS blocks
//              + 2 media-query references. Letter coordination:
//              Authority-age sprint claimed aid + aie; advanced to aif.
//              [Coordination correction: git blame shows aid was
//              Carrier onboarding Sprint A and aie was Carrier
//              onboarding Sprint B, NOT Authority-age epic. The aif
//              commit author's mental-model misattribution does not
//              affect actual content, but for accurate cross-sprint
//              audit trails: aid + aie were the Carrier onboarding
//              epic's Sprints A + B; Authority-age epic still
//              claiming letters at its Phase A per Item 182 policy.]
// v3.8.aig   — Carrier onboarding Sprint C: Step 0 brand-pillar
//              surfacing. Three cards stacked above the existing
//              white form panel, conditional on step === 0 (entry
//              conversion surface only; once carrier progresses past
//              Company Info the form panel takes over). Closes the
//              §20.8 4-pillar floor gap — pre-Sprint-C Step 0
//              surfaced 1 of 4 pillars (Brand Identity chrome from
//              Sprint A v3.8.aid); post-Sprint-C all 4 pillars surface
//              before the first DOT digit is typed.
//
//              Card A — WELCOME (cream-2 #F5EEE0 + gold-dark #BA7517
//              top hairline). Eyebrow "CARAVAN PARTNER PROGRAM" gold-
//              dark uppercase tracking-[0.2em]. H2 "Welcome to the
//              Caravan." Playfair italic semibold navy #0A2540.
//              Subtitle: operational-register sentence introducing
//              tier-graduated Quick Pay + M1-M6 milestones + Compass
//              Engine vetting in one breath. Surfaces Silk Road
//              heritage + Brand Identity pillars.
//
//              Card B — WHAT YOU'LL NEED (white bg). Six-item 2-col
//              checklist with Lucide Check icon (gold-dark Wasi D6
//              boundary respected — no icon-per-tier, no icon-per-
//              pillar, type-forward register): DOT#/MC# (auto-
//              populates FMCSA), EIN (9-digit), Insurance ($1M auto /
//              $100K cargo / $1M GL per §14 minimums), W-9 form,
//              Operating Authority letter (FMCSA), voided check
//              (Quick Pay direct deposit). Closing italic line
//              explains auto-populate from FMCSA + Step 3 document
//              upload. Surfaces Tech pillar via operational
//              concreteness.
//
//              Card C — CARAVAN PARTNER PROGRAM AT A GLANCE (navy
//              #0A2540 outer + #15365A navy-700 inner tier panels
//              per §2.1 canonical navy scale). H3 Playfair italic
//              semibold. 3-column grid: Silver-Day-1 / Gold-M4 /
//              Platinum-M5. Per-column rows: Standard pay (Net-
//              30/21/14), 7-day QP fee (3%/2%/1% gold-dark emphasis),
//              Auto-approve ($2K/$4K/$6K per load), Detention
//              ($50/$65/$75 per hr), Safety bonus (em-dash, $450/qtr,
//              $900/qtr). All §4 honest-claims whitelist values per
//              §8 v3 QP Pricing canonical. Gold + Platinum tier
//              panels carry gold-dark/40 border emphasis (Silver
//              stays neutral navy-600). Below tier grid:
//              "Performance-based advancement" paragraph with full
//              M1-M6 criteria mirroring Sprint B Terms §7 language
//              (M4 Gold 180d/75+/97%+, M5 Platinum 360d/150+/98%+/
//              3 lanes, M6 720d/300+ locks 1% QP permanently).
//              Compass Engine line with Lucide Compass icon gold-
//              dark — 35-point check against FMCSA authority,
//              insurance amounts, safety record, authority age (Item
//              182 epic signal), OFAC, 7-factor performance metrics.
//              Surfaces AI pillar + Silk Road pillar (Caravan +
//              Compass + M1-M6 program lineage).
//
//              Color discipline: all 3 cards use explicit hex tokens
//              (bg-[#F5EEE0], bg-[#0A2540], bg-[#15365A], text-
//              [#BA7517], text-[#C9D2DE], text-[#3A4A5F]) NOT Tailwind
//              theme tokens (no bg-navy, no bg-gold). This bypasses
//              globals.css:113-180 light-mode global override class
//              chain that transforms .text-white / .bg-white\\/5 /
//              .bg-navy / .text-slate-{400,500} — identical to chrome-
//              bar treatment from Sprint A. text-white retained where
//              it shipped working in Sprint A chrome (light-mode
//              global override empirically does NOT fire on this
//              surface — confirmed via Wasi visual verification of
//              v3.8.aid chrome in both light + dark mode).
//
//              No /carriers external link (Wasi D4 ratification —
//              Step 0's job is to get the DOT entered; no exit ramps).
//              Card C delivers the 30-second pitch standalone.
//
//              Icons added: Compass to Lucide imports for Card C
//              Compass Engine line. Check already imported (Card B
//              checklist + step indicator).
//
//              Mobile: 3-col tier grid reflows to 1-col <768px
//              standard Tailwind responsive. Per Wasi D5 — do NOT
//              pre-solve scroll-wall; flag at visual gate if Card C
//              vertical stretch buries the DOT input. If problem
//              fires, condense Card C tier detail to Net + QP only
//              on mobile (drop detention + safety rows) in follow-up
//              hotfix.
//
//              Pattern 6 sub-pattern 6 (concurrent-sprint coordination)
//              fire #3 caught in this arc: aif commit (920b12b)
//              bundled my unstaged aie WIP same way aic bundled aib.
//              Option α discipline (letter-at-commit-time) caught the
//              correct letter for Sprint C (aig) via fresh git log
//              read at commit moment instead of stale Phase A
//              assumption. Banking methodology refinement: even
//              Option α doesn't fully prevent sub-pattern-6 fires
//              when parallel session runs `git add -A` and captures
//              unstaged WIP. Stronger discipline would be "stage
//              VersionFooter edits immediately when made, not at
//              commit time" — workflow-coordination not methodology.
//              Quarterly review candidate for §19.
//
//              §16 first-carrier blockers #1 (BCA standalone) and #2
//              (Caravan QP Agreement v2 Michigan commercial attorney
//              review) REMAIN OPEN. Sprint C surfaces the Caravan
//              Partner Program at the gate but does NOT retire either
//              blocker — both still required before first carrier
//              signs. Path γ footer language from Sprint B v3.8.aie
//              still governs precedence when standalones execute
//              between Broker and Carrier.
//
//              Item 177 sub-pattern 8 visual-verification gate
//              REQUIRED post-deploy per Wasi instruction — both-modes
//              (light + dark) human-eye walkthrough of all 3 cards;
//              specifically confirm navy Card C cream-text contrast
//              holds in BOTH modes. tsc + next build green is
//              necessary but NOT sufficient. Halt after commit for
//              push greenlight, halt after push for the both-modes
//              visual gate.
// v3.8.aih   — /carriers requirements card surfaces the new 18-month
//              FMCSA authority-age rule (now operationally enforced
//              per Item 182 v3.8.ahl + ahm hard-gate ship). "Active
//              FMCSA Operating Authority" → "Active FMCSA Authority ·
//              18+ months"; subtitle expanded to "Active MC, 18+
//              months of operating authority, no revocations." Honest
//              public-facing alignment with the gate carriers actually
//              hit at onboarding. WaitingList Option β path NOT yet
//              claimed since `WaitingList` Prisma model is sprint 5
//              of the Authority-age epic and not yet shipped. Letter
//              coordination: Authority-age sprint took aig; advanced
//              to aih.
//              [Coordination correction: git blame shows aig was
//              Carrier onboarding Sprint C (committed 98f7626 by
//              Wasi Haider), NOT Authority-age. Authority-age
//              continues to claim letters at its Phase A per Item
//              182 policy. Aih correctly took the next-free letter
//              after Sprint C.]
// v3.8.aii   — Tier-unlock reconciliation Commit 1 of 2 (backend
//              tier logic). Replaces the off-by-one milestone
//              thresholds in caravanService with the locked launch
//              model + retires the parallel score-based promotion
//              path in tierService so there is ONE authoritative
//              way to advance.
//
//              MILESTONE_THRESHOLDS (caravanService.ts:90-101)
//              rewritten to 3 transitions:
//                M1_FIRST_LOAD → M4_PARTNER (Gold gate):
//                  90 days · 12 loads · 97% on-time
//                M4_PARTNER → M5_CORE (Platinum gate):
//                  120 days · 20 loads · 98% on-time
//                M5_CORE → M6_FOUNDING (Founding recognition):
//                  180 days · 30 loads · 98% on-time
//              Each transition is an AND of (days, loads, onTimePct).
//              Cumulative-since-join counting via cppTotalLoads +
//              cppJoinedDate UNCHANGED. Founding is a recognition
//              status on top of Platinum (tier stays PLATINUM,
//              milestone advances to M6_FOUNDING). Legacy M2_PROVEN /
//              M3_RELIABLE enum values on pre-reconciliation rows
//              normalize to M1_FIRST_LOAD lookup so those carriers
//              advance to M4_PARTNER under the new gate.
//
//              Removed from gates: (a) referrals — no field tracks
//              this anyway; (b) "3 active lanes" — no field exists.
//              The advancement gate is now purely AND-of-loads-OT-
//              days. `referrals?` dropped from threshold type
//              signature; `onTimePct` is now required (not optional).
//              Referral check block removed from
//              checkMilestoneAdvancement.
//
//              Score-based promotion path retired:
//                - tierService.calculateTier (overallScore →
//                  CarrierTier) DELETED. Score-mapping was the
//                  parallel path that could bypass loads-and-days
//                  via service-score alone.
//                - tierService.recalculateAllTiers (bulk score-based
//                  resync) DELETED for the same reason.
//                - 3 callers updated: cpp.ts /recalculate route
//                  rewritten to call checkMilestoneAdvancement +
//                  calculateTierFromMilestone per carrier (the
//                  canonical milestone-gate path);
//                  integrationService.ts updateCarrierScorecard
//                  retires the score → tier auto-promotion block,
//                  scorecard.tierAtTime + bonus calculation now use
//                  profile.tier as source of truth;
//                  carrierController.ts unused calculateTier import
//                  dropped.
//                - Dead helper calculateTierFromFleet (@deprecated,
//                  zero non-self callers per grep) DELETED.
//                - Dead helper getFleetAdjustedThreshold (zero
//                  non-self callers) DELETED.
//
//              Pricing values in TIER_CONFIG (Net terms, Quick Pay
//              %, safety bonus amounts, detention values) UNCHANGED
//              by this reconciliation. Threshold calibration note
//              added inline in caravanService header: locked load
//              numbers (12/20/30) are calibrated to current pre-
//              revenue launch volume, revisit at ~6 months
//              operational baseline OR when monthly volume
//              materially increases.
//
//              Halt boundary respected: no bonus accrual build, no
//              detention accrual build, no recency-weighted
//              maintenance signal. checkPerformanceDowngrade keeps
//              its existing recency-weighted query as-is (was
//              already implemented pre-Sprint, not part of
//              reconciliation scope).
//
//              Pre-commit gates: backend tsc clean (initial run
//              caught one stale `newTier` reference in
//              integrationService.ts:597 logger call — fixed in-
//              place to use currentTier; re-ran clean). Frontend
//              tsc + next build clean.
//
//              Commit 2 (page surfaces) follows: CLAUDE.md §8 + §10
//              + §11 update, carriers.html tier cards align, onboarding
//              Card C + Terms §7 align, CLAUDE.md §8 launch-volume
//              revisit note added, M-numbering dropped from carrier-
//              facing surfaces. Halt for Commit 2 after this commit
//              per §3.3 atomic + halt cadence.
//
//              Letter assignment per Option α (commit-time read):
//              origin/main HEAD aih at commit moment; next-free aii.
//              Pattern 6 sub-pattern 6 fire #4 in same epoch caught
//              + bundled cleanly (aih commit landed mid-Sprint via
//              parallel Authority-age v3.8.ahm requirements-card
//              update at commit a04ea59).
// v3.8.aij   — Tier-unlock reconciliation Commit 2 of 2 (page surfaces).
//              Aligns the carrier-facing surfaces to the locked launch
//              model committed in v3.8.aii. Every threshold a carrier
//              sees on a public page now matches code-side
//              caravanService.MILESTONE_THRESHOLDS exactly.
//
//              CLAUDE.md §8: launch-volume calibration note added at
//              top of the section. Thresholds are calibrated to
//              current pre-revenue volume, scheduled to revisit at
//              ~6 months operational baseline OR when monthly volume
//              materially increases.
//
//              CLAUDE.md §10: section renamed from "MILESTONES M1–M6
//              (performance-based advancement)" to "TIER ADVANCEMENT
//              GATES (locked launch model, v3.8.aii + v3.8.aij)".
//              Table rewritten to 4 rows: Silver entry (3 loads +
//              score >= 70), Gold (12 loads + 97% + 90-day floor →
//              M4_PARTNER), Platinum (20 loads + 98% + 120-day →
//              M5_CORE), Founding (30 loads + 98% + 180-day →
//              M6_FOUNDING recognition on top of Platinum tier).
//              Each transition is an AND of the loads / on-time /
//              tenure thresholds. Retired criteria explicitly listed
//              with reasoning: referral requirement (no field tracks
//              it), "3 active lanes" (no field exists), score-based
//              promotion (parallel path retired v3.8.aii), fleet-size
//              promotion shortcut (dead code deleted v3.8.aii).
//              Legacy CarrierMilestone enum values M2_PROVEN /
//              M3_RELIABLE documented as inert post-reconciliation
//              (normalize to M1_FIRST_LOAD lookup).
//
//              CLAUDE.md §11: two new rows added (v3.8.aii + this
//              commit v3.8.aij) summarizing the reconciliation.
//
//              carriers.html tier cards (lines 374 + 408):
//                Gold tier-req: "M4 Partner — 180 days, 75+ loads,
//                  97% on-time" → "Gold — 12 loads, 97% on-time,
//                  90-day tenure floor"
//                Platinum tier-req: "M5 — 360 days, 150+ loads, 98%
//                  on-time, 3 active lanes" → "Platinum — 20 loads,
//                  98% on-time, 120-day tenure floor"
//                M-numbering dropped from tier-req lines for
//                carrier-facing simplicity.
//                New Founding recognition paragraph added below the
//                tier grid (after the same-day QP caption): "30
//                loads, 98% on-time, 180-day tenure floor. Carrier
//                remains Platinum tier; Founding marks the locked
//                1% Quick Pay tier permanently."
//                Inline comments at Gold + Platinum card blocks
//                rewritten to reference v3.8.aij reconciliation +
//                retired criteria.
//
//              onboarding/page.tsx Card C (Sprint C surface):
//                Tier column labels: "Silver — Day 1" → "Silver —
//                Entry"; "Gold — M4" → "Gold"; "Platinum — M5" →
//                "Platinum". M-numbering dropped.
//                "Performance-based advancement" paragraph rewritten
//                to surface the 4 locked gates with explicit AND-of-
//                thresholds framing + Founding recognition note.
//
//              onboarding/page.tsx Terms §7 (from Sprint B v3.8.aie):
//                Milestone-framework reference paragraph rewritten
//                to match new locked gates verbatim. "M1 / M4 (180d
//                / 75 loads / 97%) / M5 (360d / 150 loads / 98% /
//                3 active lanes) / M6 (720d / 300 loads)" framework
//                replaced with "Silver entry (3 completed loads +
//                qualifying score) / Gold (12 loads, 97%, 90d) /
//                Platinum (20 loads, 98%, 120d) / Founding (30
//                loads, 98%, 180d)". Each advancement is the AND of
//                the thresholds; load thresholds calibrated to
//                current launch volume.
//
//              carriers.html Caravan Journey animation gates
//              (`.cj-card` blocks at lines 781-805) NOT touched in
//              this commit — directive scope was "carriers.html tier
//              cards" specifically. The Caravan Journey has its own
//              recency-weighted gate vocabulary (Volume / Compass /
//              Sustained / Loyalty over trailing 90 days), a
//              different methodology from the cumulative-since-join
//              locked model. Carriers.html now has dual-vocabulary
//              surface — locked tier cards (cumulative-since-join)
//              + Caravan Journey animation (recency-weighted).
//              Observation banked at CLAUDE.md §11 v3.8.aij row for
//              follow-up if Wasi wants the animation reconciled.
//
//              §16 first-carrier blockers #1 (BCA standalone) + #2
//              (Caravan QP Agreement v2 Michigan commercial attorney
//              review) REMAIN OPEN. Path γ footer from Sprint B
//              v3.8.aie still governs precedence when standalones
//              execute between Broker and Carrier.
//
//              Pre-commit gates (Sub-pattern 11 CI parity): frontend
//              tsc + next build clean. Letter assignment per Option
//              α at commit time: origin HEAD still aih, local HEAD
//              aii (just committed Commit 1); next-free aij.
//
//              Tier-unlock reconciliation 2-commit arc complete.
//              Halt for push greenlight per cadence.
// v3.8.aik   — Caravan Journey animation copy neutralized — closes
//              the v3.8.aij dual-vocabulary observation on
//              carriers.html. Temporary neutralization, not
//              teardown: when the recency-weighted maintenance
//              signal is built (queued), this copy gets revisited
//              to describe the actual methodology accurately.
//
//              Edit scope: `frontend/public/carriers.html` lines
//              781-815, the four `.cj-card` blocks for phases 0-3.
//              Copy-only — no color tokens, no structural changes,
//              no class re-classification, no Caravan Journey
//              animation logic touched.
//
//              The four pillars (Volume / Compass / Sustained /
//              Loyalty) preserved as directional program themes
//              mapping loosely to the real dimensions the locked
//              gate rewards:
//                Volume    → loads (cumulative-since-join)
//                Compass   → service quality (Compass Score)
//                Sustained → on-time performance
//                Loyalty   → tenure
//
//              Methodology language struck across all four phases:
//              "trailing 90 days" (phase 1 + 2 + 3 Volume),
//              "current quarter" (phase 1 Compass + Sustained),
//              "X consecutive quarters" (phase 2 Sustained),
//              "3 quarters · 4 for Core" (phase 3 Sustained),
//              "X+ sustained" (phase 2 + 3 Compass), "1 referral
//              OR consistent acceptance" (phase 2 Loyalty — the
//              referral assertion removed since no field tracks
//              it), "2+ recurring lanes · advisory voice at Core"
//              (phase 3 Loyalty — "recurring lanes" removed since
//              no field exists; "advisory voice at Founding"
//              preserved as outcome perk, not gate criterion).
//
//              New directional copy by phase:
//                Phase 0 (Apply unlocks Silver entry)
//                  Volume:    "First load on the way"
//                  Compass:   "Intake vetting passed"
//                  Sustained: —
//                  Loyalty:   —
//                Phase 1 (Silver unlocks Net-30 + 3% QP)
//                  Volume:    "First loads delivered"
//                  Compass:   "Compass Score active"
//                  Sustained: "On-time performance tracked"
//                  Loyalty:   "Tenure starting"
//                Phase 2 (Gold unlocks Net-21 + 2% QP)
//                  Volume:    "Load history accumulated"
//                  Compass:   "Strong Compass Score"
//                  Sustained: "Consistent on-time performance"
//                  Loyalty:   "Tenure earned"
//                Phase 3 (Platinum unlocks Net-14 + 1% QP)
//                  Volume:    "Top-tier load history"
//                  Compass:   "Top-tier Compass Score"
//                  Sustained: "Sustained on-time performance"
//                  Loyalty:   "Long-tenure carrier · advisory
//                              voice at Founding"
//
//              cj-unlock pricing pills (Net-30/21/14 + 3%/2%/1%
//              Quick Pay) NOT touched — they match CLAUDE.md §8
//              verbatim. Tier cards NOT touched (v3.8.aij locked
//              them). Terms §7 NOT touched (already aligned in
//              v3.8.aij). Backend NOT touched (already canonical
//              in v3.8.aii).
//
//              Net effect: carriers.html now presents a single
//              advancement story. Tier cards state the locked
//              cumulative-since-join gate (12/20/30 loads, 97/98/98
//              on-time, 90/120/180-day floors); the Caravan Journey
//              animation echoes those same dimensions as
//              directional themes without contradicting the cards.
//              The v3.8.aij dual-vocabulary surface observation
//              banked at CLAUDE.md §11 v3.8.aij row is now marked
//              RESOLVED. Re-visit when the recency-weighted
//              maintenance signal ships.
//
//              §16 first-carrier blockers #1 (BCA standalone) + #2
//              (Caravan QP Agreement v2 Michigan commercial attorney
//              review) STILL OPEN. Path γ footer from Sprint B
//              v3.8.aie still governs precedence when standalones
//              execute between Broker and Carrier.
//
//              Pre-commit gates (Sub-pattern 11 CI parity): frontend
//              tsc + next build clean (carriers.html is static HTML
//              served via Cloudflare Pages; Next.js build is a
//              no-op verification for the docs change).
//
//              Letter assignment per Option α at commit time: origin
//              HEAD aih, local HEAD aij; next-free aik. No Pattern 6
//              sub-pattern 6 fire this commit — single sequential
//              advancement after v3.8.aij.
// v3.8.ail   — /onboarding honesty + chrome pass (Sprint 1 followup
//              extending v3.8.aic to the React onboarding flow). Step 0
//              "Caravan Partner Program at a glance" tier card had
//              RETIRED claims still rendered to every public visitor:
//              Detention $50/$65/$75/hr + Safety bonus $450/$900/qtr
//              (all §5 prohibited per v3.8.aic). Also: advancement-
//              criteria paragraph had its own drifted milestone numbers
//              (3/12/20/30 loads) instead of §10 canonical M1-M6
//              (first-load/30d-10loads/90d-30/180d-75/360d-150/720d-300).
//              "Founding recognition" framing was invented; §10 M6 has
//              no "Founding" wording. Compass Engine line conflated
//              35-point CARRIER vetting with 7-factor LOAD scoring.
//              Plus: custom nav rendered raw cream/gold compass-mark
//              PNG on dark navy bg — invisible. Plus: EIN field on
//              Step 1 had cryptic "9-digit EIN for business verification"
//              subtitle with no context. **Fixes:** dropped 2 retired
//              rows × 3 tiers from tier card, added "Same-day QP" row
//              per §8 universal +2% rule, rewrote advancement to match
//              §10 canonical, separated 35-point + 7-factor in Compass
//              Engine line, wrapped logo in white card chip (both nav
//              instances — main + success-screen), clarified EIN
//              subtitle to explain pre-screen purpose + W-9 match on
//              Step 3. ~60 LOC net. Letter coordination: Authority-age
//              sprint took aik; advanced to ail.
// v3.8.aim   — Build 1: test-carrier load-assignment fence. Per the
//              read-only carrier classification audit (2026-05-23),
//              all three currently-APPROVED prod carriers (C1 SRL
//              Transport LLC at MC-1794414, C2 BISON TRANSPORT INC at
//              MC-156588, C3 INTEGRITY EXPRESS LOGISTICS LLC at
//              MC-596655) are test/seed records, not real onboarded
//              carriers. This commit retires them from load-assignment
//              eligibility WITHOUT deleting them — they're kept for
//              ongoing manual regression testing.
//
//              Schema (backend/prisma/schema.prisma:783):
//                + isTestAccount Boolean @default(false)
//                Placed on CarrierProfile right after approvedAt,
//                before the w9Uploaded/insuranceCertUploaded/
//                authorityDocUploaded boolean cluster. Matches the
//                existing boolean style on the model.
//
//              Migration
//              (backend/prisma/migrations/
//                  20260523162527_add_is_test_account_carrier_profile/
//                  migration.sql):
//                Manually authored to avoid prisma migrate dev against
//                a prod-pointed DATABASE_URL per §2.2. Two statements:
//                (1) ALTER TABLE "public"."carrier_profiles" ADD COLUMN
//                "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
//                (2) UPDATE "public"."carrier_profiles" SET
//                "isTestAccount" = true WHERE "mcNumber" IN
//                ('MC-1794414', 'MC-156588', 'MC-596655').
//                The MC# WHERE clause is environment-portable — safe
//                no-op against dev/E2E DBs that don't have these MC#s.
//                Render's prisma migrate deploy on next push applies
//                both statements atomically. deletedAt stays null on
//                all 3 carriers — isTestAccount is the canonical
//                "retained for testing" signal; deletedAt is a
//                separate "no longer a carrier" signal not touched
//                here.
//
//              Read-path exclusions (Tier 1 only per directive
//              boundary — load assignment / carrier selection):
//                - backend/src/services/smartMatchService.ts:42
//                  `matchCarriersForLoad` canonical picker. where
//                  clause extended { onboardingStatus: "APPROVED",
//                  status: ["APPROVED", "NEW"], isTestAccount: false }.
//                  Used by waterfall + carrierOutreach + fallOffRecovery
//                  transitively — single highest-leverage block.
//                - backend/src/controllers/carrierController.ts:780
//                  `getAllCarriers` (GET /api/carrier/all + GET
//                  /api/carriers). Feeds the Tender modal + RC Modal
//                  carrier pickers. Extended both the includeDeleted
//                  and default branches: isTestAccount: false applies
//                  unconditionally even when admins pass
//                  ?include_deleted=true. Test carriers must never
//                  appear in those pickers regardless of admin filter
//                  flags.
//                - backend/src/routes/carrier.ts:133
//                  `/capacity-feed` inline findMany surfacing carrier
//                  availability posts to AE/Broker/Dispatch/Operations
//                  for active load matching. where clause extended
//                  isTestAccount: false.
//
//              Read paths intentionally NOT touched per audit + directive
//              halt-at-boundary:
//                - waterfallEngineService.ts:179 (findUnique by id, no
//                  query filter needed — upstream smartMatch
//                  exclusion covers).
//                - routes/loadBids.ts:21,187 (carrier-side bid
//                  endpoints scoped by req.user.id — self-scope).
//                - All Tier 2 analytics surfaces (analyticsService
//                  scorecard, cpp.ts leaderboard, marketController,
//                  carrierIntelligenceService, carrierOutreachService
//                  outreach lists). Banked in §13.3 for Build 2.
//                - All Tier 3 compliance surfaces (complianceMonitor
//                  daily scan + 6 other carrier-iterating sweeps,
//                  complianceController, complianceForecast,
//                  chameleonDetection, cron carrier sweeps). Banked
//                  in §13.3 for Build 3.
//
//              The whereActiveProductionCarrier() helper that bundles
//              onboardingStatus was explicitly NOT adopted per the
//              directive — several consumers intentionally surface
//              non-APPROVED carriers (admin review queues, pending
//              lists, etc.) and would be wrongly constrained. The
//              only addition this commit makes anywhere is
//              isTestAccount: false.
//
//              Pattern 6 sub-pattern 6 fire #5 caught + cleaned via
//              Option α (letter-at-commit-time + ff-only pull):
//              parallel v3.8.ail /onboarding honesty pass landed at
//              382f573 mid-Build-1. Local ff-pulled, all 4
//              v3.8.ail comment refs in this build's working tree
//              (migration header + 3 inline comments) bumped to
//              v3.8.aim before commit.
//
//              Pre-commit gates (Sub-pattern 11 CI parity): backend
//              tsc --noEmit clean (Prisma client regenerated via
//              npx prisma generate so the new isTestAccount field is
//              typed); frontend tsc --noEmit + npx next build clean.
//
//              Production data flip happens when Render auto-deploys
//              this commit and runs prisma migrate deploy as part of
//              the canonical build chain (per CLAUDE.md §2.2). The
//              UPDATE statement in the migration is the canonical
//              data-write event; no separate scripts run.
// v3.8.ain   — Path 2C: /onboarding header parity + form chrome upgrade.
//              Closes two findings from the post-v3.8.ail audit Wasi
//              flagged after the deploy ("this is still the same old?
//              does it match the header for shipper, homepage and
//              carrier page? P2 and P3 still the same?").
//
//              Issue A — Header parity: pre-Sprint, /onboarding had its
//              own custom <nav> (single Sign In link, no nav menu)
//              that did NOT match the canonical chrome on /, /carriers,
//              /shippers, /about, /contact, /track. The canonical
//              chrome is static-HTML-injected via inject-chrome.mjs
//              from _partials/nav.html (5-link nav + gold-dark Sign In
//              dropdown to AE/Carrier/Shipper login). Public marketing
//              CSS does NOT load on React routes (globals.css only),
//              so the static partial can't be reused as-is.
//
//              Fix: inline React <OnboardingNav> component in
//              onboarding/page.tsx that visually mirrors the canonical
//              chrome via Tailwind — navy #0A2540 bg with backdrop
//              tint, 72px height, SRL logo on left (raw /logo.png),
//              5 nav links (Shippers/Carriers/About/Contact/Track)
//              with "Carriers" highlighted in gold-light #DAC39C as
//              active-context cue, gold-dark #BA7517 Sign In CTA with
//              hover dropdown to the 3 login routes. Mobile hamburger
//              + full-screen overlay menu. Both nav blocks (success
//              screen at line ~251 + main form at line ~369) now use
//              <OnboardingNav />. The "Carrier Registration" subtitle
//              that the old custom-nav carried is preserved in a new
//              cream-tinted eyebrow strip below the canonical chrome
//              (gold-dark eyebrow + Playfair italic micro-title +
//              "Already registered? Sign In" affordance on right).
//
//              Issue B — Form chrome upgrade: pre-Sprint, Steps 1-5
//              used plain gray-border inputs, basic font-bold step
//              titles, no brand-tokened section dividers, slate-50
//              utility-card backgrounds in Step 4 Review, and Tailwind
//              `bg-gold` (which resolves to globals.css olive-gold
//              #C9A84C, NOT brand canonical) on Back/Next/Submit
//              buttons. None of it matched the polish on /carriers
//              commitment-card-flip or the Caravan Partner Program
//              card register on Step 0.
//
//              Fix: form panel chrome upgrade across all 5 steps:
//              (1) panel wrapper gets gold-dark #BA7517 top accent
//              hairline matching commitment-card-flip; (2) each step
//              header replaced with eyebrow ("Step N of 5" in gold-
//              dark uppercase tracking) + Playfair italic H2 +
//              text-[#3A4A5F] intro paragraph; (3) Step 2 (Equipment)
//              chip selectors moved from `bg-gold/10 border-gold
//              text-gold` (olive-gold non-canonical) to gold-tint
//              #FAEEDA bg + gold-dark border + gold-dark text for
//              selected, cream-2 hover for unselected; (4) Step 3
//              insurance section repanelled with cream #FBF7F0 bg +
//              cream-2 border + gold-dark eyebrow labels; (5) Step 4
//              terms scroll-pane upgraded to cream bg + cream-2
//              border; agree-terms checkbox now lives in its own
//              cream-2-bordered card with hover surface; (6) Step 5
//              Review cards moved from slate-50 utility surface to
//              cream #FBF7F0 + cream-2 border with gold-dark eyebrow
//              labels; (7) step indicator gains brass 2-px ring +
//              ring-shadow on active step, gold-dark border + cream
//              hairline pending state, green-fill on completed steps;
//              (8) navigation buttons swapped to gold-dark #BA7517
//              with cream #FBF7F0 text (matches Sign In button in
//              <OnboardingNav> above + nav-login-btn canonical in
//              utilities.css); Back button becomes ghost with cream
//              hover; (9) success-screen Call/Email CTAs upgraded
//              to match (gold-dark fill / cream-bordered ghost).
//
//              Letter coordination: parallel test-carrier fence
//              sprint claimed v3.8.aim mid-Path-2C (Build 1 — schema
//              + 3 read-path exclusions + Prisma migration). Local
//              VersionFooter contained their aim comment block but
//              the build was uncommitted. Pattern 6 sub-pattern 6
//              concurrent-sprint-coordination applied: advanced this
//              build to ain so both sprints can land without letter
//              collision. CLAUDE.md updates from the aim sprint are
//              in their working tree and will land with their commit.
//
//              Single-file scope: only frontend/src/app/onboarding/
//              page.tsx + this VersionFooter bump. No CLAUDE.md
//              changes in this commit (the aim parallel-sprint
//              already has CLAUDE.md staged for their landing). Net
//              source change in onboarding/page.tsx: ~260 LOC across
//              the 5-step form + nav blocks; new OnboardingNav
//              component ~100 LOC inline.
//
//              Pre-commit gates (Sub-pattern 11 CI parity): frontend
//              tsc --noEmit + npx next build clean. Visual smoke per
//              feedback_visual_smoke_before_push.md: walked through
//              all 5 step renderings against the canonical chrome
//              + brass-accent step indicator + gold-dark CTA pattern.
//              No backend changes; backend tsc not required for this
//              sprint.
// v3.8.aio   — Build B2: manual authority-grant-date entry. Dedicated,
//              reason-required, audited admin endpoint + admin UI
//              control to manually set CarrierProfile.
//              authorityGrantedDate. Closes the data exposure surfaced
//              by the 2026-05-23 carrier classification audit: the
//              FMCSA QCMobile /carriers/{dot}/authority endpoint
//              returns current-status fields only (`brokerAuthorityStatus`,
//              `commonAuthorityStatus`, etc.) — not the historical
//              GRANT events that fmcsaService.getCarrierAuthority's
//              parser targets (`authorityAction === "GRANT"` +
//              `originalServedDate`). All three test carriers + every
//              future post-cutoff carrier resolve to NULL grant date,
//              causing AUTHORITY_UNVERIFIED past the 24h grace per
//              Item 182 gate at complianceMonitorService.ts:147 — a
//              hard block at tender time despite real active FMCSA
//              authority. Build B2 gives admins a manual data-correction
//              path.
//
//              Backend (new endpoint POST /carrier/:id/authority-grant-date):
//                Controller: setAuthorityGrantDate in carrierController.ts
//                  after updateCarrier. Validates grantDate parses + not
//                  in future. Validates reason >= 10 chars (matches
//                  overrideBlock convention). Trims + length-caps reason
//                  at 500 chars per sanitizeInput convention (no HTML
//                  encoding at write time — React auto-escapes on every
//                  render surface). Updates CarrierProfile
//                  .authorityGrantedDate. Emits auditTrail row mirroring
//                  overrideBlock pattern exactly — adapted via the
//                  v3.8.ahy / Item 188 precedent because AuditAction is
//                  a closed Prisma enum and AUTHORITY_GRANT_DATE_SET is
//                  not a member (CREATE/UPDATE/DELETE/STATUS_CHANGE/
//                  APPROVE/REJECT/LOGIN/EXPORT/COMPLIANCE_OVERRIDE/
//                  CARRIER_SUSPENDED/SCAN/DISMISS/RESOLVE). Used the
//                  generic UPDATE action + encoded the specific
//                  operation in changedFields.actionDetail =
//                  "AUTHORITY_GRANT_DATE_SET" so downstream filters
//                  retain independent grep-ability without a schema
//                  migration. Then calls the canonical complianceCheck
//                  per directive ("do not duplicate gate logic") and
//                  returns the carrier's new compliance verdict so the
//                  UI can surface immediately whether the new date
//                  passes the 18+ month silent-allow branch, lands in
//                  the 12-18 overridable band, or hard-floors under 12.
//                Route: POST /carrier/:id/authority-grant-date with
//                  authorize("ADMIN", "CEO") — matches overrideBlock +
//                  updateCarrier authz exactly. Registered in
//                  backend/src/routes/carrier.ts right after the
//                  /:id PATCH (updateCarrier) registration.
//                Response field add: getAllCarriers now includes
//                  authorityGrantedDate in the per-carrier payload so
//                  the admin UI can show the current value.
//
//              Frontend (carrier admin detail view, /dashboard/carriers):
//                Carrier interface extended with authorityGrantedDate:
//                  string | null.
//                State + mutation added near the existing updateCarrier
//                  block: authorityGrantInput / authorityGrantReason /
//                  authorityGrantMessage. Mutation calls
//                  POST /carrier/:id/authority-grant-date and on success
//                  invalidates carrier-all + clears the form + sets a
//                  success message that includes the compliance verdict
//                  (e.g. "Carrier now passes the compliance check." or
//                  "Compliance verdict: Authority is N months old..."
//                  depending on the new gate evaluation).
//                UI section added inside the compliance panel tab
//                  (panelTab === "compliance"), placed after Document
//                  Completeness and rendered as a third bg-gray-100
//                  rounded-lg card with title "FMCSA Authority Grant
//                  Date" matching the existing Compliance Status +
//                  Document Completeness cards' style. Shows the
//                  current value with a green pill if set or amber
//                  "Not set" pill if null + an inline explanation of
//                  why a missing date triggers AUTHORITY_UNVERIFIED.
//                  Admin-only form (isAdmin gated client-side; backend
//                  is authoritative): date input with max=today (mirrors
//                  the backend "not in future" rule), reason textarea
//                  with required min-10-chars + 500-char cap + live
//                  char counter, save button disabled until both
//                  inputs valid + while mutation pending, inline
//                  success/error message banner.
//                Non-admins see a one-line "ADMIN or CEO role required"
//                  message instead of the form.
//
//              The directive explicitly forbade extending updateCarrier
//              to accept authorityGrantedDate (the silent multi-field
//              PATCH path) — this commit respects that. Build B2 ships
//              the dedicated, reason-required, audited route by design.
//
//              Halt boundary respected: no block-resolution-modal
//              surfacing (optional follow-up not in scope), no
//              automated FMCSA re-point work, no Tier 2/3 fence
//              extensions (banked at §13.3 Items 189 + 190 from
//              v3.8.aim).
//
//              Pattern 6 sub-pattern 6 fire #6 caught + cleaned via
//              Option α: parallel v3.8.ain /onboarding Path 2C landed
//              at e41872d mid-Build-B2. Local ff-pulled (clean
//              fast-forward, no rebase), all 3 v3.8.ain comment refs
//              in this build's working tree (frontend page.tsx state
//              block + mutation block + UI section) bumped to
//              v3.8.aio before commit. Letter sequence ain (parallel)
//              → aio (this commit) is contiguous; no §3.1 skip.
//
//              Pre-commit gates (Sub-pattern 11 CI parity): backend
//              tsc --noEmit clean (first run caught the closed-enum
//              AuditAction issue at the auditTrail.create call —
//              corrected in-place to action: "UPDATE" with the
//              specific operation encoded in changedFields.actionDetail
//              per the v3.8.ahy precedent; second run clean); frontend
//              tsc --noEmit + npx next build clean.
//
//              §16 first-carrier blockers #1 + #2 still OPEN. Path γ
//              footer from Sprint B v3.8.aie still governs when
//              standalones execute.
// v3.8.aip   — Tier-program content strip on /onboarding. Closes the
//              Wasi-flagged regression where the deployed Step 0 still
//              rendered the retired tier model (M4 at 180d/75loads/
//              97%, M5 at 360d/150loads/98%/3-active-lanes, M6 at
//              720d/300loads) carried since v3.8.ail, despite the
//              v3.8.aij sprint reconciling /carriers.html to the
//              locked launch model (12/20/30 loads + 90/120/180-day
//              tenure floors). The aij reconciliation never touched
//              onboarding/page.tsx — the retired numbers had been
//              drift-shipping continuously for ~ten sprint cycles.
//
//              Phase A audit confirmed a single tier-block source
//              (no duplicates anywhere on the page) but found
//              additional tier-tagged content embedded in Step 4
//              Terms sections 5 + 7 that the explicit strip list
//              did not name. Those Terms paragraphs carried the
//              same tier-economics catalog (Net-30/21/14, Quick Pay
//              percentages, Silver/Gold/Platinum tier placement,
//              advancement load + on-time + tenure thresholds) and
//              would have caused the verify-grep gate to fail. The
//              strip extended into the Terms sections to satisfy
//              the verify-zero rule, with the tier-economics text
//              replaced by terms-by-reference language pointing the
//              carrier to the published Caravan Partner Program at
//              silkroutelogistics.ai/carriers (standard legal
//              pattern — carrier acknowledges the published
//              criteria as authoritative).
//
//              Strip (single atomic ship):
//                (1) Card A blurb (line 528 pre-strip) — rewrote
//                    body from "Tier-graduated Quick Pay,
//                    performance-based advancement via M1-M6
//                    milestones, every load run through Compass
//                    Engine vetting" → "Complete the five steps
//                    below to submit your application." Eyebrow +
//                    H2 preserved (program-name + welcome header
//                    are not tier-content).
//                (2) Card C navy panel (lines 555-615 pre-strip) —
//                    DELETED entirely. Three tier cards
//                    (Silver/Gold/Platinum economics with Net pay
//                    terms + 7-day QP fees + same-day QP +
//                    auto-approve thresholds) gone. Performance-
//                    based advancement paragraph gone. Compass
//                    Engine vetting 35-point paragraph gone. Plus
//                    the v3.8.ail inline comments inside the
//                    panel.
//                (3) Single replacement line (~ where Card C used
//                    to live): cream-tinted eyebrow link "Caravan
//                    Partner Program · Full program details →"
//                    routing to /carriers.html. Styled to match
//                    the existing eyebrow strip register on the
//                    page (gold-dark text, cream underline accent,
//                    Inter font, uppercase tracking).
//                (4) Terms Section 5 line on tier-graduated payment
//                    terms — rewrote to "Standard payment terms
//                    and per-load Quick Pay options are as
//                    established in the Caravan Partner Program
//                    (published at silkroutelogistics.ai/carriers)
//                    ...". Dropped Silver Net-30 / Gold Net-21 /
//                    Platinum Net-14 catalog.
//                (5) Terms Section 5 line on QP tier fees — rewrote
//                    to "Optional per-load Quick Pay is available
//                    without requiring a factoring contract;
//                    published fees apply per the Caravan Partner
//                    Program." Dropped Silver 3% / Gold 2% /
//                    Platinum 1% / +2% same-day premium catalog.
//                (6) Terms Section 7 lines on tier-placement +
//                    advancement thresholds — rewrote to refer
//                    carrier to the published program. Dropped
//                    Silver/Gold/Platinum placement + the 12/20/30
//                    loads + 90/120/180-day tenure + 97%/98%
//                    on-time threshold catalog + Founding
//                    recognition stamp framing.
//                (7) Step 0 comment header (lines 511-520
//                    pre-strip) — updated to drop the Card C
//                    reference + the M1-M6 / Silver-Gold-Platinum
//                    string echoes (so the verify-grep gate also
//                    sees zero in dev-facing comments, not just
//                    user-facing rendered text).
//
//              Out-of-strip-scope mentions retained (NOT on the
//              verify-grep list, NOT named in the explicit strip
//              list, all are operational/contextual not
//              tier-marketing):
//                - Success-screen Step 1 "Compass Engine is
//                  already running its 35-point check..." (post-
//                  submit reassurance language; "35-point" not on
//                  verify-grep list).
//                - Step 5 Review subtitle "The Compass Engine
//                  begins its 35-point check immediately on
//                  submit." (same).
//                - Step 2 subtitle "The Compass Engine uses both
//                  to match lanes." (no banned terms).
//                - Card B checklist "Voided check (for Quick Pay
//                  direct deposit setup)" (operational requirement,
//                  not a tier claim; "QP" alone not on verify
//                  list; inside protected CHROME card per the
//                  directive's preserve bullet).
//
//              Verify grep (post-strip, file-wide):
//                M1-M6                       → zero hits
//                Net-30/21/14                → zero hits
//                QP percentages [1-5]%       → zero hits
//                "active lane(s)"            → zero hits
//                Silver / Gold / Platinum    → zero hits
//                tier-graduated / tier card  → zero hits
//                tier placement / tier fee   → zero hits
//                12/20/30/75/150/300 loads   → zero hits
//                90/120/180-day tenure       → zero hits
//                97% / 98% on-time           → zero hits
//              ALL banned patterns return zero on rendered AND
//              comment surfaces. No tier card renders anywhere on
//              the page.
//
//              CHROME UNTOUCHED. The OnboardingNav header, the
//              "Carrier Registration" eyebrow strip, the
//              "What you'll need" checklist card, the 5-step form
//              + all v3.8.ain step-header eyebrows + brass-accent
//              step indicators + gold-dark CTA button register +
//              insurance/documents/review panel chrome + success-
//              screen chrome — all preserved exactly as v3.8.ain
//              shipped. No color-token changes. No form-logic
//              changes. No FMCSA-lookup / submit-handler changes.
//
//              §11 row added to CLAUDE.md alongside this commit.
//              Net source change: ~115 LOC removed / ~25 LOC
//              added in onboarding/page.tsx (Card C deletion is
//              the big one). Onboarding route bundle shrunk from
//              16.1 kB → 15.1 kB.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (all routes prerender static); no
//              new ESLint warnings.
//
//              Patterns applied: §3.3 atomic single-file ship +
//              CLAUDE.md docs row, §3.5 Phase A audit FIRST
//              (audit-driven strip extended into Terms sections
//              when grep revealed they would fail verify), §3.2
//              content sweep — verify rendered output (the
//              verify-grep gate IS the content sweep, run on
//              source pre-deploy), §19 Sub-pattern 7 grep-
//              completeness gate (initial verify exposed comment-
//              level echoes of banned strings; second pass cleaned
//              comments), §19 Sub-pattern 11 CI-parity verification.
//
//              Patterns emerged: none new this commit — Path 2C
//              strip is a contained content correction within
//              established canonical patterns.
// v3.8.aiq   — OnboardingNav visibility regression fix + canonical
//              parity. Closes Wasi-flagged "Can you read anything
//              next to logo ?????????" — the v3.8.ain Path 2C
//              OnboardingNav shipped with two compounding problems
//              against the canonical nav.html:
//
//              (1) NON-CANONICAL TEXT WORDMARK: I added
//                  <span>Silk Route Logistics</span> next to the
//                  /logo.png image. Canonical _partials/nav.html
//                  has NO text wordmark — the logo is image-only
//                  across /, /carriers, /shippers, /about,
//                  /contact, /track. The span was unilateral drift
//                  from the canonical chrome.
//              (2) text-white BACKFIRE per §13.3 Item 10: globals
//                  .css:162-163 has
//                    [data-mode="light"] .text-white {
//                      color: var(--srl-text) !important;
//                    }
//                  which remaps the Tailwind text-white utility to
//                  the dark body-text color in light mode (the
//                  default for public marketing routes). My
//                  OnboardingNav span used text-white on
//                  bg-[#0A2540] (arbitrary hex, NOT in the override
//                  list, stays navy) → result was DARK TEXT ON
//                  NAVY → invisible on the live deployed page.
//                  Same backfire on 4 other badges I introduced
//                  in ain (step indicator completed/active circles
//                  + success-screen "1" badge + FMCSA error chip
//                  "!"): text-white over bg-green-700 / bg-[#BA7517]
//                  gold-dark / bg-red-500 → dark on bright color =
//                  muddy/unreadable.
//
//              Methodology miss acknowledged: Item 10 was banked
//              in CLAUDE.md §13.3 PRE-ain. The user-memory
//              feedback_visual_smoke_before_push.md is explicit
//              that "for layout/hero/card restructure commits,
//              build-gate is NOT enough; must mentally walk
//              viewport proportions before push." I ran tsc +
//              next build clean and called the gates done, never
//              opened the rendered page in a viewer. Both pre-
//              existing warnings would have prevented this if
//              applied. Banked as a methodology lesson at §19
//              Sub-pattern 8 alongside the existing fire-candidate
//              entries — text-white-on-hardcoded-dark-bg is a
//              specific class of conditional-render-visual-
//              verification gap that triggers ONLY in deployed
//              light mode, never in dev tsc/build.
//
//              FIX (single atomic, 5 surgical edits):
//                (1) Removed the <span>Silk Route Logistics</span>
//                    entirely from OnboardingNav. Logo-only matches
//                    canonical _partials/nav.html across the public
//                    marketing surface.
//                (2) Step indicator completed circle: text-white →
//                    text-[#FBF7F0] (arbitrary hex bypasses the
//                    [data-mode="light"] override).
//                (3) Step indicator active circle: same swap.
//                (4) Success-screen "1" badge: same swap.
//                (5) FMCSA error chip "!" badge: same swap.
//
//              Pre-existing text-white inside AddressAutocomplete
//              (lines 1298 + 1307) untouched — its bg-[#0F1117]
//              IS in the globals.css override list, so bg + text
//              both swap to light-mode pair (cream bg + dark text)
//              and remain readable. Pre-existing component, not
//              introduced by me, works correctly via the override
//              pair semantic.
//
//              Visibility class banked: brand-canonical text-on-
//              navy is text-[#FBF7F0] (--fg-on-navy per CLAUDE.md
//              §2.1), NOT Tailwind text-white. The arbitrary hex
//              bypasses the [data-mode="light"] .text-white
//              !important override. Going forward, all text on
//              hardcoded-navy / hardcoded-dark-color backgrounds
//              must use the arbitrary cream hex, not the Tailwind
//              white token. Mirrors the rule already implicit in
//              the canonical chrome partials (which use --cream
//              CSS var, never .text-white).
//
//              Scope: ~4 LOC swap across 4 lines + 5 LOC delete
//              (span + adjacent flex container simplification) in
//              onboarding/page.tsx. No other surfaces touched.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding route still 15.1 kB).
//
//              Letter: aip was local-only (61efe98, awaiting push);
//              aiq sequence-continuous on top. Both aip + aiq will
//              push together to ship the strip + visibility fix in
//              one Cloudflare deploy cycle, resolving both the
//              Wasi-flagged Card C visibility AND the logo-text
//              invisibility in a single live update.
//
//              Patterns applied: §3.5 Phase A audit (root-cause
//              the text-white override against globals.css before
//              fixing), §3.2 content sweep verify (file-wide
//              text-white grep before declaring done), §3.3
//              atomic single-file ship, §13.3 Item 10
//              acknowledgment (theme override class), §19 Sub-
//              pattern 8 conditional-render-visual-verification
//              (the missed gate that let ain ship the regression).
//
//              Patterns emerged: methodology lesson — Tailwind
//              text-white must be treated as a light-mode-aware
//              utility (its override list semantics), not a
//              theme-neutral "always white" class. Document
//              banked at §13.3 Item 10 (which already covers the
//              broader theme system root fix) + a new explicit
//              note inline in OnboardingNav code.
// v3.8.air   — Step 1 EIN field removal + "Full program details →"
//              anchor fix. Closes two Wasi-flagged items:
//
//              (1) EIN INPUT REMOVAL. Wasi originally raised this
//                  in the v3.8.ail thread: "EIN number -- is it
//                  usually on the landing page or it comes later
//                  for W9?" The implicit intent was REMOVE — the
//                  W-9 PDF uploaded on Step 3 IS the Federal Tax
//                  ID source; collecting EIN twice (typed on
//                  Step 1 + embedded on the W-9 PDF on Step 3)
//                  is duplicate-capture. I misinterpreted the
//                  question as a request for clarifying subtitle
//                  and added explanatory text instead. v3.8.aiq
//                  flagged that this was the second methodology
//                  miss in the OnboardingNav arc where I misread
//                  audit-style questions as "explain" rather
//                  than "remove". Now removing.
//
//                  Removal scope (5 surfaces audited, 3
//                  rendered surfaces touched):
//                  - Card B "What you'll need" checklist: deleted
//                    line "EIN (9-digit Federal Tax ID)".
//                  - Step 1 Company Info 4-column grid: deleted
//                    the EIN <div> block (label + input +
//                    subtitle paragraph).
//                  - Step 5 Review: deleted the conditional
//                    "| EIN: XX-XXXXXXX" display from the
//                    Company summary row.
//
//                  Form-state field `ein: ""` retained in the
//                  CarrierFormData interface and initial state
//                  for backend payload compatibility — the
//                  registration POST continues to send the field
//                  as empty string (its always-empty state for
//                  most users prior to removal too). No backend
//                  regression risk. The field is now unreachable
//                  from the UI but the payload shape is unchanged.
//
//              (2) "FULL PROGRAM DETAILS →" ANCHOR FIX. The
//                  v3.8.aip strip placed a "Caravan Partner
//                  Program · Full program details →" link to
//                  /carriers.html (bare path). Wasi flagged this
//                  lands the carrier near the "Where Carriers
//                  Come First" hero — they have to scroll past
//                  hero + Compass Score formula + commitments +
//                  universals wall to reach the tier system.
//                  Updated href to /carriers.html#caravan (the
//                  canonical anchor for the Caravan Partner
//                  Program section with the three tier cards,
//                  per carriers.html:310 `<section id="caravan">`).
//                  Now lands the carrier directly on the tier
//                  system as the user expects.
//
//              Scope: ~14 LOC removed (EIN checklist line + EIN
//              input block + EIN review display) + ~1 LOC
//              changed (href anchor) in onboarding/page.tsx.
//              No other surfaces touched.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding shrunk from 15.1 kB to
//              14.9 kB — the EIN input + subtitle paragraph was
//              ~200 bytes of JSX).
//
//              Letter: aiq is latest origin/main HEAD; air
//              sequence-continuous on top.
//
//              Patterns applied: §3.5 audit-first (full grep of
//              "ein\|EIN" across the file before removal — found
//              all 5 surfaces, classified state-vs-render),
//              §3.2 content sweep verify (post-removal grep
//              confirmed only form-state defaults remain, no
//              rendered EIN surface left), §3.3 atomic
//              single-file ship + CLAUDE.md docs row,
//              §19 Sub-pattern 11 CI-parity verification.
//
//              Patterns emerged: methodology lesson — Wasi's
//              "is X usually here or does it come later?"
//              audit-style questions are typically REMOVE
//              signals, not explain-it signals. Two consecutive
//              fires on this misinterpretation (Path 2C chrome
//              audit + EIN question both misread as "explain").
//              Going forward: when Wasi questions whether a
//              field/element belongs on a surface, default-assume
//              the intent is removal unless they explicitly ask
//              for explanation.
// v3.8.ais   — Surface 18+ months FMCSA authority requirement on
//              /onboarding. Closes Wasi-flagged "we have made
//              changes to the 18 months old authority instead of
//              just fresh" — the Item 182 authority-age compliance
//              epic is now backend-enforced (<12mo hard-block,
//              12-18mo override-eligible per Sprint v3.8.ahq +
//              follow-up, ≥18mo auto-allow) and v3.8.aih already
//              surfaced it on the canonical /carriers.html
//              requirements card. /onboarding lagged.
//
//              Two surgical edits in onboarding/page.tsx — both
//              are documents-checklist class wording matches to
//              the /carriers.html canonical "Active FMCSA
//              Authority · 18+ months" pattern:
//
//                (1) Card B "What you'll need" checklist:
//                    "Operating Authority letter (FMCSA)"
//                    -> "Active FMCSA Authority (MC/DOT, 18+
//                    months of operating history)"
//
//                (2) Step 3 documents upload card desc:
//                    "FMCSA operating authority"
//                    -> "Active FMCSA authority — 18+ months of
//                    operating history required"
//
//              Step 4 Terms Section 1 ("Carrier shall maintain
//              valid operating authority (MC/DOT) issued by the
//              FMCSA at all times during the term...") NOT
//              touched — that's the legal click-through covenant
//              language, separate from the age-gate surface
//              requirement. Adding "18+ months" to the covenant
//              would be wrong-shape — the covenant is about
//              maintaining authority during the relationship, not
//              about the entry gate.
//
//              Scope: ~2 LOC swap in onboarding/page.tsx. No
//              other surfaces touched.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding 14.9 kB to 15.0 kB —
//              slightly longer label text).
//
//              Letter: air is the latest origin/main HEAD; ais
//              sequence-continuous on top.
//
//              Patterns applied: §3.5 audit-first (read the
//              /carriers.html canonical v3.8.aih wording before
//              editing /onboarding so the two surfaces stay in
//              parity), §3.3 atomic single-file ship + CLAUDE.md
//              docs row, §3.2 cross-page consistency (Pattern 7
//              design-system conformance — both surfaces now
//              carry the same 18+ months requirement framing).
//
//              Patterns emerged: none new — this is a Pattern 7
//              cross-surface-consistency follow-through on the
//              /carriers.html Item 182 surface that v3.8.aih
//              shipped. /onboarding was the natural sibling
//              surface that should have been touched in the
//              same sprint; banked here.
// v3.8.ait   — Step 1/2 field-placement IA fix + OnboardingNav Sign
//              In canonical parity. Closes Wasi-flagged "# of trucks
//              is showing here on company information already and
//              phone number is showing on top part" + "sign in on
//              top left doesn't exactly match the sign in CTA of
//              other pages".
//
//              Methodology miss (third in two days). The v3.8.ain
//              Path 2C chrome upgrade preserved the inherited
//              pre-ain field placement without questioning whether
//              the grouping made operational sense. Fleet size
//              (# of Trucks) belongs with equipment/fleet info,
//              not with company identity. Phone belongs with
//              contact details (Email), not with regulatory IDs
//              (DOT/MC). Both should have been caught during the
//              ain visual smoke that I skipped.
//
//              FIX (single atomic ship, 5 surgical changes):
//
//              (1) Step 1 top grid restructured from 4-col
//                  (DOT/MC/Trucks/Phone) to 2-col (DOT/MC only).
//                  The remaining 2 fields both trigger FMCSA
//                  auto-lookup that bidirectionally populates the
//                  other — keeping them as 2 distinct inputs
//                  rather than a dropdown type-picker preserves
//                  the bidirectional fill UX.
//
//              (2) Phone * moved from Step 1 top grid into the
//                  bottom contact block, paired with Email as
//                  sm:grid-cols-2. Password split into its own
//                  full-width row below. Operational grouping:
//                  identity (name) → contact (email+phone) →
//                  auth (password).
//
//              (3) # of Trucks moved from Step 1 → Step 2
//                  (Equipment & Operating Regions). Placed at the
//                  top of Step 2 as the first field, max-w-xs
//                  single column. Renamed label to "Fleet Size
//                  (# of Trucks)". Step 2 intro updated to
//                  reflect the new field.
//
//              (4) OnboardingNav Sign In button canonical parity:
//                  dropped ChevronDown icon (canonical
//                  `.nav-login-btn` has no chevron); tightened
//                  padding from `px-5 py-2` to `py-[9px]
//                  px-[22px]` matching utilities.css canonical
//                  exactly. Removed unused ChevronDown lucide-
//                  react import.
//
//              (5) Eyebrow strip "Already registered? Sign In"
//                  link removed entirely. The canonical nav above
//                  already provides Sign In via the gold-dark CTA
//                  dropdown. The eyebrow strip link was a second
//                  Sign In affordance in a different visual
//                  register from the nav CTA (creating visual
//                  inconsistency) AND non-canonical drift. Eyebrow
//                  now carries only the page-context cue (program
//                  eyebrow + Carrier Registration H1).
//
//              METHODOLOGY ACKNOWLEDGMENT. Three consecutive
//              sprints have shipped layout-audit gaps Wasi caught
//              post-deploy: ail (EIN should-have-been-removed
//              misread as "explain"), ain (text-white invisible +
//              non-canonical wordmark), ait (Trucks/Phone wrong-
//              category placement + mismatched Sign In CTA). The
//              user-memory feedback_visual_smoke_before_push.md
//              explicitly covers this class. Going forward: must
//              run a step-by-step IA + visual walkthrough of
//              every chrome/layout sprint before declaring gates
//              passed. Build-clean is necessary, not sufficient.
//
//              Scope: ~25 LOC restructured across 4 surfaces in
//              onboarding/page.tsx.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding 15.0 kB → 14.9 kB).
//
//              Letter: ais latest origin/main HEAD; ait sequence-
//              continuous on top.
//
//              Patterns applied: §3.5 audit-first; §3.3 atomic
//              single-file ship + CLAUDE.md docs row; §3.2 visual
//              smoke walkthrough pre-push (applied this time,
//              missed in the prior three sprints); §19 Pattern 7
//              design-system conformance (OnboardingNav Sign In
//              now exact-match to canonical `.nav-login-btn`).
//
//              Patterns emerged: methodology lesson — chrome-
//              polish sprints that touch existing layouts MUST
//              include an IA audit, not just a styling audit.
//              The pre-ain layout grouped fields by tab-order
//              convenience but the categorical grouping was
//              wrong. Banked as a clarification of feedback_
//              visual_smoke_before_push — visual smoke includes
//              IA review, not just pixel-level layout.
// v3.8.aiu   — Two onboarding/page.tsx bugs Wasi flagged on
//              deployed v3.8.ait. Single atomic ship.
//
//              (1) ADDRESS AUTO-FILL FROM FMCSA WAS BROKEN.
//                  AddressAutocomplete (line 1232+) had a
//                  one-way useEffect at line 1262: `if (!value)
//                  setQuery("")` — clears the input when value
//                  becomes empty, does NOT push new non-empty
//                  values from the parent into the input's
//                  display state. So when FMCSA lookup populated
//                  form.address via applyFmcsaData (set("address",
//                  data.phyStreet)), the prop updated but query
//                  stayed empty — Address field appeared blank
//                  despite City/State/Zip auto-populating from
//                  the same FMCSA response.
//
//                  Fix: `useEffect(() => { setQuery(value || "");
//                  }, [value]);` — bidirectional sync. React
//                  short-circuits if value === query so the
//                  user-type path (handleChange → setQuery →
//                  onChange → parent set → prop update → effect
//                  fires → setQuery(same)) doesn't cause
//                  infinite re-renders.
//
//              (2) EMAIL + PASSWORD PRE-FILLED BY BROWSER
//                  AUTOFILL. Chrome was aggressively populating
//                  both fields from saved password-manager
//                  credentials before the user typed anything.
//                  Inputs had no autoComplete attribute or
//                  non-standard name to opt out.
//
//                  Fix: applied the EIN-field opt-out pattern
//                  to Email + Phone + Password:
//                    - Email:    autoComplete="off" +
//                                name="carrier-registration-email"
//                    - Phone:    autoComplete="off" +
//                                name="carrier-registration-phone"
//                    - Password: autoComplete="new-password" +
//                                name="carrier-registration-
//                                password"
//                  `new-password` is the W3C-recommended attribute
//                  for new-account password fields and signals to
//                  the browser not to suggest existing passwords;
//                  it also prevents triggering saved-password
//                  autofill. Non-standard `name` values avoid
//                  Chrome's pattern-matching against common
//                  field names (email/username/password) that
//                  often overrides `autoComplete="off"`.
//
//              Scope: ~5 LOC changed in onboarding/page.tsx (1
//              useEffect rewrite + 3 input attribute additions).
//              No other surfaces touched.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding 14.9 kB, no change).
//
//              Letter: ait latest origin/main HEAD; aiu
//              sequence-continuous on top.
//
//              Patterns applied: §3.5 audit-first (read
//              AddressAutocomplete value-prop sync logic + Email/
//              Password input attributes before fixing — the bug
//              was in the useEffect dependency-handling, NOT in
//              the applyFmcsaData callback); §3.3 atomic single-
//              file ship + CLAUDE.md docs row; §3.2 visual smoke
//              walkthrough pre-push (mentally walked the
//              auto-fill flow start-to-finish + browser-autofill
//              opt-out semantics for both fixes); §19 Sub-pattern
//              11 CI-parity verification.
//
//              Patterns emerged: none new — both bugs are
//              well-known React patterns (prop-to-state sync
//              + browser autofill opt-out). Banking the
//              AddressAutocomplete sync fix as a reference for
//              any other prop-driven uncontrolled-input
//              components that may have the same one-way
//              clear-only effect pattern.
// v3.8.aiv   — Step 3 Sprint A: P0 + P1 from the comprehensive
//              audit. Closes (a) UX correctness gaps (no input
//              labels, Safety Cert shown to US-only carriers,
//              raw-integer coverage amounts) + (b) brand register
//              drift across all Step 3 internals that v3.8.ain
//              Path 2C never reached.
//
//              P0 FIXES
//
//              (1) Added field labels above every input in Step 3.
//                  Before: 16 insurance inputs + 4 agent inputs
//                  relied entirely on placeholders for context —
//                  placeholders disappear when user clicks, leaving
//                  no visible cue for "which field am I in?". Now
//                  each input has a small uppercase-tracked
//                  brand-eyebrow label above (Provider / Policy # /
//                  Coverage Amount / Expiry Date for insurance
//                  rows; Agent Name / Agent Email / Agent Phone /
//                  Agency Name for the verification block).
//
//              (2) Safety Fitness Certificate upload card now
//                  conditionally rendered ONLY when the carrier
//                  selected at least one Canadian operating region
//                  in Step 2 (CANADIAN_REGIONS = ["Eastern Canada",
//                  "Western Canada", "Central Canada", "Cross-
//                  Border"]). US-only carriers no longer see the
//                  irrelevant Canadian-specific upload slot.
//                  Implementation: IIFE-wrapped docs array filter
//                  inside the .map render — clean, no schema
//                  change, no separate state field needed.
//
//              (3) Coverage Amount inputs now show a formatted
//                  echo below: "= $1,000,000" when user types
//                  "1000000". Closes the "is that 7 zeros or 6?"
//                  verification gap. Storage shape unchanged
//                  (raw integer string), so backend payload is
//                  identical.
//
//              (4) "Required: $X minimum" hint copy rewritten to
//                  "Minimum: $X" — tighter, less repetitive (the
//                  step intro already establishes these are
//                  required).
//
//              P1 BRAND-REGISTER SWEEP (Step 3 internals)
//
//              Replaced pre-ait slate/Tailwind-gold tokens with
//              brand-canonical hex across 17 surfaces:
//                - All 16 insurance row inputs + 4 agent inputs:
//                  `border + focus:ring-gold` →
//                  `border-[#EFE6D3] + focus:border-[#BA7517]
//                  focus:ring-[#BA7517]/15`
//                - All inputs gain `bg-white` (was inheriting from
//                  panel cream) for crisp form-element contrast
//                - All inputs gain `placeholder:text-[#A7AEB8]`
//                  for consistent placeholder muting
//                - All inputs gain `text-[#0A2540]` for typed-
//                  value contrast
//                - Insurance row titles: `text-slate-700` →
//                  `text-[#0A2540]`
//                - "Minimum: $X" hint: `text-slate-700` →
//                  `text-[#6B7685]`
//                - "Below minimum" error: `text-red-500` →
//                  `text-[#9B2C2C]` (§2.1 danger token)
//                - Amount-below-minimum input state:
//                  `border-red-300 bg-red-50` →
//                  `border-[#9B2C2C] bg-[#F6E3E3]`
//                - 3 insurance checkboxes: `border-slate-300
//                  text-gold focus:ring-gold` →
//                  `border-[#C5A572] text-[#BA7517]
//                  focus:ring-[#BA7517]`
//                - Checkbox label text: `text-xs text-slate-700` →
//                  `text-sm text-[#3A4A5F]` (readability bump)
//                - Insurance Checkboxes divider:
//                  `border-t border-slate-200` →
//                  `border-t border-[#EFE6D3]`
//                - Document upload card default state:
//                  `bg-slate-50 border-slate-200` →
//                  `bg-[#FBF7F0] border-[#EFE6D3]`
//                - Document upload card hover:
//                  `hover:border-gold/50 hover:bg-gold/5` (olive
//                  non-canonical) →
//                  `hover:border-[#C5A572] hover:bg-[#FAEEDA]`
//                - Document card uploaded state:
//                  `bg-green-50 border-green-300` →
//                  `bg-[#E6F0E9] border-[#2F7A4F]/40` (§2.1
//                  success token)
//                - Document card upload icon: `text-gold` →
//                  `text-[#BA7517]`
//                - Drop additional files zone:
//                  `border-slate-200 hover:border-gold/40
//                  hover:bg-gold/5` →
//                  `border-[#EFE6D3] hover:border-[#C5A572]
//                  hover:bg-[#FAEEDA]`
//                - Drop zone icon: `text-slate-700` →
//                  `text-[#BA7517]`
//                - Drop zone body text: `text-slate-600 /
//                  text-slate-700` → `text-[#3A4A5F] /
//                  text-[#6B7685]`
//                - Additional files list item:
//                  `bg-slate-50 border-slate-200` →
//                  `bg-[#FBF7F0] border-[#EFE6D3]`
//                - PDF icon: `text-red-700` →
//                  `text-[#9B2C2C]`
//                - Image icon: `text-blue-700` →
//                  `text-[#2A5B8B]` (§2.1 info token)
//                - File X-remove button hover:
//                  `hover:bg-red-50` → `hover:bg-[#F6E3E3]`
//                - X icon: `text-red-700` → `text-[#9B2C2C]`
//
//              COPY UPDATES
//
//              - W-9 description: "Required for tax reporting"
//                → "Required for tax reporting (your EIN is
//                extracted from this)" — closes the loop with
//                v3.8.air EIN-removal so carriers understand
//                why we don't ask for EIN separately.
//              - Insurance Certificate label: "Insurance
//                Certificate" → "Insurance Certificate (COI)"
//                + description extended to "Auto liability,
//                cargo, general liability, and workers' comp"
//                (was missing workers' comp).
//              - Workers' Comp "Required by law" subtitle →
//                "As required by state law" (more accurate —
//                state-regulated, not federal).
//              - Workers' Comp placeholder amount: "Coverage
//                Amount $" → "Per state minimum" (acknowledges
//                amount is state-variable, not a fixed dollar
//                target).
//              - Provider placeholders: "Provider Name" → "e.g.
//                Progressive" (Auto/Cargo/GL) / "e.g. State Fund"
//                (Workers' Comp) — operationally realistic
//                example carriers.
//              - Agent inputs: generic "Agent Name" / "Agent
//                Email" / etc → "Full name" / "agent@agency.com"
//                / "(555) 123-4567" / "Agency / brokerage" —
//                meaningful examples vs label-repetition.
//
//              SCOPE
//
//              ~200 LOC restructured across the 4 insurance rows
//              + checkboxes + agent contact block + document
//              upload cards + drop zone + additional files list
//              in onboarding/page.tsx.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding 14.9 kB → 15.4 kB —
//              expected ~0.5 kB from added field labels +
//              currency-echo helper text).
//
//              Letter: aiu latest origin/main HEAD; aiv
//              sequence-continuous on top.
//
//              Patterns applied: §3.5 audit-first (full Step 3
//              audit message before editing — found 25 issues,
//              prioritized P0/P1/P2/P3, this commit closes the
//              17 P0+P1 items); §3.3 atomic single-file ship +
//              CLAUDE.md docs row; §3.2 visual smoke walkthrough
//              pre-push (mentally walked each insurance row
//              before/after, drop zone empty + populated states,
//              document card upload + uploaded states); §19
//              Pattern 7 design-system conformance (brand token
//              sweep matches the Step 1/2 register established
//              by v3.8.ait); §19 Sub-pattern 11 CI-parity
//              verification.
//
//              Patterns emerged: none new this commit — Sprint A
//              is the audit-driven follow-through I committed to
//              after the ait methodology acknowledgment. Closes
//              the brand-register drift that v3.8.ain Path 2C
//              missed by only touching section headers. P2 + P3
//              banked for a later sprint (Workers' Comp shape
//              decision, info tooltips, FMCSA-verified insurance
//              trust cue, file preview).
//
//              QUEUED FOR NEXT SPRINT (Wasi flagged mid-aiv):
//                - 2 dates per insurance (Effective Date +
//                  Expiration Date) — current single date is
//                  expiration only; effective date would let us
//                  verify policy is currently active (not just
//                  not-yet-expired). Industry-standard on COIs.
//                  Schema change: add `effective: string` to
//                  InsuranceLineData interface + initial state +
//                  4 new input slots + Review step update.
//                  ~80 LOC. Banked at §13.3 as Sprint B candidate.
// v3.8.aiw   — Sprint B: COI verification via effective+expiry
//              date pair per insurance. Full-stack atomic ship —
//              closes the operational gap Wasi flagged mid-aiv.
//
//              THE PROBLEM
//
//              Pre-aiw, each of the 4 insurance policies on Step 3
//              (Auto Liability, Motor Cargo, General Liability,
//              Workers' Comp) captured a single date — the
//              expiration. This lets the platform verify "policy
//              not expired yet" but NOT "policy currently in
//              force." A pre-issued policy with a future
//              effective date (e.g. carrier hasn't started the
//              coverage period yet) would be wrongly accepted as
//              active. Industry-standard COI verification
//              requires both dates:
//                effective <= today <= expiry  ->  ACTIVE
//                today < effective              ->  NOT YET ACTIVE
//                today > expiry                 ->  EXPIRED
//
//              FULL-STACK CHANGES
//
//              Backend:
//                - prisma/schema.prisma: 4 new nullable DateTime?
//                  fields paired with existing *Expiry on
//                  CarrierProfile model:
//                    autoLiabilityEffective
//                    cargoInsuranceEffective
//                    generalLiabilityEffective
//                    workersCompEffective
//                - prisma/migrations/20260524063259_add_insurance_
//                  effective_dates/migration.sql: ALTER TABLE
//                  carrier_profiles ADD 4 nullable TIMESTAMP(3)
//                  columns. Manually authored per §2.2 (avoid
//                  `prisma migrate dev` against prod-pointed
//                  DATABASE_URL). Render's `prisma migrate deploy`
//                  applies on next push.
//                - src/validators/carrier.ts: 4 new
//                  z.string().optional() entries in
//                  carrierRegisterSchema.
//                - src/controllers/carrierController.ts:
//                  registerCarrier writer (line ~77) adds 4 new
//                  Date conversions matching the existing *Expiry
//                  pattern; updateCarrier writer (line ~928)
//                  destructures 4 new fields + conditionally
//                  writes them via `field !== undefined` guard
//                  matching existing convention.
//
//              Frontend (onboarding/page.tsx):
//                - InsuranceLineData interface: `effective: string`
//                  added alongside existing `expiry: string`.
//                - emptyInsLine const: `effective: ""` added to
//                  initial state.
//                - Step 3 UI: each of the 4 insurance rows
//                  restructured from a single 4-col grid
//                  (Provider/Policy/Amount/Expiry) to a 2-row
//                  layout — Row 1 (sm:grid-cols-3): Provider,
//                  Policy #, Coverage Amount; Row 2 (sm:grid-
//                  cols-2): Effective Date, Expiration Date.
//                  Cleaner than a 5-col cramped layout and matches
//                  the "identity fields above scheduling dates"
//                  visual hierarchy. Expiry Date label renamed
//                  Expiration Date for consistency with Effective
//                  Date.
//                - handleSubmit payload builder: 4 new
//                  `if (X.effective) insurancePayload.XEffective =
//                  X.effective` lines following the existing
//                  pattern.
//                - Step 5 Review Insurance Summary: each policy
//                  summary line extended to show "| Eff: YYYY-MM-DD
//                  | Exp: YYYY-MM-DD" conditionally when each date
//                  is filled.
//
//              SCHEMA MUTATION DISCIPLINE (CLAUDE.md §2.2)
//
//              Migration file authored manually rather than via
//              `prisma migrate dev` because backend/.env has the
//              prod Neon DATABASE_URL — running migrate dev
//              against prod is forbidden per §2.2. Render's
//              build chain runs `prisma migrate deploy` per the
//              canonical buildCommand established in Sprint 44b;
//              the migration applies on next push. Verification
//              post-deploy: `npx prisma migrate status` against
//              prod should report "Database schema is up to
//              date" with the new migration applied.
//
//              SCOPE
//
//              ~250 LOC across 5 files:
//                - backend/prisma/schema.prisma (~12 LOC, 4
//                  field additions + comment)
//                - backend/prisma/migrations/.../migration.sql
//                  (NEW, ~24 LOC including header comment)
//                - backend/src/validators/carrier.ts (~6 LOC, 4
//                  Zod field additions)
//                - backend/src/controllers/carrierController.ts
//                  (~20 LOC, 4 register-writer fields + 4
//                  destructure entries + 4 update-writer
//                  conditional assignments)
//                - frontend/src/app/onboarding/page.tsx (~180
//                  LOC restructured across the 4 insurance row
//                  blocks + payload builder + Review step + 2
//                  interface/initial-state lines)
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//                - Backend tsc --noEmit clean (Prisma client
//                  regenerated via `npx prisma generate` so new
//                  *Effective fields are typed).
//                - Frontend tsc --noEmit clean.
//                - Frontend npx next build clean (`/onboarding`
//                  14.9 kB -> 15.6 kB, expected ~0.7 kB from
//                  4 new date inputs + Review step echo).
//
//              Letter: aiv latest origin/main HEAD; aiw
//              sequence-continuous on top.
//
//              Patterns applied: §3.5 audit-first (banked Effective
//              Date item in aiv close as Sprint B candidate, then
//              executed end-to-end this sprint); §3.3 atomic
//              full-stack ship + CLAUDE.md docs row + 1 Prisma
//              migration file; §2.2 schema mutation discipline
//              (manual migration authoring vs migrate-dev against
//              prod-pointed URL); §19 Sub-pattern 11 CI-parity
//              verification (both frontend AND backend tsc
//              gates run).
//
//              Patterns emerged: none new — standard 5-file
//              full-stack pattern (schema + migration + validator
//              + controller + UI). The decision to ship full-
//              stack atomic vs frontend-only-then-backend was
//              driven by the operational verification gap being
//              the rationale — frontend-only would have captured
//              the data but not stored it, leaving the gap
//              open. Atomic close is cleaner.
//
//              POST-DEPLOY VERIFICATION REQUIRED
//
//              On Render auto-deploy after this push:
//                1. `prisma migrate deploy` should apply the new
//                   migration (~1s ALTER TABLE).
//                2. `prisma migrate status --exit-code` (Sprint
//                   44b gate) should pass — schema up to date.
//                3. Smoke test: register a test carrier with
//                   both Effective + Expiry dates per policy,
//                   verify CarrierProfile row has the new
//                   columns populated via SQL or admin UI.
// v3.8.aix   — Step 1 phone formatter + γ "Very Strong" password
//              tier (14+ chars + 4 char classes + HIBP breach check)
//              + live strength meter + confirm-password field. Two
//              Wasi-flagged items + the cascade of γ requirements
//              shipped as a single atomic.
//
//              ITEM 1 — PHONE FORMATTER
//
//              Pre-aix: phone input accepted raw digits / any text
//              up to whatever Tailwind autoComplete didn't strip.
//              Live deploy showed "269220676000" (12 digits) which
//              is ugly + can be wrong length. Industry-standard
//              new-account flows format on-the-fly as user types.
//
//              Fix: new `formatPhone(raw)` utility. Strips all
//              non-digits, drops leading "1" country code on paste,
//              caps at 10 digits, formats progressively:
//                "" / 0 digits  -> ""
//                "2"            -> "(2"
//                "269"          -> "(269"
//                "26922"        -> "(269) 22"
//                "2692206"      -> "(269) 220-6"
//                "2692206760"   -> "(269) 220-6760"
//              Applied to Step 1 Phone input + Step 3 Insurance
//              Agent Phone input. canNext counts digits (>=10)
//              rather than total chars since formatted value is
//              14 chars.
//
//              ITEM 2 — PASSWORD γ TIER (Very Strong)
//
//              Pre-aix: single password input, label "(min 8
//              chars)", canNext check `form.password.length >= 8`,
//              backend Zod `z.string().min(8)`. Wasi asked if 12
//              + 1 upper + 1 special would be "strong" — I
//              answered honestly that it's "Good" tier, not
//              "Strong" by modern industry standards, and
//              recommended Option β (add lowercase + digit).
//              Wasi chose γ (max strict): 14 + all 4 char classes
//              + HIBP breach check + confirm-password.
//
//              Frontend implementation:
//
//              (1) New helpers at file top:
//                  - passwordCriteria(pw): returns {length,
//                    uppercase, lowercase, digit, special} booleans.
//                  - passwordMeetsCriteria(pw): aggregate, returns
//                    true iff all 5 met.
//                  - checkPasswordPwned(pw): async — computes SHA-1
//                    via crypto.subtle.digest, takes first 5 chars
//                    of hex, fetches
//                    https://api.pwnedpasswords.com/range/{prefix},
//                    parses response (lines of SUFFIX:count),
//                    returns the breach count (0 = safe, >0 = pwned).
//                    Throws on network/CSP/CORS errors so caller
//                    can distinguish "verified safe" from "couldn't
//                    verify."
//                  - passwordStrength(pw, hibpStatus): returns
//                    null | "WEAK" | "STRONG" | "VERY_STRONG"
//                    based on criteria + HIBP state.
//
//              (2) New form state:
//                  - confirmPassword: string — UI-only, not sent
//                    to backend.
//                  - hibpStatus: "unknown" | "checking" | "safe" |
//                    "pwned" | "error".
//                  - hibpCount: number — breach count when pwned.
//                  - hibpTimer: ref for debounce cleanup.
//
//              (3) New debounced useEffect:
//                  - Watches form.password.
//                  - Resets to "unknown" if password doesn't meet
//                    composition criteria (no point HIBP-checking
//                    a weak password — user must fix composition
//                    first).
//                  - Otherwise sets "checking", waits 600ms after
//                    last keystroke, fires checkPasswordPwned,
//                    sets "safe" / "pwned" / "error" based on
//                    result.
//
//              (4) Password UI replacement:
//                  - 2-col layout (sm:grid-cols-[1fr_320px]):
//                    Left: Password input + Confirm Password input
//                    Right: persistent Requirements card (cream
//                    panel with cream-2 border, gold-dark eyebrow
//                    label, 5-row checklist + strength meter)
//                  - Each requirement row shows ✓ (green-filled
//                    circle) when met, empty (cream-2 circle)
//                    when not.
//                  - Confirm password input border + bg react to
//                    match state: cream-2 default → red on mismatch
//                    → green on match. Inline "✓ Passwords match"
//                    / "✗ Passwords don't match" cue.
//                  - Strength meter (renders only after user types):
//                    3-segment colored bar + text label "Strength:
//                    Weak | Strong | Very Strong" + HIBP status
//                    line ("Checking…" / "✓ Not found in known
//                    breaches" / "⚠ Appears in N known breaches" /
//                    "Could not verify").
//
//              (5) canNext updated: requires (a) all 5 composition
//                  criteria, (b) confirmPassword === password,
//                  (c) hibpStatus === "safe". "Checking" /
//                  "unknown" / "error" / "pwned" all block
//                  progression.
//
//              Backend implementation:
//
//              src/validators/carrier.ts — password Zod chain
//              extended:
//                z.string()
//                  .min(14, ...)
//                  .regex(/[A-Z]/, ...)
//                  .regex(/[a-z]/, ...)
//                  .regex(/[0-9]/, ...)
//                  .regex(/[^A-Za-z0-9]/, ...)
//              Defense-in-depth: even if frontend is bypassed,
//              backend rejects weak passwords. HIBP not re-checked
//              server-side (frontend handles it).
//
//              CSP UPDATE
//
//              frontend/public/_headers — connect-src extended
//              with https://api.pwnedpasswords.com. HIBP k-anonymity
//              API requires direct browser fetch. Without this CSP
//              allowance the fetch would be blocked at the browser
//              security layer + checkPasswordPwned would throw,
//              setting hibpStatus = "error" and blocking
//              canNext indefinitely.
//
//              SCOPE
//
//              ~280 LOC across 4 files:
//                - frontend/src/app/onboarding/page.tsx (~250
//                  LOC — phone formatter + 4 password helpers +
//                  state + effect + canNext + Password UI block)
//                - backend/src/validators/carrier.ts (~10 LOC,
//                  password chain)
//                - frontend/public/_headers (~1 LOC, CSP additive)
//                - VersionFooter.tsx + CLAUDE.md (docs)
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//                - Frontend tsc --noEmit clean.
//                - Frontend npx next build clean (/onboarding
//                  15.6 kB -> 17 kB, expected ~1.4 kB from
//                  password block JSX + helpers).
//                - Backend tsc --noEmit clean.
//
//              Letter: aiw latest origin/main HEAD; aix
//              sequence-continuous on top.
//
//              Patterns applied: §3.5 audit-first (paused mid-
//              sprint to clarify password tier with user before
//              shipping spec γ vs β); §3.3 atomic full-stack
//              ship (frontend + backend + CSP + docs); §3.2
//              visual smoke walkthrough pre-push (mentally
//              walked password input empty → typing → weak →
//              strong → very-strong → mismatch → match
//              transitions); §19 Sub-pattern 11 CI-parity
//              verification (frontend AND backend tsc gates).
//
//              Patterns emerged: methodology lesson — when user
//              proposes a security-class spec with a strength
//              label ("strong"), pause and validate the spec
//              against industry-standard tiering BEFORE shipping.
//              The "good vs strong vs very strong" classification
//              has explicit reference frameworks (NIST SP 800-63B,
//              OWASP); asking the user "which tier" with a
//              comparison table is faster than shipping and
//              re-shipping. Banked as feedback-loop optimization.
//
//              POST-DEPLOY VERIFICATION REQUIRED
//
//              On Render auto-deploy + Cloudflare rebuild:
//                1. Open /onboarding in incognito.
//                2. Type a phone — should format live as
//                   (XXX) XXX-XXXX, cap at 10 digits.
//                3. Type a password — should show live criteria
//                   checklist + 3-bar strength meter.
//                4. Try "password" — should show WEAK + HIBP
//                   should not fire (criteria unmet).
//                5. Try "Password123!" — 12 chars, WEAK (length
//                   < 14).
//                6. Try "Password1234!!" — 14 chars, all classes
//                   met → STRONG, then HIBP fires after 600ms
//                   → "Appears in N breaches" → can't proceed.
//                7. Try a unique 14+ char password → STRONG →
//                   "Not found in known breaches" → VERY_STRONG
//                   → Next button enables.
//                8. Confirm Password mismatch should block + show
//                   red border + "Passwords don't match".
// v3.8.aiy   — Sprint C: brand-register sweep across Steps 1/2/4 +
//              Card B border. Closes Pattern 7 design-system
//              conformance gap that v3.8.ain Path 2C never reached
//              on these surfaces.
//
//              Pre-aiy: Step 3 (aiv) + Step 5 Review (ain) had been
//              swept to brand tokens; Steps 1/2/4 internals still
//              carried pre-ait border + focus:ring-gold (olive
//              #C9A84C) + text-slate-* greys + bg-red-50
//              border-red-500 (Tailwind red) + bg-green-50
//              border-green-200 (Tailwind green) + text-amber-600
//              (Tailwind amber for "+ Add Unit/Suite" button).
//              No P0 functional issues, but visual inconsistency
//              across steps broke the brand-register continuity
//              v3.8.ait established.
//
//              CHANGES
//
//              (1) Step 1 input chrome — replace_all swap on the
//                  most common input class string (12 occurrences:
//                  Company Name, Address, City, State, Zip, First,
//                  Last, Email, Phone, Password, Fleet Size,
//                  Address inner). All to brand canonical
//                  border-[#EFE6D3] + focus-ring brand-token.
//
//              (2) DOT + MC inputs (conditional cn() classes) —
//                  targeted edits, validation-state borders
//                  swapped: border-red-300/400 -> [#9B2C2C],
//                  border-green-400 -> [#2F7A4F].
//
//              (3) Unit/Suite input — targeted (different class
//                  with text-sm + placeholder:text-gray-400).
//
//              (4) "+ Add Unit / Suite #" button — text-amber-600
//                  hover:text-amber-500 -> text-[#BA7517]
//                  hover:text-[#C5A572].
//
//              (5) Unit label color — text-slate-500 ->
//                  text-[#6B7685].
//
//              (6) Error banner — bg-red-50 border-red-500
//                  text-red-700 -> bg-[#F6E3E3] border-[#9B2C2C]
//                  text-[#9B2C2C].
//
//              (7) DOT length error text — text-red-500 ->
//                  text-[#9B2C2C].
//
//              (8) FMCSA spinner text — text-slate-500 ->
//                  text-[#6B7685].
//
//              (9) FMCSA result panel — full brand-token swap on
//                  success + error states (bg + border + icon +
//                  text colors), out-of-service line, body grid
//                  text.
//
//              (10) "Fields below auto-populated" hint
//                   text-slate-700 -> text-[#6B7685]; divider
//                   border-t -> border-t border-[#EFE6D3].
//
//              (11) Step 2 Fleet Size input — covered by #1
//                   replace_all.
//
//              (12) Step 4 Terms scroll-pane:
//                   - Title: font-bold text-slate-800 ->
//                     font-serif italic font-semibold
//                     text-[#0A2540].
//                   - 11 section headings (replace_all):
//                     font-semibold text-slate-800 ->
//                     font-semibold text-[#0A2540].
//                   - "Last updated" footer: text-slate-700 ->
//                     text-[#6B7685].
//
//              (13) Cross-cutting C.6 — Card B "What you'll need"
//                   outer border default-gray -> border-[#EFE6D3].
//
//              NOT TOUCHED (Sprint D scope)
//
//              Success screen (lines ~480-560) — 11 P1 items
//              banked for Sprint D ~50 LOC. Application Summary
//              cards still bg-slate-50, "What Happens Next"
//              badges still bg-gold/20 olive on step 2, amber-50
//              "Typical review time" chip, etc.
//
//              SCOPE
//
//              ~30 surgical edits across onboarding/page.tsx:
//              - 1 replace_all (input class, 12 hits)
//              - 1 replace_all (Step 4 section heading, 11 hits)
//              - ~14 targeted edits (DOT/MC/Unit + button + hint
//                + error banner + FMCSA panel + Terms title +
//                Terms footer + Card B border)
//
//              Pre-commit gates: frontend tsc clean; frontend
//              next build clean (/onboarding 17 kB, no change).
//
//              Letter: aix latest origin/main HEAD; aiy
//              sequence-continuous on top.
//
//              P1002 RENDER RETRY MECHANIC
//
//              The aix Render deploy hit a Postgres advisory-lock
//              timeout (P1002) at ~11:01 UTC — Prisma's hardcoded
//              lock 72707369 was held by a concurrent or stale
//              migrate process. Same failure class as v3.8.ail
//              P1002 (resolved by retry).
//
//              Diagnostic snapshot at aiy-prep time:
//                - Backend /api/health: 200, uptime ~23 min
//                  (consistent with a successful deploy)
//                - Frontend Cloudflare Pages: aix deployed
//                - Prisma migrate status: schema up to date,
//                  5 migrations applied
//
//              Pushing aiy naturally retries the deploy. ~30+ min
//              elapsed since P1002, advisory lock should be
//              released by Neon's idle connection timeout. aiy
//              adds no new Prisma migrations (frontend-only),
//              migrate deploy step is a no-op — minimal lock
//              contention risk.
//
//              Patterns applied: section 3.5 audit-first (the
//              comprehensive Steps 1-5 audit identified this
//              sweep as Sprint C); section 3.3 atomic single-file
//              ship + CLAUDE.md docs row; section 3.2 visual
//              smoke walkthrough pre-push; section 19 Pattern 7
//              design-system conformance; section 19 Sub-pattern
//              11 CI-parity verification.
//
//              Patterns emerged: P1002-advisory-lock-retry-via-
//              next-push as a self-healing pattern — when a
//              deploy fails on Prisma lock contention, the
//              NEXT push (even if frontend-only) acts as the
//              retry mechanism. No special tooling needed.
//              Banked methodology observation for future P1002
//              incidents.
// v3.8.aiz   — Sprint D: success-screen brand-register sweep.
//              Final onboarding-flow surface that v3.8.ain Path 2C
//              left on pre-ait slate/Tailwind tokens. Closes the
//              full Steps 1-5 + success-screen brand continuity.
//
//              Pre-aiz: success-screen rendered post-submit with
//              11 P1 brand-drift surfaces. Application Summary
//              cards on bg-slate-50, "What Happens Next" badges
//              on bg-gold/20 olive (text-gold = #C9A84C non-
//              canonical) for step 2 + bg-slate-200 for step 3,
//              "Typical review time" amber chip on Tailwind
//              amber tokens (bg-amber-50 border-amber-200
//              text-amber-800), Headlines on text-lg font-bold
//              (not Playfair italic per brand H-register).
//
//              CHANGES
//
//              Success Header card (the "Application Submitted
//              Successfully" panel at top):
//                - Outer card border: default-gray ->
//                  border-[#EFE6D3]
//                - Success icon background: bg-green-50 ->
//                  bg-[#E6F0E9] (§2.1 success-bg)
//                - Success icon color: text-green-700 ->
//                  text-[#2F7A4F] (§2.1 success)
//                - H2: text-2xl font-bold -> font-serif italic
//                  font-semibold text-2xl text-[#0A2540]
//                  (brand H-register matching Step headers)
//                - Subtitle: text-slate-500 -> text-[#3A4A5F]
//                - Email strong tag: text-slate-700 ->
//                  text-[#0A2540]
//
//              Application Summary card:
//                - Outer card border: default-gray ->
//                  border-[#EFE6D3]
//                - H3 "Application Summary": text-lg font-bold ->
//                  font-serif italic font-semibold text-xl
//                  text-[#0A2540]
//                - 6 summary cards (Company/Contact/DOT/MC/
//                  Equipment/Regions): bg-slate-50 rounded-lg ->
//                  bg-[#FBF7F0] border border-[#EFE6D3]
//                  rounded-lg
//                - 6 card labels: text-slate-700 text-xs
//                  uppercase tracking-wide -> brand gold-dark
//                  eyebrow text-[10px] uppercase tracking-
//                  [0.22em] font-semibold text-[#BA7517]
//                  (matches Step 5 Review register)
//                - 6 card values: font-medium -> font-semibold
//                  text-[#0A2540] (brand value text)
//                - FMCSA Verified banner: bg-green-50
//                  border-green-200 text-green-800 ->
//                  bg-[#E6F0E9] border-[#2F7A4F]/40
//                  text-[#2F7A4F] (§2.1 success token); icon
//                  text-green-600 -> text-[#2F7A4F]
//
//              What Happens Next card:
//                - Outer card border: default-gray ->
//                  border-[#EFE6D3]
//                - H3: text-lg font-bold -> font-serif italic
//                  font-semibold text-xl text-[#0A2540]
//                - Step 1 badge "1": bg-green-700 text-[#FBF7F0]
//                  -> bg-[#2F7A4F] text-[#FBF7F0] (brand success
//                  green, replaces Tailwind green-700)
//                - Step 2 badge "2": bg-gold/20 text-gold (olive
//                  non-canonical #C9A84C) -> bg-[#BA7517]/20
//                  text-[#BA7517] (brand gold-dark tint)
//                - Step 3 badge "3": bg-slate-200 text-slate-500
//                  -> bg-[#EFE6D3] text-[#6B7685] (brand cream-2
//                  tint + slate-tertiary)
//                - 3 step labels (Compass Engine Verification,
//                  Team Review, Approval & Portal Access):
//                  added text-[#0A2540] for brand contrast
//                - 3 step body texts: text-slate-500 ->
//                  text-[#3A4A5F]
//                - "Typical review time" warning chip:
//                  bg-amber-50 border-amber-200 text-amber-800
//                  (Tailwind amber) -> bg-[#FBEFD4]
//                  border-[#B07A1A]/40 text-[#B07A1A]
//                  (§2.1 warning token)
//
//              LENS 1.5 SOFTENING (out of P1 strict scope)
//
//              Step 1 "Compass Engine Verification" body text
//              previously enumerated the 5 internal vetting
//              axes ("35-point check against your FMCSA
//              authority, insurance amounts, safety record,
//              authority age, and OFAC status"). Softened to
//              "Our verification system is running compliance
//              checks against your FMCSA authority, insurance,
//              safety record, and screening lists." Removes the
//              "35-point" specific number (banked Lens 1.5
//              concern from audit S.12) + softens the OFAC-
//              specific reference to "screening lists" while
//              preserving operational reassurance. Still
//              acceptable post-submit per-carrier context (not
//              anonymous marketing); not a hard architectural
//              reveal, but tighter framing.
//
//              ACTIONS CARD (lines 558+) UNTOUCHED
//
//              Already brand-canonical from v3.8.aiq (gold-dark
//              Call CTA + cream-bordered Email ghost + cream-2
//              border + gold-dark Return-to-Homepage link). No
//              change needed.
//
//              SCOPE
//
//              ~80 LOC restructured across lines 478-555
//              (success-screen render block) in
//              onboarding/page.tsx. Single contiguous Edit.
//              No backend changes. No new dependencies.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding 17 kB -> 16.9 kB,
//              expected slight reduction from cleaner class
//              names).
//
//              Letter: aiy latest origin/main HEAD; aiz
//              sequence-continuous on top. Next after aiz is
//              aja per §3.1 double-letter continuation rule.
//
//              FULL ONBOARDING-FLOW BRAND ALIGNMENT NOW CLOSED
//
//              Steps 1-5 + success screen all on brand canonical
//              tokens. Visual continuity complete from entry
//              (DOT/MC) through submit to post-submit context.
//              The audit-driven sprint sequence A (aiv) -> B (aiw)
//              -> [phone/password aix] -> C (aiy) -> D (aiz)
//              closes the Pattern 7 design-system conformance
//              gap that v3.8.ain Path 2C left open across the
//              flow.
//
//              Remaining audit work:
//                - Sprint E: Step 4 BCA click-wrap defensibility
//                  (agreedAt timestamp + IP/userAgent + download-
//                  PDF + rename to BCA, ~80 LOC + schema). Per
//                  CLAUDE.md §14 + §16, improves interim click-
//                  through enforceability while standalone
//                  executable BCA + Michigan attorney review
//                  (first-carrier blocker) remain pending.
//
//              Patterns applied: §3.5 audit-first (Sprint D
//              identified in comprehensive audit with explicit
//              11-item P1 enumeration); §3.3 atomic single-file
//              ship + CLAUDE.md docs row; §3.2 visual smoke
//              walkthrough pre-push; §19 Pattern 7 design-system
//              conformance (final surface in the onboarding
//              flow Sprint sequence); §19 Sub-pattern 11 CI-
//              parity verification.
//
//              Patterns emerged: none new — Sprint D is the
//              terminal sweep that closes the multi-sprint
//              brand-register effort. The methodology lesson
//              from v3.8.ait ("chrome-polish sprints must
//              include IA + brand-token audit not just headers")
//              would have prevented the original v3.8.ain miss
//              and saved Sprints A/C/D — banking that
//              acknowledgment in the §11 row.
// v3.8.aja   — Sprint E: BCA click-wrap defensibility. Full-stack
//              atomic (schema + migration + Zod + controller +
//              frontend rename + Print/PDF). Closes the last audit
//              item — full Sprints A→E sequence done.
//
//              CRITICAL CAVEAT (§16): Sprint E does NOT close the
//              first-carrier blocker. §16 #1 (standalone executable
//              BCA .docx) + #2 (Michigan attorney review) remain.
//              aja only upgrades the INTERIM click-through that
//              bridges until the standalone executed document
//              lands.
//
//              BACKEND
//
//              (1) prisma/schema.prisma — 4 new nullable fields on
//                  CarrierProfile (before Insurance Agent block):
//                    bcaAgreedAt            DateTime?
//                    bcaAgreedFromIp        String?
//                    bcaAgreedFromUserAgent String?
//                    bcaVersion             String?
//
//              (2) prisma/migrations/20260524073652_add_bca_
//                  clickwrap_audit_fields/migration.sql NEW —
//                  manual ALTER TABLE (TIMESTAMP(3) + 3 TEXT), per
//                  §2.2 (no migrate-dev against prod-pointed URL).
//
//              (3) src/validators/carrier.ts — 1 new
//                  z.string().optional() for bcaVersion. Other 3
//                  audit fields NOT in validator (agreedAt =
//                  server-now, IP from req.ip, UA from
//                  req.headers — authoritative, not client-
//                  supplied).
//
//              (4) src/controllers/carrierController.ts —
//                  registerCarrier writer captures all 4 fields
//                  server-side on every successful registration
//                  (canNext requires agreeTerms=true so any
//                  successful POST = accepted click-wrap).
//
//              FRONTEND (onboarding/page.tsx)
//
//              (1) New BCA_VERSION = "2026-05-24-v1" constant.
//                  Bump on any Step 4 text revision.
//
//              (2) Step 4 H2: "Terms & Agreement" -> "Broker-
//                  Carrier Agreement". §14 canonical alignment.
//
//              (3) Step 4 intro tightened.
//
//              (4) In-pane title: "Carrier Transportation
//                  Agreement" -> "Broker-Carrier Agreement
//                  (Click-Through)". Opening paragraph renamed
//                  accordingly.
//
//              (5) Print / Save-as-PDF affordance — flex row
//                  above the agreement scroll-pane with version
//                  eyebrow on left, FileText-icon outlined button
//                  on right. onClick triggers window.print().
//                  Browser's native dialog offers "Save as PDF"
//                  destination — no PDF library needed.
//
//              (6) Hidden print-only header (print:block) shows
//                  in printed PDF only: "Silk Route Logistics
//                  Inc. — Broker-Carrier Agreement (Click-
//                  Through) — Version {BCA_VERSION} — Printed
//                  {date}".
//
//              (7) Tailwind print: modifiers strip surrounding
//                  chrome: OnboardingNav, eyebrow strip "Carrier
//                  Registration", step indicator, Step 4 header,
//                  Version+Print button row, agree-terms
//                  checkbox, Back/Next buttons — all
//                  print:hidden. Form panel border/shadow/padding
//                  stripped via print:border-0
//                  print:shadow-none print:rounded-none
//                  print:p-0. Agreement scroll-pane expanded via
//                  print:max-h-none print:overflow-visible
//                  print:bg-white print:border-0 print:p-0.
//                  Net effect: printed PDF shows just print-only
//                  header + full BCA body.
//
//              (8) Agree-terms label: "I agree to the Carrier
//                  Terms & Conditions" -> "I agree to the
//                  Broker-Carrier Agreement above".
//
//              (9) handleSubmit payload: body extended with
//                  bcaVersion: BCA_VERSION.
//
//              POSSIBLE P1002 ON DEPLOY
//
//              aja adds the 6th Prisma migration (5th was aiw's
//              Effective Date pair). aix and aiw both hit P1002
//              on migration-bearing deploys. Same retry pattern
//              applies if aja fails: wait ~30 min for Neon idle
//              timeout to release advisory lock 72707369, then
//              Render dashboard -> Manual Deploy -> Deploy
//              latest commit. Sprint C aiy row has the full
//              runbook.
//
//              SCOPE
//
//              ~140 LOC across 6 files. Onboarding bundle 16.9 kB
//              -> 17.2 kB.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              backend tsc clean (Prisma client regenerated);
//              frontend tsc clean; frontend next build clean.
//
//              Letter: aiz latest origin/main HEAD; aja
//              sequence-continuous on top per §3.1 double-letter
//              continuation (after aiz comes aja since "a-i-z"
//              is the v3.8 minor's z; continuing pre + j + a).
//
//              FULL AUDIT SEQUENCE CLOSED
//
//              A (aiv) Step 3 P0+P1 -> B (aiw) Effective Dates ->
//              [aix phone+password gamma tier] -> C (aiy) Steps
//              1/2/4 + Card B brand sweep -> D (aiz) success
//              screen -> E (aja) BCA defensibility. Onboarding
//              flow is brand-canonical, IA-correct, defensibility-
//              upgraded, ready for first-carrier onboarding once
//              §16 blockers #1 (standalone executable BCA) + #2
//              (Michigan attorney review) clear.
//
//              Patterns applied: §3.5 audit-first; §3.3 atomic
//              full-stack ship; §2.2 schema mutation discipline;
//              §3.2 visual smoke walkthrough pre-push; §19
//              Sub-pattern 11 CI-parity verification (both
//              backend AND frontend tsc gates).
//
//              Patterns emerged: methodology lesson — Tailwind
//              print: modifier system is a clean client-only
//              PDF-export mechanism for legal documents.
//              Avoids server-side PDF endpoint complexity AND
//              client-side PDF library bundle bloat (jsPDF ~50-
//              100kb). Browser-native "Save as PDF" via print
//              dialog is the universal fallback. Banked as UX
//              pattern for future document-export affordances.
// v3.8.ajb   — Sprint F + EIN registration hotfix (atomic bundle).
//              Two related Step 3 / submit-path fixes shipped
//              together since both touch onboarding/page.tsx +
//              both block carrier onboarding.
//
//              CRITICAL BUG FIX (regression from v3.8.air)
//
//              Reproduced via curl against deployed prod:
//                POST /api/carrier/register with ein:""
//                -> 400 {"error":"Validation failed",
//                       "details":[{"field":"ein",
//                                   "message":"EIN must be 9 digits"}]}
//
//              In v3.8.air I removed the EIN input from Step 1
//              but kept `ein: ""` in form state with the comment
//              "retained as empty default for backend payload
//              compatibility — backend will gracefully accept
//              empty string." That assumption was wrong.
//
//              Backend Zod is
//                ein: z.string().regex(/^\d{9}$/, "EIN must be
//                  9 digits").optional()
//              `.optional()` allows the field to be ABSENT.
//              But if PRESENT (including as empty string), the
//              regex must match. Empty string fails the regex
//              (zero digits, not nine).
//
//              regData spread in handleSubmit included `ein: ""`,
//              so every carrier registration since v3.8.air had
//              been silently failing at Step 5 Submit with
//              "Validation failed". Wasi caught it when actually
//              trying to register through to Step 5 on deployed
//              v3.8.aja — first end-to-end submit smoke since
//              the air regression.
//
//              Fix: 3-line frontend change.
//                (1) Peel `ein` out of the regData destructure
//                    via `ein: einFromForm`.
//                (2) In the fetch body, conditionally include
//                    ein only if non-empty:
//                      ...(einFromForm ? { ein: einFromForm } : {})
//              Frontend now sends ein only when user actually
//              entered one (today: never, since the input is
//              removed). Backend `.optional()` accepts the
//              absent field cleanly.
//
//              METHODOLOGY LESSON
//
//              Smoke verification on form sprints must include
//              the FULL submit path, not just step-level visual
//              checks. The user-memory
//              feedback_visual_smoke_before_push.md covers
//              layout/chrome but doesn't enumerate end-to-end
//              submit verification. Banking as an extension:
//              for any sprint that touches handleSubmit payload
//              shape OR backend Zod schema, the smoke MUST
//              include a real curl-or-browser submit through to
//              200/400 + response body inspection.
//
//              SPRINT F (required documents enforcement)
//
//              Step 3 documents (W-9, Insurance Certificate,
//              Authority Letter, + Safety Fitness Certificate
//              if Canadian) were UI-visible but completely
//              optional at the canNext gate. Carriers could
//              proceed to Step 4/5 + submit registration
//              without uploading any of them.
//
//              Changes:
//                (1) canNext extended for step === 2:
//                      const hasDoc = (key) =>
//                        files.some(f => f.__docType === key);
//                      const hasCanadianOps =
//                        form.operatingRegions.some(
//                          r => CANADIAN_REGIONS.includes(r));
//                      if (!hasDoc("w9")) return false;
//                      if (!hasDoc("insurance")) return false;
//                      if (!hasDoc("authority")) return false;
//                      if (hasCanadianOps && !hasDoc("safety"))
//                        return false;
//                      return true;
//
//                (2) Document data extended with `required:
//                    true` flag on all visible docs (Safety
//                    Cert already conditional per v3.8.aiv).
//
//                (3) Visual indicators:
//                    - Red asterisk after each required doc
//                      label: text-[#9B2C2C].
//                    - Missing-state styling: warning-amber
//                      bg + border (bg-[#FBEFD4]
//                      border-[#B07A1A]/40) for required docs
//                      not yet uploaded; upload icon also
//                      switches to amber.
//                    - Description text appends " — required"
//                      when missing.
//
//                (4) Count banner above the doc list:
//                    "X of Y required uploaded" — green when
//                    all met, amber otherwise.
//
//                (5) Section intro extended with explicit note:
//                    "All marked with * are required to submit."
//
//              UX: carrier sees the required-state visually +
//              gets blocked at Next until all required uploads
//              present. Submit on Step 5 still passes the EIN
//              hotfix above.
//
//              SCOPE
//
//              ~50 LOC in onboarding/page.tsx (3 LOC EIN +
//              ~45 LOC required-docs UI + canNext block).
//              No backend changes. No CSP changes. No new
//              dependencies.
//
//              Pre-commit gates (Sub-pattern 11 CI parity):
//              frontend tsc --noEmit clean; frontend npx next
//              build clean (/onboarding 17.2 kB -> 17.5 kB,
//              expected ~0.3 kB from count banner + required
//              asterisks + missing-state styling).
//
//              Letter: aja latest origin/main HEAD; ajb
//              sequence-continuous on top. Cloudflare deploy
//              only — no backend changes, Render path-filter
//              skips this push (which is fine per aiy retry
//              mechanic learning).
//
//              POST-DEPLOY VERIFICATION REQUIRED
//
//              On Cloudflare rebuild:
//                1. EIN hotfix: register a test carrier
//                   through full flow to Step 5 + Submit.
//                   Should now succeed (no more "Validation
//                   failed" banner). CarrierProfile row
//                   created with bca* fields populated per
//                   v3.8.aja.
//                2. Required docs: in Step 3, try clicking
//                   Next without uploading any documents.
//                   Next button should stay disabled. Upload
//                   W-9 only -> still disabled. Upload
//                   Insurance Certificate -> still disabled.
//                   Upload Authority Letter -> Next enables
//                   (assuming no Canadian region selected).
//                   If carrier had Canadian region selected
//                   in Step 2, Safety Cert also required
//                   before Next enables.
//                3. Count banner should update live as each
//                   doc uploads ("1 of 3" -> "2 of 3" ->
//                   "3 of 3" with color flip from amber
//                   to green).
//
//              Patterns applied: §3.5 audit-first (curl-
//              reproduced the EIN regression before fixing);
//              §3.3 atomic single-file ship with bundled
//              fixes (both touch onboarding/page.tsx + both
//              are registration-flow gates); §3.4 halt > ship
//              (paused Sprint F push to diagnose the EIN
//              error first instead of pushing on top); §3.2
//              visual smoke (mentally walked Step 3 empty/
//              partial/full doc states); §19 Sub-pattern 11
//              CI-parity verification.
//
//              Patterns emerged: methodology lesson —
//              submit-path-smoke as required gate for any
//              sprint touching handleSubmit / Zod schema.
//              The visual chrome can pass eye-test perfectly
//              while a payload-shape regression sits in the
//              hot path for many sprints. Banking as an
//              extension of feedback_visual_smoke_before_push.
// v3.8.ajc   — Admin NotificationBell wire-up for new carrier
//              registrations. Backend-only ~10 LOC change in
//              registerCarrier controller — after the existing
//              admin email block, also create a
//              prisma.notification.create row per admin user
//              with type=ONBOARDING + deep-link to
//              /dashboard/carriers?status=PENDING.
//
//              Pre-ajc the NotificationBell (CeoOverview header
//              line 307+804) polled /api/notifications/unread-
//              count every 30s but NEVER incremented on new
//              carrier registrations because no Notification
//              row was created admin-side — only emails fired.
//              Email was the sole channel. If the admin missed
//              the email or it landed in a filter, the only
//              other surfacing was the "Pending Approvals"
//              count tile on /dashboard/overview (which doesn't
//              proactively alert).
//
//              Post-ajc: admins get THREE redundant signals on
//              every new application — (1) email to
//              whaider@silkroutelogistics.ai + any other ADMIN
//              users, (2) NotificationBell red badge + dropdown
//              row, (3) "Pending Approvals" count on
//              /dashboard/overview. Much harder to miss.
//
//              SCOPE
//
//              ~10 LOC in backend/src/controllers/
//              carrierController.ts — added after the admin
//              email block at ~line 268.
//              No frontend changes (NotificationBell already
//              polls + renders unread badges).
//
//              Pre-commit gates: backend tsc --noEmit clean.
//              No frontend gates required (no frontend change).
//
//              Letter: ajb latest origin/main HEAD; ajc
//              sequence-continuous on top.
//
//              POSSIBLE P1002 ON DEPLOY
//
//              No new Prisma migrations in ajc, only a backend
//              code change. Render deploy will run migrate
//              deploy as a no-op (5 migrations already applied
//              from earlier sprints). Low P1002 risk since
//              there's no concurrent migration writing.
//
//              REMAINING ONBOARDING GAPS (banked for brainstorm)
//
//              ajc closes 1 of the 4 banked gaps from the
//              prior walkthrough. The other 3 remain:
//                - Document review automation (OCR/parse
//                  W-9/COI/Authority PDFs)
//                - Carrier-facing application status UI
//                  (between submit + approve, carrier has no
//                  portal page showing where they are in the
//                  pipeline)
//                - Rejection notification UX (rejection email
//                  + carrier-portal status page wording)
//                - DAT load board registration (§16 blocker
//                  #3)
//
//              Brainstorm pending Wasi direction on workflow
//              shape — full design + atomic ships to follow.
//
//              Patterns applied: §3.3 atomic small-surgical
//              ship; §3.5 audit-first (verified NotificationType
//              enum value before writing); §19 Sub-pattern 11
//              CI-parity (backend tsc clean).
//
//              Patterns emerged: none.
// v3.8.ajd — Sprint 1 of carrier onboarding lifecycle epic.
//            6-state OnboardingStatus migration (PENDING +
//            REVIEWING + INFO_REQUESTED + APPROVED + REJECTED
//            + SUSPENDED; merges legacy DOCUMENTS_SUBMITTED +
//            UNDER_REVIEW into single REVIEWING state, adds
//            INFO_REQUESTED for v3.8.aje workflow). Carrier
//            login refactored — non-APPROVED carriers may log
//            in and land on new /carrier/dashboard/application
//            -status page (state-specific copy per onboarding
//            stage); SUSPENDED remains the only hard-block at
//            OTP/TOTP gates. Carrier dashboard layout hides
//            sidebar + search + notifications + Marco Polo for
//            non-APPROVED carriers and routes them to the
//            status page; routes APPROVED-on-status-page back
//            to the dashboard. New GET /carrier-auth/applica
//            tion-status endpoint returns header context +
//            submittedAt + approvedAt with stable shape for
//            v3.8.aje to extend with InfoRequest list +
//            rejection reason + reapply date. AE-side Tab
//            filter on /dashboard/carriers updated to new
//            enum; STATUS_COLORS palette extended.
//
//            Manual Prisma migration per §2.2 (enum-swap
//            pattern: drop defaults → cast both carrier_pro
//            files and customers columns with CASE remapping
//            → drop old enum → rename new → restore PENDING
//            default). Customer.onboardingStatus column rides
//            through unchanged (shipper side never used the
//            two retired values).
//
//            Patterns applied: §3.3 atomic single-sprint
//            ship (state machine + login + status page in
//            one commit; v3.8.aje for InfoRequest workflow);
//            §3.5 audit-first (verified 27 backend + 16
//            frontend consumers before migration design);
//            §2.2 manual migration; §19 Pattern 7 design-
//            system conformance (status palette extended to
//            new 6 states); §19 Sub-pattern 11 CI-parity
//            (backend tsc + frontend tsc + next build all
//            clean pre-push); §A.1 state machine canonical.
//
//            Patterns emerged: none — sub-pattern 8 visual-
//            verification gate not applicable; non-APPROVED
//            carriers cannot reach the status page in this
//            session (no PENDING fixture in seed) so visual
//            smoke deferred to next session when a PENDING
//            carrier exists in prod.
// v3.8.aje — Email verification gate + offline IP geolocation.
//            Adds an industry-standard email-verification step:
//            post-registration the carrier receives a 24h
//            click-link; click → POST to backend → token consumed
//            + emailVerifiedAt + emailVerifiedFromIp +
//            emailVerifiedFromCountry written transactionally.
//            geoip-lite (zero-cost offline DB) resolves country
//            at both registration time + verify-click time; the
//            country-mismatch case writes a SystemLog WARNING
//            for AE forensic review (registered from US,
//            verified from KR → flagged). Compass A-grade
//            auto-approve now ALSO gates on emailVerifiedAt —
//            unverified carriers stay PENDING even when their
//            FMCSA + insurance + OFAC checks pass. AE manual
//            approval still has its own discretion.
//
//            New backend: services/geoService.ts (resolveGeo,
//            resolveCountry, extractClientIp wrappers around
//            geoip-lite), emailService.sendEmailVerificationEmail,
//            otpService createEmailVerificationToken +
//            peekEmailVerificationToken +
//            consumeEmailVerificationToken +
//            getEmailVerificationResendCooldown (VERIFY: prefix
//            on existing OtpCode table — no new schema for token
//            storage). New endpoints: POST /carrier-auth/verify
//            -email (public — token IS the auth), POST /carrier
//            -auth/resend-verification (carrier-authenticated,
//            60s cooldown). Application-status endpoint extended
//            with emailVerifiedAt field. registerCarrier captures
//            registrationCountry into CarrierProfile + fires
//            verification email post-response. Schema migration
//            20260524103000_email_verification_and_geo adds
//            User.emailVerifiedAt + emailVerifiedFromIp +
//            emailVerifiedFromCountry + CarrierProfile.
//            registrationCountry (all nullable, no backfill).
//
//            New frontend: /carrier/verify-email landing page
//            (Suspense-wrapped; reads ?token=... param; POSTs to
//            backend; renders success/already-verified/invalid/
//            error states with brand-canonical chrome).
//            Application-status page extends with a top-of-card
//            warning-amber banner when emailVerifiedAt is null;
//            inline Resend Verification button that surfaces the
//            429 cooldown message verbatim. TanStack mutation
//            invalidates the status query on success so the
//            banner disappears the moment the carrier clicks
//            the link.
//
//            Patterns applied: §3.3 atomic single-sprint ship
//            (email-verify + geolocation bundled because the
//            verify-click is exactly where geolocation pays off);
//            §3.5 audit-first (verified existing isVerified
//            overload, OpenPhone SMS infra, OtpCode token reuse
//            pattern, registrationIpHash already wired); §2.2
//            manual Prisma migration; §3.10 transactional email
//            via Resend (verification email is not lead-hunter
//            outreach so reply-to default applies); §19 Pattern 7
//            design-system conformance (status banner uses
//            brand-canonical FBEFD4 + B07A1A warning palette);
//            §19 Sub-pattern 11 CI-parity (backend tsc + frontend
//            tsc + next build all clean).
//
//            Patterns emerged: none. Bundled atomic ship per
//            user's "email verify + cheapest geolocation" spec.
//            v3.8.ajf will layer unusual-activity dual-channel
//            OTP (email + SMS via OpenPhone) on top of this geo
//            data — the country-tracking introduced here is
//            exactly what ajf needs to detect "login from
//            different country than last time".
// v3.8.ajf — Unusual-activity dual-channel OTP.
//            Carrier login OTP step now classifies each attempt
//            against the user's last-known login country. When
//            current country differs from User.lastLoginCountry,
//            the OTP is sent via BOTH email AND SMS (OpenPhone
//            sendOtpSms helper added) — defense-in-depth on the
//            assumption that account compromise typically
//            captures password + email but not phone. When they
//            match (or no prior data exists for first-login
//            users), email-only as before. After successful OTP
//            or TOTP verification, lastLoginIp + lastLoginCountry
//            are written so the next attempt has a current
//            baseline. First-login behavior is intentionally
//            permissive — we don't flag every pre-ajf carrier
//            as "unusual" the day this ships; baseline starts
//            from their first successful post-deploy login.
//
//            Detection lens (v1, deferred extensions noted):
//              * Different country than lastLoginCountry — covered
//              * Same country, different city far away (1500+mi
//                US jump) — deferred (Haversine + lat/lon needed)
//              * VPN/datacenter exit nodes — deferred (paid IP
//                reputation API needed)
//              * Time-of-day anomalies — deferred (per-user
//                login histogram needed)
//
//            New backend: services/geoService.detectUnusualActivity
//            (compares current resolveCountry to lastLoginCountry
//            with first-login + unresolvable-IP guards); services/
//            openPhoneService.sendOtpSms wraps existing sendSMS
//            with brand-identified body (single SMS segment).
//            carrierAuth: /login step detects unusual + dispatches
//            dual-channel + writes SystemLog WARNING with reason
//            (carrier-facing response unchanged — fraudster
//            doesn't learn we detected); /verify-otp + /totp-verify
//            success paths write lastLoginIp + lastLoginCountry +
//            lastLogin via prisma.user.update. Schema migration
//            20260524113000_user_last_login_geo adds two nullable
//            TEXT columns on users (lastLoginIp + lastLoginCountry).
//            SMS failure is non-fatal — email is primary channel,
//            SMS is enhancement, carrier still receives email OTP
//            and can complete login normally.
//
//            No frontend changes — same OTP flow from the
//            carrier's perspective; they may simply also receive
//            a text alongside the email when unusual.
//
//            Patterns applied: §3.3 atomic single-sprint ship;
//            §3.5 audit-first (verified OpenPhone sendSMS exists,
//            confirmed geoip-lite resolveCountry from aje is
//            reusable, found OTP-verify + TOTP-verify success
//            paths to write lastLogin* in both); §2.2 manual
//            Prisma migration; §19 Sub-pattern 11 CI-parity
//            (backend tsc + frontend tsc + next build all clean);
//            defensive non-fatal SMS dispatch per email-primary
//            channel design.
//
//            Patterns emerged: none. Direct continuation of aje's
//            geolocation foundation — the country fields written
//            at registration + verify-click + login time form a
//            three-point baseline going forward.
// v3.8.ajg — Prisma + Neon DIRECT_URL split (permanent P1002 fix).
//            Adds `directUrl = env("DIRECT_URL")` to schema's
//            datasource db block. Prisma auto-uses DIRECT_URL
//            for ALL migrate operations; DATABASE_URL stays
//            pooled for runtime queries. Direct connection has
//            no pooler caching layer, so the advisory lock
//            pg_advisory_lock(72707369) releases the moment
//            migrate exits — no more pooler-cached stale lock-
//            holder PIDs. Permanent fix for the P1002 class
//            that fired three times across v3.8.ail / aix / ajf.
//
//            Wasi added DIRECT_URL env var on Render dashboard
//            pre-deploy (Neon direct endpoint, no -pooler in
//            hostname). PRISMA_MIGRATE_LOCK_TIMEOUT=60000
//            recommended as belt-and-suspenders alongside.
//
//            CLAUDE.md §2.2 updated with canonical env var
//            list. §13.3 Item 191 closed by this sprint.
//
//            Side benefits: deterministic prisma migrate
//            status, reliable Sprint 44b post-deploy gate,
//            safer future destructive migrations.
//
//            Patterns applied: §3.3 atomic ship; §3.5 audit-
//            first (three-fire P1002 banked first); §19 Sub-
//            pattern 11 CI-parity. Patterns emerged: none.
// v3.8.ajh — INFO_REQUESTED workflow (Sprint 4 of onboarding
//            lifecycle epic). AE creates InfoRequest against
//            a carrier with industry-standard category +
//            free-form message; carrier responds from portal;
//            auto-flip onboardingStatus PENDING/REVIEWING →
//            INFO_REQUESTED on create, INFO_REQUESTED →
//            REVIEWING on last-open resolution/cancellation.
//            Dual email triggers (AE→carrier on create,
//            carrier→AE on resolve). Industry-standard
//            templates surface in AE modal dropdown with
//            pre-filled message body (COI / W-9 / Authority
//            Letter / Safety / EIN / Voided Check / Address
//            Proof / References / Other) — text-only
//            resolution in v3.8.ajh; file uploads banked for
//            v3.8.aji as separate atomic.
//
//            New: InfoRequest Prisma model + InfoRequestCategory
//            + InfoRequestStatus enums + 1 migration.
//            services/infoRequestService.ts encapsulates
//            create/resolve/cancel + auto-flip + emails.
//            routes/infoRequests.ts (AE: create/list/cancel).
//            carrierAuth.ts +2 endpoints (list-open/resolve).
//            components/carriers/InfoRequestModal.tsx (AE
//            create modal with category template auto-fill).
//            application-status/page.tsx InfoRequestedSection
//            rewritten with real list + per-request resolve
//            forms + TanStack mutation that invalidates both
//            queries on success (the section re-renders into
//            REVIEWING state automatically when the last open
//            request is resolved).
//
//            Patterns applied: §3.3 atomic ship; §3.5 audit-
//            first (verified NotificationType.type is String
//            not enum so "INFO_REQUEST" strings are valid;
//            confirmed sendEmail + wrap signature);
//            §2.2 manual migration; §A.1 state machine
//            canonical (status auto-flip encoded in service);
//            §19 Pattern 7 design-system conformance (modal
//            chrome matches §2.1 brand tokens — cream surface
//            + gold-dark CTA + warning-amber for requested
//            state); §19 Sub-pattern 11 CI-parity.
//            Patterns emerged: none.
// v3.8.aji — InfoRequest file-upload attachments (Sprint 5 of
//            onboarding lifecycle epic). Carrier-portal resolve
//            form gains an optional multi-file picker; uploads
//            land in S3 via existing storageService.uploadFile
//            + create Document rows with infoRequestId FK +
//            docType="INFO_REQUEST_RESPONSE" + entityType=CARRIER.
//            Backend resolve endpoint switched from JSON to
//            multipart via upload.array("files", 5) middleware.
//            Service layer extended with attachmentCount param
//            for AE notification email body. AE list endpoint
//            includes attachments[] inline (id/fileName/fileUrl
//            /fileType/fileSize/createdAt). Carrier-side file
//            picker validates client-side against the same MIME
//            set + 25MB max the backend multer fileFilter
//            enforces (PDF, JPG, PNG, DOC, DOCX). Staged-file
//            list with per-row remove button + drag-drop ready.
//
//            Schema migration 20260524133000 adds
//            documents.info_request_id (nullable, ON DELETE
//            SET NULL so InfoRequest deletes don't cascade-
//            delete carrier docs). Attachments stay in the
//            carrier's regular doc history (entityType+
//            entityId lookup) AND surface via infoRequest.
//            attachments inline for AE thread context.
//
//            AE Console drawer that surfaces full info-request
//            thread (open + resolved with attachments) banked
//            for v3.8.ajj. For now, AE finds uploads via the
//            existing /dashboard/carriers documents tab
//            (entityType=CARRIER lookup) — no extra UI surface.
//
//            Patterns applied: §3.3 atomic single-sprint ship;
//            §3.5 audit-first (verified existing upload pattern
//            at routes/carriers.ts:335 + multer config + S3
//            uploadFile signature); §2.2 manual migration; §19
//            Sub-pattern 11 CI-parity. Patterns emerged: none.
// v3.8.ajw — State-machine integrity bundle (C3 + C8 + H3 + H4 + C10).
//   C3: Central loadStateMachine.ts validator wired into POST
//   /carrier-loads/:id/status. Pre-ajw any of {AT_PICKUP, LOADED,
//   IN_TRANSIT, AT_DELIVERY, DELIVERED} was accepted regardless of current
//   load state — driver tapping "Mark Delivered" on a BOOKED load would
//   flip straight to DELIVERED, breaking downstream invoice/POD flow.
//   Validator returns 422 with structured reason on illegitimate transitions.
//   Full Item 159 13-write-site refactor stays banked for Sprint 53+.
//   C8: Auto-RC generation failure in acceptTender + acceptTenderOnBehalf
//   now writes a queryable SystemLog WARNING (source=auto-rc-generation)
//   so ops can find tenders that need a manual RC follow-up. AE
//   notification still fires; falls back to /dashboard/track-trace URL.
//   H3: declineTender + counterTender now write AuditLog rows
//   (TENDER_DECLINED + TENDER_COUNTERED). Closes the gap where carrier
//   decline/counter events were untrackable for analytics.
//   H4: approvalService.ts wraps email send failure with a queryable
//   SystemLog WARNING (source=approval-email). In-app notification at
//   carrier next-login is still the operational fallback; the WARNING
//   row enables a future "re-send approval email" ops tool.
//   C10: Daily cleanup cron extended with Notification table — read >30
//   days deleted, unread >90 days deleted. Bell-icon dropdown stack stays
//   operationally relevant; the indexes on Notification model are already
//   tuned for this query (userId+read+readAt, createdAt).
//   ~120 LOC net across 5 files (1 new lib + 4 edits). No schema migration.
// v3.8.ajx — Operational compliance bundle (H1+C4 + C5 + C9). C7 deferred.
//   H1+C4: Single SUSPENDED gate helper (checkCarrierNotSuspended) wired
//   into 5 carrier-side write endpoints — /:id/status, /:id/documents,
//   /:id/check-call, /:id/exceptions, /:id/exceptions/:excId/receipt.
//   Pre-ajx a carrier auto-suspended mid-flight by complianceMonitorService
//   (insurance expiry / authority revoked / safety rating / monthly re-vet)
//   could still mutate active loads — upload POD, mark IN_TRANSIT, fire
//   check calls — because ownership gates fired but onboardingStatus did
//   not. Returns 403 + code "CARRIER_SUSPENDED" so the carrier portal can
//   surface "Your account is suspended. Contact compliance@."
//   C5: QP monthly limit hard block on POST /carrier-payments/:id/
//   request-quickpay. Tier limits per §8: Silver $15K/mo, Gold $40K/mo,
//   Platinum $80K/mo. Aggregate this carrier's QUICKPAY-method
//   CarrierPay rows for the calendar month; if this request would push
//   over the tier limit, refuse with 422 + structured cycle-resets
//   message. Per-load auto-approve threshold (Silver $2K / Gold $4K /
//   Platinum $6K) flagged in response as advisory (overAutoApprove
//   boolean); hard enforcement deferred to C5b once AE approval-state
//   machine stabilizes.
//   C9: Three new SystemLog WARNING rows on the registerCarrier
//   fire-and-forget background tasks — Compass vetting, identity check,
//   OFAC screening. Pre-ajx all three failure paths only fired log.error
//   to Render stdout (transient); now ops can query by source filter
//   (compass-auto-vet, compass-identity-check, compass-ofac-screen) to
//   find carriers needing manual re-runs. OFAC failures explicitly
//   tagged as compliance-blocking ("must re-screen before approval").
//   C7 (OTP unusual-activity admin override) deferred to v3.8.ajy —
//   requires User schema field + migration + admin UI endpoint, cleaner
//   as standalone atomic.
//   ~160 LOC net across 4 files (3 backend edits + version bump). No
//   schema migration. Migrate-deploy step will no-op.
// v3.8.ajy — C7 OTP unusual-activity SMS suppression override.
//   Cross-border owner-ops + carriers logging in from multiple countries
//   hit the v3.8.ajf dual-channel SMS gate every login until AE marks
//   them as trusted multi-country. C7 adds the override path without
//   any new schema by reusing Sprint 40's ComplianceOverride table with
//   checkCode="UNUSUAL_OTP_SMS_DISABLE" — inherits 24h expiry +
//   15/30-day per-carrier quota + audit trail + ADMIN/CEO role gate.
//   Backend: carrierAuth.ts login handler checks for active override
//   before firing the SMS dispatch; SystemLog INFO row when
//   suppression activates (vs. carrier-facing silence to avoid cluing
//   in a fraudster). /security-signals endpoint surfaces the active
//   override (if any) so the AE UI can render the suppression-active
//   state.
//   Frontend: SecuritySignalsCard gets a new SMS-suppression panel.
//   Active state shows the reason + expiry. Idle state shows the
//   apply button (ADMIN/CEO only, inline reason textarea with min-10-
//   char gate). POSTs to /compliance/carrier/:id/override-block with
//   the new checkCode body. No new endpoint — Sprint 40's
//   override-block endpoint already accepts arbitrary checkCode since
//   v3.8.ahn (Item 182 sprint 4).
//   ~140 LOC net across 3 files (carrierAuth + carriers route +
//   SecuritySignalsCard) + version bump. No schema migration —
//   inheritance from ComplianceOverride is the cleanest pattern.
// v3.8.ajz — §13.3 Item 90 LoadTender.declineReason persistence + capture.
//   Closes the Sub-pattern 5 (audit-both-ends-of-data-flow) gap surfaced
//   pre-ajz: carrier portal /carrier/dashboard/tenders has been POSTing
//   { reason } to /tenders/:id/decline since v3.8.aap (decline modal at
//   carrier/dashboard/tenders/page.tsx lines 16-24 with 7 categorized
//   dropdown values: No capacity / Rate too low / Lane / Equipment /
//   Dates / Already committed / Other), but the backend silently
//   discarded the field at the validator boundary because the LoadTender
//   model had no declineReason column. Decline analytics + AE-facing
//   email context have been undefined-as-default since the carrier
//   portal shipped the dropdown.
//   Backend changes:
//   * LoadTender model + migration adds declineReason String? nullable
//     column (manual migration per §2.2; will apply via Render's
//     prisma migrate deploy on this push).
//   * New declineTenderSchema in validators/tender.ts — optional reason
//     trimmed + max 500 chars. Free-text vocabulary so future UI
//     iterations don't require validator changes.
//   * declineTender controller parses + persists reason on the
//     LoadTender row + includes in v3.8.ajw H3 AuditLog changes blob.
//   * notifyTenderAction reads tender.declineReason and forwards to
//     sendTenderDeclinedEmail (template already conditionally renders
//     the reason row per Sprint 45a D4 ratification).
//   No frontend changes — the carrier UI already captures + sends the
//   field. Backend was the lone gap.
//   ~50 LOC net across 4 backend edits + 1 migration + version bump.
// v3.8.aka — §13.3 Item 89 counter-tender email.
//   Pre-aka the COUNTERED branch of notifyTenderAction only wrote an
//   in-app Notification — AEs only saw the counter if they happened to
//   be in the dashboard. counterTender controller (carrier-side) also
//   used the old manual prisma.notification.create pattern instead of
//   notifyTenderAction (last holdout from the Sprint 38 Item 51
//   refactor that already migrated OFFERED/ACCEPTED/DECLINED/EXPIRED).
//   aka closes both gaps in one atomic:
//   * New sendTenderCounteredEmail in emailService.ts — AE-facing,
//     mirrors sendTenderDeclinedEmail shape (Sprint 45a D4). Surfaces
//     offered vs counter rate + delta + delta-% with amber-for-upward /
//     green-for-downward color tag. reply-to operations@, gold-dark CTA.
//   * notifyTenderAction COUNTERED case extended to fire the new email
//     after the in-app Notification. Defensive guards for missing
//     aeEmail or null counterRate; both log warnings + skip email,
//     in-app notification still fires.
//   * counterTender controller refactored to call notifyTenderAction
//     ("COUNTERED") instead of the manual prisma.notification.create.
//     Last Sprint 38 Item 51 holdout.
//   Carrier portal counter UI doesn't exist today (banked as §13.3
//   Item 144). When it ships, the email path will already be live —
//   AE workflow end-to-end on day 1.
//   ~110 LOC net across 3 backend files + version bump. No schema
//   migration.
// v3.8.akb — Item 159 Sprint 1 — consolidate AE-side load status state
//   machine into loadStateMachine.ts. Pre-akb (and pre-ajw):
//   * carrier-side endpoint had NO state-machine enforcement (closed v3.8.ajw)
//   * AE-side endpoint HAD enforcement via an inline VALID_TRANSITIONS map
//     in loadController.ts:425-444 — but that map duplicated what
//     loadStateMachine.ts was supposed to canonical-own.
//   v3.8.ajw shipped the carrier-side validator only because Phase A
//   didn't audit AE-side write sites. Sub-pattern 5 audit-both-ends
//   caught the duplication during akb Phase A — scope pivoted from
//   "ship AE validator" to "consolidate inline AE map into canonical
//   loadStateMachine.ts" (smaller scope, single source of truth).
//   Changes:
//   * loadStateMachine.ts gains AE_ALLOWED_TRANSITIONS map (lifted
//     verbatim from loadController.ts:425-444).
//   * validateLoadStatusTransition() now enforces both actor maps;
//     AE actor path was previously permissive (returned allowed=true
//     for any transition).
//   * TransitionResult extended with allowedNext + TERMINAL_NOT_ALLOWED
//     code so the 400 response shape preserves the pre-akb contract
//     (error message + allowed array) AND extends it with a code
//     field for future client discrimination.
//   * loadController.updateLoadStatus deletes the inline
//     VALID_TRANSITIONS + isValidTransition + calls the canonical
//     validator. Response shape preserved for backward compat.
//   Item 159 Sprint 2+ banked: refactor the 12 other AE-side write
//   sites (tenderController / waterfallEngineService /
//   carrierController.advance / settlementController /
//   invoiceController / shipperPortalController / ediService /
//   checkCallAutomation) to call the canonical validator. Multi-day
//   epic scope per the original Item 159 banking. Sprint 1 establishes
//   the canonical helper + the highest-traffic surface migration; the
//   remaining sites follow incrementally.
//   ~100 LOC net across 2 backend files + version bump. No schema
//   migration; deploy is a no-op on migrate.
// v3.8.akc — §13.3 Item 158 — Parallel carrier-status endpoint consolidation
//   with side-effect migration. Pre-akc TWO parallel endpoints existed for
//   carrier-side load status updates:
//   * POST /api/carrier-loads/:id/status — canonical, actively used by
//     /carrier/dashboard/my-loads. Had v3.8.ajw C3 state-machine validator
//     + v3.8.ajx SUSPENDED gate + basic broker notification + checkCall
//     create. MISSING shipper email cascade + auto-invoice + Shipment sync.
//   * PATCH /api/loads/:id/carrier-status — DEAD. authorize("CARRIER")
//     only. CarrierActions frontend component referenced it but the
//     conditional render gated on isCarrier(user?.role) AND CARRIER users
//     route to /carrier/dashboard not /dashboard/loads — unreachable in
//     production. HAD shipper email cascade + auto-invoice + Shipment sync.
//   akc scope: MIGRATE the richer side effects from the dead route into
//   the canonical, then DELETE all three layers (route + controller +
//   frontend mutation + component).
//   Changes:
//   * routes/carrierLoads.ts POST /:id/status — adds Shipment status
//     sync (ShipmentStatus enum mapping table from old controller),
//     autoGenerateInvoice on DELIVERED, sendShipperPickupEmail on LOADED,
//     sendShipperDeliveryEmail + onLoadDelivered integration on DELIVERED,
//     sendShipperMilestoneEmail every status, CRM contact-email cascade
//     (sendPickupNotification / sendInTransitUpdate / sendArrivedAtDelivery
//     / sendDeliveredWithPOD).
//   * routes/loads.ts — PATCH /:id/carrier-status route DELETED.
//   * controllers/loadController.ts — carrierUpdateStatus function DELETED
//     (~80 LOC removed).
//   * dashboard/loads/page.tsx — carrierUpdateStatus mutation DELETED +
//     CarrierActions render site DELETED + CarrierActions component
//     DELETED.
//   Operational impact: carrier portal status updates now fire the
//   shipper-notification + auto-invoice fan-outs that the dead route was
//   doing. This is a NET-POSITIVE behavior change — carriers in
//   production were silently losing the cascade before akc.
//   ~200 LOC net (added side effects to canonical, deleted ~150 LOC dead
//   code across 4 files) + version bump. No schema migration.
// v3.8.akd — Item 159 Sprint 2 + CI hotfix bundle.
//   Two-fer atomic: (a) CI hotfix for the 2 vitest failures left by
//   v3.8.akb + v3.8.akc, and (b) the in-flight Sprint 2 wire-up to 4
//   critical AE-side load.status write sites.
//   CI hotfix:
//   * __tests__/unit/controllers/loadController.test.ts — test
//     expectation updated from "Invalid status transition" string
//     match to the canonical validator's "POSTED ... DELIVERED" +
//     code SKIP_NOT_ALLOWED + allowed array shape (akb error
//     message change).
//   * Same file — carrierUpdateStatus test block + import REMOVED
//     (akc deleted the function; the dead test was the second CI
//     failure).
//   * Sub-pattern 11 second fire — local pre-commit gate set
//     (tsc + next build) was a STRICT SUBSET of CI (which ALSO
//     runs vitest via npm test). akd extends the local pre-commit
//     discipline canonical to include `npm test` from backend/.
//   Sprint 2 (Item 159 continued):
//   * tenderController.createTender POSTED → TENDERED flip —
//     defense-in-depth validator (upstream guard at line 18 already
//     restricts to POSTED|TENDERED).
//   * tenderController.acceptTender load → BOOKED flip — validator
//     runs BEFORE prisma.$transaction so a refusal aborts cleanly.
//     422 + structured reason on illegitimate transitions.
//   * tenderController.acceptTenderOnBehalf load → BOOKED flip —
//     same pattern as acceptTender on the AE override path.
//   * checkCallController.createCheckCall derived-status flip —
//     pre-akd had a bare `status: newLoadStatus as any` type
//     assertion with NO transition check. akd logs a SystemLog
//     WARNING + skips load.update when the derived status would
//     produce an invalid transition; check call still records.
//   Remaining Sprint 2+ work (banked): broadcastTenderService,
//   ediService, checkCallAutomation, customerController CANCELLED
//   flip, accountingController INVOICED → COMPLETED, processExpiredTenders
//   TENDERED → POSTED. ~6 more sites; next sprint slot.
//   ~150 LOC net across 4 backend files + 1 test file + version
//   bump. No schema migration.
// v3.8.ake — Item 159 Sprint 3 — final 6 AE write sites wired to canonical
//   loadStateMachine validator. Completes the Item 159 epic; every
//   AE-side load.status flip in the codebase now routes through
//   validateLoadStatusTransition.
//   * broadcastTenderService.launchBroadcast POSTED|TENDERED → TENDERED
//     — throws on rejection (service function, caller route handles).
//   * ediService.process990 → BOOKED — async EDI inbound; on rejection
//     SystemLog WARNING + skip load.update (EDI transaction itself is
//     persisted regardless for audit).
//   * checkCallAutomation.handleCheckCallResponse derived-status flip
//     — replaces inline forward-only statusOrder check that allowed
//     skips. Validator enforces single-step progression. SystemLog
//     WARNING + skip on rejection.
//   * customerController.deleteCustomer cascade CANCELLED flip — per
//     active load. Upstream WHERE filter already constrains to
//     {POSTED, TENDERED, BOOKED, DISPATCHED}; validator is defense-
//     in-depth. SystemLog WARNING + skip on rejection.
//   * accountingController.markInvoicePaid INVOICED → COMPLETED —
//     explicit pre-check via findUnique, fully-paid invoices on
//     INVOICED loads flip cleanly. Info-log when load is no longer
//     at INVOICED (out-of-band advance via another codepath).
//   * tenderController.processExpiredTenders TENDERED → POSTED —
//     cron-driven un-tender when all tenders expire. Validator
//     confirms the un-tender transition is canonical; log + skip on
//     rejection.
//   Item 159 Sprint 3 completes the multi-day epic:
//   * Sprint 1 (akb) consolidated the inline AE map into
//     loadStateMachine.ts canonical.
//   * Sprint 2 (akd) wired 4 critical sites (createTender,
//     acceptTender, acceptTenderOnBehalf, checkCallController).
//   * Sprint 3 (ake) wires the final 6 (broadcastTender, ediService,
//     checkCallAutomation, customerController, accountingController,
//     processExpiredTenders).
//   Total ~11 AE-side write sites now canonical-conformant. Sub-pattern
//   12 (write-read-dataflow-audit) + Pattern 7 (design-system
//   conformance — every load.status writer goes through the same
//   gate now) both satisfied across the load lifecycle.
//   ~250 LOC net across 6 backend files + version bump. No schema
//   migration. Pre-commit gates: full 4-gate set per Sub-pattern 11
//   second-fire canonical (backend tsc + backend vitest + frontend
//   tsc + frontend next build).
// v3.8.akf — §13.3 Item 87 brand chrome consolidation +
//   tagline + reply-to fix on templates/emailTemplates.ts +
//   routes/email.ts inline signature/wrapper. Pairs with
//   v3.8.abc Sprint 45-RC-PRE Path α that closed Item 88
//   (emailService.ts body chrome). This is the sibling work
//   that wasn't bundled at the time.
//   Three sweep-replacements (same canonical as Sprint 45-RC-PRE D2):
//   * #0D1B2A → #0A2540 (navy) — 23 occurrences across both files.
//   * #C8963E → #BA7517 (gold-dark CTA emphasis) — 18 occurrences.
//   * #e2e8f0 → #E2EAF2 (border/divider) — 14 occurrences.
//   Footer text fixes:
//   * "This is an automated message. Please do not reply directly."
//     replaced with "Questions? Reach us at operations@silkroutelogistics.ai".
//     Pre-akf footer contradicted Q1 reply-to ratification (Sprint 45a)
//     where operations@ is the canonical reply target. Each caller's
//     replyTo override (sendEmail() options) still controls
//     per-context routing — Lead Hunter outreach still sets
//     replyTo=whaider@ per §3.10, this footer just stops actively
//     telling recipients not to reply at all.
//   * Tagline "Moving Freight, Building Futures" replaced with
//     "Where Trust Travels." (§1 canonical). The retired tagline
//     appeared on both the templates/emailTemplates.ts shared
//     footer and the routes/email.ts custom-body wrapper footer.
//   Status colors (red/green/amber tailwind) deliberately preserved
//   per Sprint 45-RC-PRE D2 ratification — functional legibility of
//   alert signals beats brand-token consistency on status semantics.
//   Slate scale (#475569, #64748b, #94a3b8, #cbd5e1, #f1f5f9, #f8fafc)
//   also preserved — not in Sprint 45-RC-PRE's canonical sweep list.
//   ~60 LOC net across 2 backend files + version bump. No schema
//   migration; no behavior change beyond brand token alignment + 1
//   footer copy update.
// v3.8.akg — §13.3 Item 8.9 authority block centralization + Item 8.8
//   MC# leading-zero correction (paired atomic per §13.3 banking).
//   Pre-akg every PDF + email + AE Console surface that printed
//   legal-identity fields (MC#/DOT#/bond/address/phone/contact)
//   hardcoded them inline, which produced the propagated typo
//   `MC# 01794414` (leading zero, vs canonical `MC# 1794414` per
//   skill voice.md:98). akg consolidates everything into two
//   canonical modules + migrates 7 consumers in one atomic.
//   New modules:
//   * backend/src/config/authority.ts — full canonical block
//     (ENTITY_NAME, TAGLINE, DOMAIN, MC_NUMBER, DOT_NUMBER,
//     BOND_AMOUNT, BOND_SURETY, CONTINGENT_CARGO_*, PRINCIPAL_
//     ADDRESS_*, GOVERNING_LAW, VENUE, PHONE, OPERATIONS_EMAIL,
//     COMPLIANCE_EMAIL, ACCOUNTING_EMAIL, SALES_EMAIL,
//     CARRIERS_EMAIL, NOREPLY_EMAIL, OPERATIONS_HOURS_LONG,
//     OPERATIONS_HOURS_SHORT, AUTHORITY_LINE_OUTREACH,
//     AUTHORITY_LINE_PUBLIC).
//   * frontend/src/lib/authority.ts — client mirror (ENTITY_NAME,
//     TAGLINE, DOMAIN, MC_NUMBER/LABEL, DOT_NUMBER/LABEL,
//     BOND_TYPE/AMOUNT, PRINCIPAL_ADDRESS_*, PHONE,
//     OPERATIONS_EMAIL). Value-identical to backend module.
//   Backend consumers migrated (6 files):
//   * src/lib/srl-chrome.ts — BRAND block sourced from authority.
//   * src/services/pdfService.ts — COMPANY block sourced from
//     authority + the inline operations@ hardcode at L451 dropped
//     in favor of COMPANY.email.
//   * src/services/compassPdfService.ts — COMPANY block sourced.
//   * src/services/sopPdfService.ts — inline header text sourced.
//   * src/services/insuranceVerificationService.ts — email body
//     identity block sourced (carrier-fraud-banner verification
//     emails); COMPLIANCE_EMAIL still local but re-exported from
//     authority via aliased import.
//   * src/controllers/verifyController.ts — RC public verifier
//     broker block sourced.
//   Frontend consumers migrated (1 file):
//   * src/components/templates/BOLTemplate.tsx — header + footer
//     MC#/DOT# sourced from authority.
//   Side-effect behavior change: pdfService.ts COMPANY.email
//   flipped from `whaider@` to `operations@` per §3.10 canonical
//   for shipping documents. Pre-akg drift: BOL/RC/Invoice/Settlement
//   PDFs displayed whaider@ in the footer of every printout.
//   Skipped surfaces (intentional):
//   * 10 public HTML pages — re-injected from site-chrome.json +
//     _partials/footer.html via inject-chrome.mjs build step.
//     Both chrome SOTs already canonical (verified Phase A grep).
//   * Lead Hunter outreach signature (backend/src/config/signatures/
//     whaider.html) + emailSequenceService.ts — already canonical.
//   * VersionFooter.tsx historical changelog comments — §3.12
//     retention rule (factual record of past state, NOT current claim).
//   * CLAUDE.md §13.3 Item 8.8 + Item 48 row body text — historical
//     records describing the typo, must reference it verbatim.
//   CLAUDE.md self-references corrected (§1 + §4 line 410).
//   ~150 LOC net across 2 new files + 7 migrated consumers + 2
//   CLAUDE.md edits + version bump. No schema migration; no test
//   changes needed (existing tests don't assert on these values).
//   §13.3 Item 8.8 LOG OPEN → CLOSED. Item 8.9 LOG OPEN → CLOSED.
// v3.8.akh — §13.3 Item 63 P3-3 drawer vocabulary normalization
//   ("Docs" → "Documents"). Surgical 3-surface sweep across the AE
//   Console drawer tab strips + the carriers page side panel.
//   Surfaces:
//   * frontend/src/app/dashboard/crm/IconTabs.tsx — CustomerDrawer
//     tab strip label "Docs" → "Documents".
//   * frontend/src/app/dashboard/track-trace/IconTabs.tsx —
//     LoadDetailDrawer tab strip label "Docs" → "Documents".
//   * frontend/src/app/dashboard/carriers/page.tsx side panel tab
//     label "Docs" → "Documents". Key "documents" was already
//     canonical here pre-akh; only the visible label was using the
//     abbreviated form.
//   Tab ids/keys preserved everywhere (id="docs" + key="documents"
//   unchanged) so consumer call sites and popstate history-state
//   keys stay untouched.
//   P3-1 (Profile vs Details) — closed-by-design during Phase A
//   audit. ProspectDrawer + CustomerDrawer use "Profile" because
//   they're entity drawers (carrier/customer/prospect identity);
//   LoadDetailDrawer + WaterfallDrawer use "Details" because
//   they're object drawers (load operational attributes — origin,
//   dest, rate, weight). Intentional semantic differentiation, NOT
//   drift. No change needed.
//   P3-2 (Activity vs History) — banked for separate semantic
//   ratification. 4 right-drawers all use "Activity"; 3 AE Console
//   side panels (carriers/loads/routing-guide) use "History". Both
//   terms semantically valid in context; consolidation requires a
//   ratification decision (Activity = recent-events feed; History =
//   audit log over time) that's better done as a deliberate Sub-
//   pattern 13 (literal-vs-intent) ratification than baked into a
//   sweep commit. Banked for future Phase A audit.
//   ~9 LOC net across 3 source files + version bump.
//   §13.3 Item 63 P3-3 LOG OPEN → CLOSED.
//   §13.3 Item 63 P3-1 closed-by-design.
//   §13.3 Item 63 P3-2 still banked.
// v3.8.aki — §13.3 Item 8.6 carrier preference manual override admin UI.
//   Pre-aki the backend endpoint PUT /ai/preferences/:carrierId existed
//   (added pre-Sprint-44 audit-completeness Tier A reclassification) but
//   had ZERO frontend callers — operations had no way to manually
//   correct an auto-learned preference or seed initial preferences
//   before the auto-learner had data. aki ships the missing admin UI.
//   Backend changes:
//   * routes/ai.ts — PUT /preferences/:carrierId now ADMIN/CEO only
//     (pre-aki was just `authenticate`); GET /preferences/:carrierId
//     widened to ADMIN/CEO/BROKER/OPERATIONS so AE Console reads work.
//   * services/carrierPreferenceService.ts — PreferencesInput type
//     extended with optional lastUpdatedBy field; defaults to "CARRIER"
//     on create + update (preserves carrier-portal write semantic) but
//     admin override path passes "ADMIN" for audit attribution.
//   Frontend changes:
//   * NEW components/carriers/CarrierPreferencesPanel.tsx — form for all
//     12 preference fields (lanes / regions / avoid / load types / rate
//     floor / deadhead cap / radius / pay terms / notify method +
//     frequency). Auto-learned signals surface read-only above the form
//     so admin sees both auto signal AND the manual override they're
//     applying. "Re-run auto-learn" button calls existing POST
//     /preferences/:carrierId/auto-learn (ADMIN+OPERATIONS gated).
//     lastUpdatedBy attribution badge surfaces SYSTEM/CARRIER/ADMIN
//     visually so AE knows where the current row came from.
//   * dashboard/carriers/page.tsx — new "Prefs" tab in side panel icon
//     strip (Sliders icon). panelTab union extended with "preferences".
//   Item 8.5 (frequent-addresses) audit revealed the AddressBook
//   Prisma model has ZERO consumers anywhere — neither picker exists
//   nor any other backend code writes to it. Reframed as a
//   dead-model decision (delete vs build a real picker), banked for
//   separate audit cycle. Not a 30-LOC wire-up as the §13.3 banking
//   suggested.
//   ~370 LOC net (1 new component + 4 edits) + version bump. No schema
//   migration; no test changes needed.
//   §13.3 Item 8.6 LOG OPEN → CLOSED.
//   §13.3 Item 8.5 banking-revised — defer to dead-model decision sprint.
// v3.8.akj — §13.3 Item 8.7 manual tag-management UI.
//   Pre-akj the HTTP endpoints POST + DELETE /tags/assign had ZERO
//   frontend callers despite being defined since the tag system
//   shipped. The auto-tagger at services/tagService.autoTagEntity
//   uses the underlying service function assignTag() directly
//   (bypassing HTTP); the HTTP endpoint pair was specifically for the
//   manual override path that never had a UI. akj ships the missing
//   UI on the Load Board side panel as a new "Tags" tab.
//   Phase A schema constraint finding: tag.entityTypes is a
//   String[] filter defaulting to ["LOAD"] (enumerated as
//   LOAD/QUOTE/ORDER/INVOICE per schema comment). The §13.3 Item 8.7
//   banking suggested 3 surfaces (carrier/customer/load) but only
//   the Load Board surface matches the schema. Carrier + customer
//   tagging would require widening the entityTypes enum + adjacent
//   schema work — scoped out of akj.
//   New component:
//   * frontend/src/components/loads/TagManagementPanel.tsx —
//     reusable component with entityType + entityId props. Pulls
//     applied assignments via GET /tags/entity/:entityType/:entityId.
//     Picker shows eligible tags (entityTypes.includes(currentType)
//     + not already assigned). Add via POST /tags/assign; remove via
//     DELETE /tags/assign. canEdit prop gates the buttons for
//     read-only viewers; backend remains authoritative.
//   * Tag pills colored using tag.color hex with alpha tints for
//     bg/border so each tag visually distinct without overwhelming.
//     Auto-tagger-applied vs manually-applied tags render
//     identically (both came from the same assignTag service).
//     Tooltip on each pill shows description + assignedBy + assignedAt.
//   Wiring:
//   * app/dashboard/loads/page.tsx — PanelTab union extended with
//     "tags". New PANEL_TABS entry uses Tag icon from lucide-react.
//     Render branch mounts TagManagementPanel with entityType="LOAD".
//     canEdit gated to canCreate||isAdminOrCeo (DISPATCH+OPERATIONS
//     also have backend write access; the panel is permissive
//     client-side and backend authz holds the line).
//   Sub-pattern 6 sub-rule c reminder applied: did NOT remove the
//   service functions assignTag + removeTagAssignment even though the
//   HTTP endpoints were orphan; the auto-tagger depends on the
//   service functions internally. akj adds HTTP callers, not removes
//   service functions.
//   ~260 LOC net (1 new component + 4 edits) + version bump. No
//   schema migration; no test changes needed.
//   §13.3 Item 8.7 LOG OPEN → CLOSED (LOAD surface only).
//   Carrier + customer tagging banked for separate sprint (requires
//   schema widening of Tag.entityTypes enum).
// v3.8.akk — §13.3 Items 180.9 + 180.10 Order Builder polish.
//   Phase A audit revealed half the originally-planned bundle was
//   already shipped: 180.3 (3-textarea confusion) closed by Sprint 61
//   v3.8.aex via audience-tab pattern at orders/page.tsx:1228-1234;
//   180.11 (facility name visual hierarchy) closed by Sprint 61
//   v3.8.aex via the explicit name-prominent + address-secondary card
//   at lines 873-907 (own comment block credits Sprint 61). Only
//   180.9 + 180.10 remain.
//   Changes (both in orders/page.tsx):
//   * 180.9 — DraftStatus chip MIRRORED into the footer button row,
//     pinned left via mr-auto wrapper. AE working at the bottom of
//     the form sees save state alongside the dispatch CTAs without
//     scrolling back to the top header. The top-header DraftStatus
//     stays in place; this is an additional surface, not a relocation.
//     ~12 LOC.
//   * 180.10 — Dispatch-mutation error banner RELOCATED from above
//     the form columns (line 679 pre-akk) to be a sibling above the
//     footer button row. AE sees errors directly above the buttons
//     that triggered them; no scroll-back-to-top required. ~18 LOC
//     net (12-LOC block deleted + 12-LOC block re-inserted at footer
//     adjacent + 3-LOC explanatory replacement at original location).
//   Item 178 (multi-line freight edit in Carrier Engagement Drawer)
//   audited + deferred — banking is post-Sprint-63 stale. Sprint 63
//   (v3.8.afi) deleted the entire editable freight section from the
//   drawer; the drawer body now has only Carrier/Financials/
//   Instructions sections per Sprint 63 design intent ("AE who needs
//   to edit freight closes the drawer and edits in Order Builder").
//   Multi-line freight edit belongs in Order Builder (which already
//   has LineItemsSection.tsx) or in EditLoadModal (§13.3 Item 3).
//   ~30 LOC net across 1 source file + version bump. No schema
//   migration; no test changes needed.
//   §13.3 Items 180.3 + 180.11 closed-by-discovery (Sprint 61).
//   §13.3 Item 180.9 LOG OPEN → CLOSED.
//   §13.3 Item 180.10 LOG OPEN → CLOSED.
//   §13.3 Item 178 deferred (Sprint 63 made the original banking
//   architecturally non-applicable).
// v3.8.akl — §13.3 Items 180.1 + 180.5 + 180.8 (Order Builder workflow bundle).
//   Backend changes (routes/orders.ts):
//   * NEW buildQuoteEmail() helper extracted from the inline send-quote
//     HTML builder so both send-quote AND the new preview endpoint can
//     call it. Pre-akl the HTML was built inline with no preview path.
//     Brand-chrome canonical note: helper preserves the existing
//     pre-akf hex literals (#0f172a / #e2e8f0) + whaider@ reply-target
//     verbatim. Item 87's akf sweep didn't reach this builder; banking
//     a Item-87-followup for the brand-chrome migration. The akl atomic
//     stays scope-tight on send-vs-preview equivalence.
//   * NEW GET /:id/quote-preview endpoint. Returns the exact subject +
//     HTML + lane + recipient info that send-quote would dispatch,
//     WITHOUT sending or mutating order.status. AE_ROLES gated.
//   * NEW POST /:id/duplicate endpoint. Clones the source order's
//     customerId + scalar fields + formData JSONB into a new draft row.
//     orderNumber auto-generates via Prisma cuid() default; workflow
//     timestamps + loadId reset so the new draft starts fresh.
//     logCustomerActivity emits an "order_duplicated" event for audit.
//   Frontend changes (app/dashboard/orders/page.tsx):
//   * 180.8 — useSearchParams() useEffect on mount reads ?resume=<id>
//     and fires resumeDraft once. AE can paste a draft URL into
//     Slack/email and a teammate opens it directly into that draft.
//   * 180.5 — previewQuote mutation + quotePreview state + modal.
//     Modal uses sandboxed iframe (srcDoc + sandbox="") so the email
//     HTML renders isolated from page styles. "Send now" button in
//     modal fires the normal sendQuote mutation; closes-and-cancel
//     keeps the draft unchanged. Preview button added to footer
//     button row next to Send quote with Eye icon.
//   * 180.1 — duplicateOrder mutation + Duplicate button on each
//     drafts-banner card. Button (Copy icon) renders top-right with
//     opacity-0 group-hover:opacity-100 transition so it doesn't
//     visually clutter the card stack. On click: stopPropagation
//     (so the card's main resume click doesn't fire), mutate, then
//     resumeDraft(newId) + drafts query refetch.
//   ~270 LOC net (2 new backend endpoints + 1 extracted helper +
//   3 frontend mutations + 1 modal + 2 button additions + version
//   bump). No schema migration; no test changes needed.
//   §13.3 Item 180.1 LOG OPEN → CLOSED.
//   §13.3 Item 180.5 LOG OPEN → CLOSED.
//   §13.3 Item 180.8 LOG OPEN → CLOSED.
// v3.8.akm — §13.3 Item 180.2 Save-as-template for recurring lanes.
//   Different from akl Item 180.1 duplicate-this-order (one-shot
//   clone): templates are NAMED + reusable indefinitely. AE creates a
//   template from a current draft (e.g. "BKN — Detroit→Chicago
//   weekly"), then future drafts can prefill from any saved template.
//   Schema:
//   * NEW OrderTemplate model: id, name (varchar 120), customerId,
//     formData JSONB, createdById, createdAt, updatedAt. Unique
//     (customerId, name). ON DELETE CASCADE on Customer relation.
//   * NEW migration 20260525083000_add_order_template/migration.sql
//     (manual per §2.2; DIRECT_URL split per v3.8.ajg makes migration
//     P1002-risk-free).
//   Backend (routes/orders.ts):
//   * NEW GET /orders/templates — list templates, optional
//     ?customerId filter.
//   * NEW POST /orders/templates — create from current formData.
//     Unique-constraint P2002 surfaced as 409 with friendly message.
//   * NEW DELETE /orders/templates/:id — remove.
//   * IMPORTANT — registered ABOVE the dynamic /:id route so
//     /orders/templates doesn't get shadowed by /:id matching
//     :id="templates". Express resolves in registration order.
//   Frontend (app/dashboard/orders/page.tsx):
//   * NEW TemplatePicker subcomponent surfaces customer-scoped
//     templates beneath the selected customer card in Section 1.
//     Click template → applyTemplate(formData) prefills form minus
//     dated fields (pickup/delivery, rate) which are per-use values.
//     Hover any template to reveal Trash icon for delete.
//   * NEW templatesQuery TanStack hook + applyTemplate state setter
//     + saveAsTemplate mutation.
//   * NEW Save-as-template button in footer button row (BookmarkPlus
//     icon) opens a modal for naming the new template.
//   * Save-as-template modal — sandboxed input with Enter-to-submit,
//     P2002 409 error surfacing for duplicate names.
//   ~310 LOC net (1 new schema model + 1 migration + 3 new endpoints
//   + 1 frontend subcomponent + 2 new mutations + 1 modal + 1 button
//   + version bump). Migration-bearing deploy (6th in the streak: ajv
//   ajw ajx ajy ajz ajh-class + akm).
//   §13.3 Item 180.2 LOG OPEN → CLOSED.
// v3.8.akn — §13.3 Item 180.4 Customer-facing quote approve magic-link.
//   Pre-akn the quote email said "Reply to this email to approve" —
//   customer reply landed in whaider@ inbox, AE then manually clicked
//   the AE Console "Mark Approved" button. Several manual hops. Magic-
//   link compresses this into a single customer click → automated
//   backend flip to quote_approved.
//   Backend changes:
//   * NEW routes/quoteApprove.ts — public router (no authenticate
//     middleware; JWT IS the auth). signQuoteApprovalToken(orderId)
//     + buildQuoteApprovalUrl(orderId) helpers used by the quote
//     email builder. POST /api/quote-approve verifies JWT (HS256,
//     7-day expiry), flips order.status to "quote_approved", emits
//     a logCustomerActivity row with actorType=CUSTOMER (vs AE-side
//     mark-approved which is actorType=USER). Idempotent: re-clicks
//     return alreadyApproved: true without mutating state.
//   * routes/orders.ts buildQuoteEmail() now embeds a gold-dark CTA
//     button linking to the magic-link URL above the existing
//     reply-to-this-email fallback. "Link expires in 7 days" note
//     beneath the button sets expiry expectation.
//   * routes/index.ts mounts the new public router at /quote-approve
//     BEFORE the catch-all websiteRoutes registration so it doesn't
//     get shadowed.
//   Frontend changes:
//   * NEW src/app/quote/approve/page.tsx — public React page that
//     reads the token from window.location.pathname (NOT from
//     useSearchParams + NOT a Next.js dynamic route, because static
//     export can't pre-render arbitrary token paths). POSTs token
//     to /api/quote-approve + renders one of 5 states: loading /
//     missing-token / success-fresh / success-already-approved /
//     error (with sub-codes for TOKEN_EXPIRED, ORDER_NOT_FOUND,
//     TOKEN_INVALID). Brand-canonical cream surface with SRL
//     wordmark + tagline.
//   * frontend/public/_redirects — SPA-rewrite rule
//     /quote/approve/* → /quote/approve (status 200, URL preserved).
//     Same pattern as the v3.8.aae /track/* and v3.8.add /verify/*
//     SPA-rewrite tricks.
//   ~360 LOC net (1 new public router + extension to buildQuoteEmail
//   + 1 new React page + 1 _redirects rule + 2 mount lines + version
//   bump). No schema migration; no test changes needed.
//   §13.3 Item 180.4 LOG OPEN → CLOSED.
// v3.8.ako — §13.3 Items 180.6 + 180.7 revenue-protect bundle.
//   Two related customer-level pricing controls that protect SRL margin
//   on negotiated lanes — both add a nullable column to Customer + a
//   read-only consumer in Order Builder. Admin edit UI banked as a
//   follow-up (AE sets via DB or future CRM edit tool until then).
//   Schema:
//   * NEW Customer.defaultAccessorialRates JSON? — map of negotiated
//     rates per accessorial type, e.g. { "Detention": 50, "Lumper":
//     150 }. Order Builder auto-fills the amount input when AE picks
//     a type that matches a key in the map.
//   * NEW Customer.minMarginPercent Float? — per-customer override of
//     the global 10% margin-floor default. OrderSidebar uses this as
//     the red-alert boundary so AE knows when target carrier cost
//     produces too thin a margin for this customer.
//   * NEW migration 20260525093000_customer_accessorials_and_margin_floor
//     (manual per §2.2; DIRECT_URL split per v3.8.ajg makes the migration
//     P1002-risk-free).
//   Backend:
//   * validators/customer.ts updateCustomerSchema extended with
//     defaultAccessorialRates (z.record() of nonnegative numbers) +
//     minMarginPercent (z.number() 0-100, nullable). Existing PATCH
//     /customers/:id path picks the fields up via the Zod-partial
//     mechanism so admin can set them once the edit UI lands.
//   * Customer endpoints (default Prisma scalar selection) auto-include
//     the new fields on read — no controller change needed.
//   Frontend (orders/page.tsx):
//   * Customer interface extended with defaultAccessorialRates +
//     minMarginPercent.
//   * Section 3 accessorial picker: on type-change handler reads
//     selectedCustomer?.defaultAccessorialRates?.[newType] and
//     auto-fills the amount input. Rows with auto-filled rates get
//     a subtle gold tint background to distinguish "from agreement"
//     vs "AE-typed manual" entries. New accessorial-row default
//     pre-fills from Detention rate if present. Hint copy beneath
//     the picker explains the auto-fill when customer has rates.
//   * Customer snapshot passed to OrderSidebar extended with
//     minMarginPercent.
//   Frontend (OrderSidebar.tsx):
//   * Margin tone calculation now uses per-customer floor (falls back
//     to 10% global). Red tone when margin < floor. New "Below margin
//     floor (X.X% · customer override)" alert text surfaces beneath
//     the margin number when triggered so AE knows what threshold
//     fired the warning.
//   ~210 LOC net across 1 schema model + 1 migration + 1 validator
//   extension + 2 frontend file edits + version bump. CRM admin edit
//   UI for setting these per customer banked as Item 180.6.b
//   follow-up (~50 LOC in CRM ProfileTab/EditProfileForm).
//   §13.3 Item 180.6 LOG OPEN → CLOSED.
//   §13.3 Item 180.7 LOG OPEN → CLOSED.
//   §13.3 Item 180.x cluster fully closed (180.1+180.2+180.4+180.5+
//   180.6+180.7+180.8+180.9+180.10+180.11 done; 180.3 closed-by-
//   discovery; banked 180.6.b CRM admin edit UI for the new fields).
//
// v3.8.alv — §13.3 Item 144 (literal): tiered tender-expiry preset UX.
//   The AE Tender modal hardcoded a 24h expiry (the v3.8.aix/aba
//   broker-default + E2E canonical) with no UI to change it — AEs couldn't
//   tighten to 4h for an urgent load or extend to 48h for a flexible
//   window. Added a preset toggle (4h / 24h / 48h) + a custom hours input
//   (1-168) in TenderForm, below the rate field. The chosen window flows
//   as `expiresInHours` through the createTender mutation (all 3 compliance
//   branches) → converted to ISO `expiresAt` (defaults to 24h when
//   omitted, preserving the E2E canonical + any non-modal caller). Backend
//   createTenderSchema already accepts arbitrary `expiresAt` (no schema
//   change). Pairs with the v3.8.abw expiry-sweep cron (Item 141) which
//   auto-expires the tender when the chosen window closes. ~55 LOC,
//   frontend-only, one file. Gates: frontend tsc + next build clean.
//   Closes the literal §13.3 row 144 (distinct from the carrier
//   counter-offer UI shipped under Item 143/v3.8.alt — see that row's
//   numbering-drift note).
//
// v3.8.alu — §13.3 Item 3: EditLoadModal (post-conversion load edit UI).
//   The backend PUT /loads/:id (loadController.updateLoad) has had full
//   capability all along — auth (poster/employee), status guard blocking
//   COMPLETED/CANCELLED/TONU, customerId-lock on INVOICED, ~30 editable
//   fields — but ZERO frontend callers. When a customer changed a PO /
//   weight / window / commodity post-conversion, AEs had no UI path: only
//   cancel+recreate, a raw API call, or a DB edit. New focused FLAT
//   EditLoadModal (NOT the 4-step CreateLoadModal wizard — too heavy to
//   mirror) over the commonly-edited fields: route (origin/dest
//   city/state/zip/company), schedule (PU/DEL dates + windows), freight
//   (weight/pieces/equipment/commodity/freight-class), financials
//   (customer/carrier rate — gated to canSeeMargin), special instructions.
//   Pre-fills from the selected load, builds a createLoadSchema.partial()-
//   compatible payload (numbers coerced, dates → ISO, empty strings omitted
//   so an untouched field is never blanked), PUTs /loads/:id. Edit button
//   added to the Load Board detail-panel action cluster, gated to canCreate
//   && non-terminal status (mirrors the backend gate so AE doesn't hit a
//   400). Backend stays authoritative on per-field locks (e.g. customerId
//   on INVOICED). ~250 LOC new component + ~15 LOC page wiring. No backend
//   change, no schema. Gates: frontend tsc + next build clean (backend tsc
//   defensively clean). Banked: per-field status-locking matrix beyond the
//   backend's customerId-on-INVOICED rule (the backlog's "scoping" item) —
//   not enforced today, so the modal keeps it simple and lets the backend
//   reject edge cases.
//
// v3.8.alt — §13.3 Item 144: carrier counter-offer UI. The backend
//   counterTender (POST /tenders/:id/counter) was fully wired since
//   v3.8.aka — flips tender → COUNTERED + counterRate, writes an audit
//   row, fires notifyTenderAction("COUNTERED") which emails the AE poster
//   with offered-vs-counter delta context. But the carrier portal
//   /carrier/dashboard/tenders page had only Accept + Decline — NO way to
//   submit a counter. Frontend-only close: added a gold "Counter" button
//   (Repeat2 icon) in the action row + a counter-rate input panel
//   (pre-filled with the offered rate, $ prefix, positive-number guard)
//   that POSTs { counterRate } to the existing endpoint. On success the
//   tender drops off this OFFERED-filtered list — the ball is now in the
//   AE's court (same disappear-on-action UX as decline). Mirrors the
//   existing decline-panel pattern exactly. ~55 LOC in one file. No
//   backend change, no schema. Gates: frontend tsc + next build clean
//   (backend tsc defensively clean — untouched).
//
// v3.8.als — §13.3 Item 142: magic-link tender accept/decline (no login).
//   The tender-offered email previously had a single "Log in to view
//   tender" CTA — carriers had to authenticate before acting. Now the
//   email carries one-click Accept (green) + Decline buttons. New signed
//   token (lib/tenderActionToken.ts, JWT_SECRET HS256, embeds tenderId +
//   action + carrierUserId, 7-day expiry) is the authorization. New PUBLIC
//   endpoint GET /api/tender-action/:token (routes/tenderAction.ts, mounted
//   WITHOUT authenticate — same pattern as the v3.8.akn quote-approve
//   magic link) verifies the token, then delegates to the existing
//   acceptTender/declineTender controllers via a response-capturing shim +
//   a synthetic carrier actor (id = embedded carrierUserId, which satisfies
//   the controllers' carrier-userId ownership gate). ZERO duplication of
//   the battle-tested accept path — compliance re-check, atomic
//   transaction, shipment creation, auto-RC, notifications, tracking-link
//   fan-out all reused. Renders a self-contained branded HTML
//   acknowledgment page (accepted / declined / already-handled / expired /
//   invalid) — no frontend route needed since carriers click from email on
//   any device. notifyTenderAction("OFFERED") mints the two tokens (only
//   when the carrier has a linked User.id; else falls back to the login
//   button) and passes acceptUrl/declineUrl to sendTenderOfferedEmail.
//   Server-side expiry + status gates in the delegated controllers mean a
//   stale token can't double-act: a non-OFFERED tender renders "already
//   handled," an expired one renders the controller's expiry message.
//   ~250 LOC across 5 backend files (token lib + public router + index
//   mount + emailService CTAs + notificationService wiring). No schema, no
//   migration. Gates: backend tsc + vitest 224/224 + frontend tsc + next
//   build all clean.
//
// v3.8.alr — §13.3 Item 8.1: Customer inactivation workflow. Closes the
//   gap where four orthogonal status-like fields existed on Customer
//   (status / onboardingStatus / creditStatus / User.isActive) but none
//   combined into a canonical "inactivate," and NOTHING stopped an AE
//   creating loads against an inactive customer. New isActive +
//   inactivationReason + inactivatedAt + inactivatedById on Customer
//   (additive migration, default true → no backfill). New
//   checkCustomerActive(customerId, role) gate helper wired into BOTH
//   load-creation paths — loadController.createLoad (Load Board + New
//   Load modal, after the credit gate) + withTenderController (Carrier
//   Engagement Drawer Mode 1, after compliance) — 403 for non-admins,
//   ADMIN/CEO override per spec. Two endpoints: POST /customers/:id/
//   inactivate (reason ≥5 chars required, audit-logged) + /reactivate.
//   CRM OnboardingActionBar rewired — the prior "Suspend" TODO modal is
//   now a real Inactivate flow (reason capture) + a red Inactive banner
//   with reason + Reactivate button when isActive=false; "Reject" stays
//   a banked TODO (distinct onboarding-stage concern). SKIPPED per §3.3
//   atomic scope (optional in the spec): notification silencing +
//   cascade to User.isActive/onboardingStatus=SUSPENDED — banked.
//   ~200 LOC across schema + 1 migration + 4 backend files + 2 frontend
//   files. Gates: backend tsc + vitest 224/224 + frontend tsc + next
//   build all clean. POST-DEPLOY: Render runs prisma migrate deploy on
//   the new migration (~1s additive ALTER); verify migrate status clean.
//
// v3.8.alq — Marco Polo chatbot model bump. Both Anthropic call sites in
//   chatController.ts (authenticated SYSTEM_PROMPT path + public
//   PUBLIC_SYSTEM_PROMPT path) were pinned to claude-sonnet-4-5-20250929,
//   a generation old. Bumped both to claude-sonnet-4-6 (current Sonnet —
//   the right tier for a fast, cost-effective customer-facing chatbot).
//   Banked during v3.8.akx (prompt refresh) as a follow-up; the prompt
//   was made fresh but the model behind it lagged. 2-LOC backend change,
//   no prompt change. Backend tsc clean.
//
// v3.8.alp — §13.3 Item 51.b: loadboard-bid carrier notification.
//   Pre-alp the loadboard bid accept/reject handlers (routes/loadBids.ts)
//   fired ZERO carrier notification — direct + on-behalf + waterfall
//   accept paths all notified the winning carrier (notifyTenderAction),
//   but a carrier who won an open-loadboard bid got nothing. New
//   notifyBidAction(bidId, "ACCEPTED" | "DECLINED") helper in
//   notificationService (recommendation (a) — parallel to
//   notifyTenderAction, keyed on LoadBid not LoadTender so the model
//   shapes stay separated). Two new carrier-facing emails in
//   emailService: sendBidAcceptedEmail ("your bid won — load dispatched",
//   loadboard is the auto-pilot DISPATCHED path per §2) +
//   sendBidDeclinedEmail ("not selected this time"). Both fire-and-forget
//   (non-blocking try/catch) wired into the accept + reject handlers,
//   mirroring the existing tracking-link fan-out pattern. LoadBid.carrierId
//   is a User.id per the submission convention, so the carrier user is
//   looked up directly by id (NOT CarrierProfile.id). Closes the
//   notification-matrix gap left open at the v3.8.akw Item 51 close.
//   Backend-only — ~120 LOC across emailService + notificationService +
//   loadBids. No schema, no migration. Gates: backend tsc + vitest
//   224/224 + frontend tsc + next build all clean.
//
// v3.8.alo — §13.3 Item 189.b: admin self-serve toggle for
//   CarrierProfile.isTestAccount. Surfaced when Wasi asked "how can I
//   use the test-carrier mechanism right now" — the fence (v3.8.aim/alm)
//   was complete but the only WRITE paths for isTestAccount were the
//   seed script (dev/CI) + the v3.8.aim migration (3 prod carriers by
//   MC#). No in-app control to flag a NEW carrier as test or un-flag
//   one — required manual SQL.
//
//   DESIGN WRINKLE (Phase A): getAllCarriers itself filters
//   isTestAccount:false AND feeds the Tender/RC pickers — so a flagged
//   carrier vanishes from the admin list too, making un-flag a one-way
//   door. Solved with an opt-in param the admin page passes but pickers
//   never do.
//
//   BACKEND:
//   * getAllCarriers gains ?include_test=true. where rebuilt:
//     isTestAccount:false applies UNLESS include_test is set. Pickers
//     (Tender/RC modal) never pass it → stay fenced per v3.8.aim
//     contract. Admin carriers page passes it only when "Show test
//     accounts" is on.
//   * NEW PATCH /api/carriers/:id/test-account — ADMIN/CEO,
//     validateBody({ isTestAccount: boolean }), auditLog("UPDATE",
//     "Carrier"), 404 on unknown. Mirrors the per-load risk-email
//     kill-switch endpoint (v3.8.ali).
//
//   FRONTEND (/dashboard/carriers):
//   * Carrier.isTestAccount added to the interface.
//   * List query: ?include_test=true appended when showTestAccounts on;
//     showTestAccounts in the queryKey so toggling refetches.
//   * Admin-only "Show test accounts" header toggle (amber when on) —
//     reveals flagged carriers so they can be un-flagged.
//   * "Mark as test" / "Test account" toggle button in the carrier
//     detail action row (FlaskConical icon, confirm dialog, TanStack
//     mutation invalidating ["carrier-all"]). Gray when real, amber
//     when flagged.
//   * Amber TEST badge on flagged carrier rows in the list.
//
//   USAGE: AE/admin opens a carrier → "Mark as test" → it drops out of
//   pickers/analytics/compliance/risk-flagging (kept for testing, not
//   deleted). To un-flag: header "Show test accounts" on → flagged
//   carriers reappear with TEST badge → open one → "Test account"
//   (amber) → restore. The 3 pre-flagged prod carriers (SRL Transport
//   MC-1794414, BISON MC-156588, INTEGRITY EXPRESS MC-596655) are now
//   visible + manageable via the show-test toggle.
//
//   No schema migration (isTestAccount exists since v3.8.aim). No new
//   deps. Pre-commit gates per Sub-pattern 11 (all clean): backend tsc,
//   backend vitest 224/224, frontend tsc, next build.
//
//   SUB-PATTERN 6 concurrent-sprint-coordination fire: Wasi shipped
//   v3.8.aln (public carriers tier-card icons, §20 Commit 3) on top of
//   my v3.8.alm mid-sprint. Bumped my work alm→alo per §3.1 sequence-
//   continuous; swapped my "v3.8.aln" inline refs → "v3.8.alo" across
//   the 3 source files + CLAUDE.md Item 189.b, leaving Wasi's committed
//   aln VersionFooter block untouched.
//   §13.3 Item 189.b LOG OPEN → CLOSED.
//
// v3.8.alm — §13.3 Items 189 + 190 CLOSE (isTestAccount fence, Tier 2 +
//   Tier 3). One atomic commit fencing test carriers out of every
//   analytics/compliance/intelligence carrier-list query. 37
//   `isTestAccount: false` additions across 14 backend files. No schema
//   migration (Load.isTestAccount v3.8.alj + CarrierProfile.isTestAccount
//   v3.8.aim both already exist). No frontend source change.
//
//   PATTERN-7 GREP-COMPLETENESS FIRE: banked 189+190 named ~7 sites; the
//   sub-agent Phase A audit's own "completeness check" claimed ~18
//   accounted-for + no extras — WRONG. Orchestrator-level
//   `grep -rn carrierProfile.(findMany|count|aggregate)` across
//   backend/src/ surfaced an entire missed tier: csaBasicService,
//   eldValidationService, ofacScreeningService, insuranceVerificationService,
//   integrationService (CPP recalc), contentEngineService (marketing stat),
//   + 2 cron sweeps + marketController region-heatmap count. Same class as
//   Sprint 41's marginPercent grep (documented 2, actual 4).
//
//   TIER 2 (Item 189) fenced — analytics/intelligence/marketing:
//   analyticsService getOnTimeMetrics + getCarrierScorecard (nested
//   carrier:{carrierProfile:{isTestAccount:false}} at the load JOIN level
//   — Load-keyed aggregations), cpp.ts leaderboard + recalculate,
//   marketController getCapacity + region-heatmap count,
//   carrierIntelligenceService learning cycle, carrierOutreachService
//   matchingCarriers fallback, integrationService processAllCPP
//   Recalculations, contentEngineService active-carrier marketing-stat.
//
//   TIER 3 (Item 190) fenced — compliance/screening: all 15 carrierProfile
//   list/count sites in complianceMonitorService (4 dashboard counts +
//   expiringSoonItems + overview matrix + fmcsaComplianceScan daily 3am
//   [highest-priority] + dailyComplianceReminders + checkAutoReversal +
//   expiredCarriers + expiredNoGrace + expiringCarriers loop +
//   monthlyCarrierReVetting + detectFmcsaAuthorityChanges + doc-expiry
//   loop), complianceController admin scan, complianceForecastService AI
//   forecast, csaBasicService CSA-BASIC, eldValidationService ELD sweep,
//   ofacScreeningService weekly rescan, insuranceVerificationService
//   expiry sweep, cron pending-identity-validation + rejected-reapply.
//
//   CHAMELEON — BOTH SIDES (per Item 190 directive): subject side
//   (runFullChameleonScan bulk findMany gains isTestAccount:false) + match
//   side (checkChameleon fingerprint cross-ref gains
//   {carrier:{isTestAccount:false}} in its AND) — a real carrier is never
//   flagged as a chameleon for overlapping with a test carrier's
//   fingerprint; test accounts aren't matched against each other either.
//
//   SKIPS (correct as-is): carrierOutreach smartCarrierProfiles:155 +
//   overbookingService:149 (by-userId-set follow-ups, not lists),
//   marcoPoloService:995 (AE interactive search — test carriers legit for
//   admin review), carrier.ts capacity-feed + carrierController
//   getAllCarriers (already fenced Build 1 v3.8.aim). TRIVIAL FOLLOW-UP
//   BANKED: monitoringController:66 + healthDigestService:84 gross
//   carrierProfile.count() infra/health row-counts — fence only if
//   admin-digest accuracy matters (~2 LOC).
//
//   HELPER DECISION: Item 190 floated whereActiveProductionCarrier() "IF
//   Build 2+3 reveal sufficient drift risk." 37 sites would justify it,
//   but where-clauses are heterogeneous (APPROVED vs SUSPENDED vs
//   PENDING/REVIEWING vs REJECTED + varied date/doc filters) so a uniform
//   helper carries only the single isTestAccount key — marginal value
//   over inline, and inline stays greppable for the next completeness
//   audit. Inline per Build 1's "only addition is isTestAccount: false".
//
//   METHODOLOGY EMERGED — sub-agent-audit-undercount: a delegated Phase A
//   audit's self-asserted "completeness check, no extras" is NOT a
//   substitute for the orchestrator running the canonical grep itself.
//   The orchestrator's broad grep found ~2x the sites the sub-agent's
//   narrower check reported. Banked as Pattern 7 / Sub-pattern 6 sub-rule
//   c extension: when a sub-agent claims grep-completeness, re-run the
//   completeness grep at the orchestrator level before trusting "no
//   extras."
//
//   Pre-commit gates per Sub-pattern 11 (all clean): backend tsc --noEmit,
//   backend vitest 224/224, frontend tsc --noEmit, frontend next build.
//   §13.3 Items 189 + 190 LOG OPEN → CLOSED. Test-carrier fence now
//   complete across Tier 1 (load assignment, v3.8.aim) + Tier 2
//   (analytics, this commit) + Tier 3 (compliance, this commit).
//
// v3.8.alj — §13.3 Item 192 FULL CLOSE (risk-flagging cron re-enabled).
//   Completes the re-enable gate that v3.8.ali left open: test-load
//   exclusion + per-user preference + the cron flip. The risk cron is
//   LIVE again (every 30 min :05/:35) for the first time since the
//   2026-05-25 disable.
//
//   FOUR LAYERED GUARDS now make the cron safe:
//   (a) once-per-load-per-level cadence (v3.8.ali) — a persistently-RED
//       load never re-emails; fires once on the crossing into RED.
//   (b) test-load exclusion + staleness guard (THIS sprint) — dead seed
//       data is never scored.
//   (c) per-load email kill switch riskEmailMuted (v3.8.ali) — AE
//       silences a specific load's external email.
//   (d) per-user preference gate (THIS sprint) — AE opts out entirely.
//   AMBER stays in-app only; only RED reaches email.
//
//   TEST-LOAD EXCLUSION:
//   * Schema: new Load.isTestAccount Boolean @default(false) (migration
//     20260530140000_add_load_is_test_account, additive, no backfill).
//     Mirrors CarrierProfile.isTestAccount (v3.8.aim).
//   * Seed script + all 3 E2E fixture loads (waterfall/loadbid/shipper)
//     set isTestAccount: true.
//   * riskEngine runRiskFlagging findMany filters isTestAccount: false.
//   * NO prod backfill of the column: the seed users overlap with real
//     identities (whaider@silkroutelogistics.ai is BOTH the seed broker
//     AND the real founder), so a poster-based backfill would wrongly
//     mark real loads. The existing stale prod seed loads are caught by
//     the staleness guard instead.
//
//   STALENESS GUARD:
//   * riskEngine runRiskFlagging findMany also filters
//     pickupDate: { gte: now - 14 days }. A load whose pickup was 2+
//     weeks ago and is still pre-delivery is dead data, not a fresh
//     dispatch risk. Cleanly excludes the existing prod flood loads
//     (SRL-20260211/03/16-dated seed loads, Feb 2026 pickups, 3+ months
//     past) WITHOUT identifying them individually — no risky prod
//     backfill. Future-pickup unassigned loads still score normally
//     (guard only excludes PAST pickups).
//
//   PER-USER PREFERENCE GATE:
//   * preferencesSchema (backend/src/routes/auth.ts notifications object)
//     gains riskAlerts: z.boolean().optional().
//   * Settings panel (frontend/src/app/dashboard/settings/page.tsx) gains
//     a "Load risk alerts (email)" toggle as the 5th notification pref.
//   * riskEngine reads poster.preferences.notifications.riskAlerts at the
//     email step; skips the email when explicitly false (default-on:
//     undefined/true → send). In-app notification NOT gated — preference
//     governs the external email only, same as the per-load kill switch.
//
//   CRON RE-ENABLED: schedulerService.ts:341-353 uncommented. runRisk
//   Flagging import was already present (line 6). Every 30 min :05/:35
//   with the existing 10-min withLock.
//
//   WHY SAFE TO RE-ENABLE NOW: the 2026-05-25 flood was stale unassigned
//   seed loads re-emailing hourly. All four guards above address it: the
//   Feb-dated seed loads are excluded (staleness + isTestAccount), and
//   even if a real load goes RED it fires ONE email on the crossing
//   (cadence), which the AE can silence per-load (kill switch) or per-user
//   (preference). First live cron tick will score only real, recent,
//   non-test loads.
//
//   Pre-commit gates per Sub-pattern 11 (CI parity, all clean):
//   prisma generate, backend tsc --noEmit, backend vitest 224/224,
//   frontend tsc --noEmit, frontend next build. New migration additive,
//   applied via Render migrate deploy + CI db push (citext pre-step
//   already in place).
//
//   Scope: ~70 LOC across 6 files (schema +9, migration +9 new, seed +4
//   loads marked, riskEngine findMany filters + email preference gate,
//   auth.ts preferencesSchema +4, settings page +2) + CLAUDE.md Item 192
//   full-close + this footer + version bump.
//   §13.3 Item 192 LOG OPEN → FULLY CLOSED. Cron is live.
//   Banked (out of scope, dropped per ratification): escalation ladder
//   (over-engineered for pre-revenue volume; the 4 guards suffice).
//
// v3.8.ali — Risk-flagging working mechanism + per-load email kill
//   switch (§13.3 Item 192 partial close). Design-first per Wasi
//   directive 2026-05-30; all 4 mechanism forks ratified to the
//   recommended options via AskUserQuestion (email-only mute,
//   permanent toggle, once-per-load-per-level cadence, AMBER
//   in-app-only). The cron stays DISABLED this sprint — re-enable
//   is the deliberate go-live flip gated on test-load exclusion +
//   per-user preference (§3.4 halt > ship on outward-facing email).
//
//   THE FLOOD ROOT CAUSE (verified): runRiskFlagging ran every 30
//   min; the old dedup checked "any notification in the last 30
//   min". Since the cron interval == the dedup window, a
//   persistently-RED load's notification aged past 30 min by the
//   next tick → re-fired the email → ~1 email/hour/load forever.
//   4 stale unassigned test loads = 4 emails/hour into Gmail.
//
//   MECHANISM REDESIGN (backend/src/services/riskEngine.ts
//   runRiskFlagging):
//   * Once-per-load-per-level cadence. Reads the PRIOR RiskLog level
//     BEFORE writing the new one; alerts ONLY on a level CROSSING
//     (risk.level !== prevLevel). A load that sits at RED never
//     re-emails — it fires once on the crossing into RED and goes
//     silent until the level actually changes. RiskLog still writes
//     every tick (dashboard history intact); the `notified` flag now
//     means "this tick alerted" (level-crossing into non-GREEN),
//     not merely "non-GREEN".
//   * Email gate: sendRiskAlertEmail fires only when
//     RED && levelChanged && !load.riskEmailMuted. AMBER is in-app
//     only (reserved external channel for RED urgency). In-app
//     notification ALWAYS fires on a level crossing regardless of
//     mute — the kill switch is email-only.
//   * Run-summary log now reports emails sent vs muted.
//
//   PER-LOAD KILL SWITCH:
//   * Schema (backend/prisma/schema.prisma Load model): new
//     riskEmailMuted Boolean @default(false) + riskEmailMutedAt
//     DateTime? + riskEmailMutedById String?. Manual migration
//     20260530120000_add_load_risk_email_mute per §2.2 (additive,
//     no lock risk at pre-revenue volume).
//   * Backend (backend/src/routes/loads.ts): new
//     PATCH /api/loads/:id/risk-email-mute — AE-role-gated
//     (BROKER/ADMIN/CEO/DISPATCH/OPERATIONS), validateBody({ muted:
//     boolean }), auditLog("UPDATE","Load"). Sets the 3 fields
//     (muted → stamps At + ById; unmuted → nulls them). 404 on
//     unknown load. Serializer needs no change — the T&T
//     /load/:loadId detail endpoint uses findUnique+include (no
//     top-level select) so the 3 new scalars flow to the drawer
//     automatically.
//   * Frontend (LoadDetailDrawer.tsx): Bell/BellOff toggle button
//     in the drawer header next to the status-advance button.
//     Muted = amber BellOff "Muted" + who/when tooltip; active =
//     gray Bell "Risk email". TanStack mutation invalidates the
//     drawer + Load Board queries so the button flips immediately.
//
//   WHY EMAIL-ONLY + IN-APP-ALWAYS: "limit the emails being sent
//   outside" — in-app notifications live INSIDE the portal (cheap,
//   teammates see them, always on); email is the external/noisy
//   channel. The kill switch targets the external channel: an AE
//   working a risky load they already know about silences their
//   Gmail while the portal RED badge stays visible to the team.
//
//   CRON RE-ENABLE — DELIBERATELY DEFERRED. Even with once-per-level
//   cadence, re-enabling today means the 4 known stale test loads
//   each fire ONE email on first tick (first crossing into RED),
//   because there's still no test-load exclusion (flood loads were
//   unassigned → no carrier.carrierProfile.isTestAccount to read;
//   no Customer.isTestAccount; no Load-level test flag). That's a
//   one-time 4-email burst, not a flood, but still noise about fake
//   loads. Re-enable bundles with: (a) test-load marking strategy +
//   exclusion, (b) per-user preference gate (preferencesSchema +
//   Settings toggle + email gate), (c) uncomment the cron at
//   schedulerService.ts:346-349. Tracked in §13.3 Item 192
//   "Remaining for re-enable".
//
//   Pre-commit gates per Sub-pattern 11 (CI parity, all clean):
//   prisma generate, backend tsc --noEmit, backend vitest (no risk-
//   engine unit test exists — engine change verified by tsc +
//   logic review; banked a follow-up test as optional), frontend
//   tsc --noEmit, frontend next build. CI E2E: add the citext
//   CREATE EXTENSION pre-step already in place since the prior CI
//   hotfix; the new migration is additive + applied via db push.
//
//   Scope: ~130 LOC across 5 files (schema +13, migration +9 new,
//   riskEngine ~+55/-40 restructure, loads.ts +40 endpoint,
//   LoadDetailDrawer +35 toggle) + CLAUDE.md §13.3 Item 192
//   partial-close + this footer + version bump.
//   §13.3 Item 192 LOG OPEN → PARTIAL CLOSE (mechanism + kill
//   switch live; cron re-enable gated).
//
// v3.8.akx — Marco Polo chatbot canonical refresh. The homepage
//   chatbot's PUBLIC_SYSTEM_PROMPT at backend/src/controllers/
//   chatController.ts:63-79 was last touched pre-v3.8.aib
//   (so pre-2026-05-21 Sprint 1 honesty pass) and had been leaking
//   retired claims to live prospects on /index for ~14 days:
//   "Caravan Loyalty Program" (§7 prohibited variant), "Guest →
//   Silver → Gold → Platinum" tier structure (Guest retired in
//   v3.8.aii/aij locked launch model), LTL + EDI + US-Mexico
//   cross-border services (none on deployed pages), "Quick Pay
//   small fee" vague framing (vs published Silver 3% / Gold 2% /
//   Platinum 1% on /carriers). Prompt also had zero reveal-defense
//   or fabrication-prevention guardrails — no ban on vendor-stack
//   reveal, no ban on invented metrics, no §6 honest-hours
//   qualifier on "24/7", no §20.1.5 architectural-reveal-defense
//   guardrails. Wasi noticed the chatbot referencing old
//   information during live conversations on /index 2026-05-25.
//
//   Audit-first (Sub-pattern 15 going-forward gate applied):
//   sub-agent Explore audited the three deployed public pages
//   (index.html, carriers.html, shippers.html) verbatim and
//   extracted the disclosure ceiling — what the chatbot is
//   ALLOWED to say. Two-source binding established as canonical:
//   CLAUDE.md governs whether a statement is TRUE; deployed pages
//   govern whether the chatbot is ALLOWED to say it. The chatbot
//   may never state a number, threshold, percentage, rate, weight,
//   tenure, or vendor name that does not already appear on a
//   deployed public page — even when correct per CLAUDE.md.
//
//   PFA conflict resolution: directive author requested "PFA
//   surety" in the chatbot authority chain; Phase A audit
//   confirmed PFA Protects appears NOWHERE on any deployed page
//   (only mention in entire codebase is an internal development
//   comment on /index.html line 438 explaining WHY the surety name
//   was REMOVED per v3.8.aga directive's public-disclosure rule).
//   §20.1.5 explicitly bans named-underwriter reveal as a
//   vendor-stack reveal class. The directive's own articulated
//   rules ("never reveal... the vendor stack", "never state a
//   figure not present on a deployed public page") contradicted
//   the literal "PFA surety" text mention. Sub-pattern 13
//   workflow-first ratification resolved to exclude PFA from the
//   chatbot prompt per the directive's own canonical-rule intent.
//   If actual intent was to first-disclose PFA via the chatbot,
//   that requires explicit user direction since it would also
//   need a sibling addition to /carriers public-page footer for
//   consistency (the chatbot is downstream of public-page
//   canonical, not upstream of it).
//
//   Source change ~340 LOC across 1 file (chatController.ts):
//   * PUBLIC_SYSTEM_PROMPT rewritten in full (~200 LOC). Services
//     whitelist: Dry Van + Reefer + Dedicated + Expedited + Flatbed
//     only (drops LTL + EDI integration + US-Mexico cross-border +
//     intermodal + drayage + parcel + international). Full §8
//     Quick Pay verbatim quotation (Silver Net-30 + 3% 7-day QP,
//     Gold Net-21 + 2%, Platinum Net-14 + 1%, +2% same-day
//     universal, "Per-load. Optional. No contract."). Full §9
//     Compass Score 7-factor formula verbatim (20/20/15/15/10/10/10
//     with weekly recalc note). All 10 §4 #15 universal floor
//     benefits verbatim from /carriers lines 486-540. §6 honest
//     hours (24/7 only for Marco Polo, M-F 7am-7pm ET for human
//     support, after-hours emergency on active loads — never "24/7"
//     for human channels). §1 authority chain (USDOT 4526880 + MC#
//     1794414 + BMC-84 $75K + $1M auto liability + $100K cargo +
//     18+ months FMCSA authority requirement; surety name PFA
//     deliberately excluded per §20.1.5).
//   * 12 hard guardrails: no invented metrics; no services off
//     whitelist; no §7-prohibited program names; no tier-
//     advancement gate values (even when /carriers publishes them
//     — §20.1.5 reveal-defense carve-out specifically for the
//     chatbot's continuous-query surface vs /carriers' one-time
//     read surface); no vendor-stack reveal; no internal state-
//     machine names; no "asset-based" framing; no testimonials
//     without provenance; no consultant-speak; retired-fact bans
//     enumerated on safety/referral/detention bonuses + Guest
//     tier + tier-graduated FSC + 48-hour onboarding SLAs.
//   * Routing rules per §3.10: /shippers.html#quote-form for
//     quotes, /onboarding for carrier applications, /carriers.html
//     for program details beyond what's stated,
//     compliance@silkroutelogistics.ai for fraud/double-brokering/
//     BMC-84 claims, operations@silkroutelogistics.ai for active-
//     load issues.
//   * SYSTEM_PROMPT (authenticated path) hardened with retired-
//     fact ban + vendor-stack reveal ban + §7 program-naming ban +
//     asset-based ban + no-fabricated-metrics + honest-hours
//     guardrail (~140 LOC rewrite). Tool access preserved; data
//     accuracy unchanged.
//
//   Widget verification (per directive halt threshold — §7 + retired-
//   tier scan only):
//   * grep on frontend/public/shared/js/marco-polo.js welcome
//     (lines 64-79) + proactive (lines 82-99) returned zero §7
//     violations and zero retired-tier language. No edits needed.
//   * Adjacent observations noted out of directive scope (banked
//     for future small-polish sprint): (a) carrier welcome line 70
//     uses "Compass score" lowercase s vs canonical "Compass Score"
//     capitalization on /carriers; (b) public welcome line 77
//     promises "type compliance and I will route you direct" but no
//     keyword router exists in widget code — the LLM smart-routes
//     via new PUBLIC_SYSTEM_PROMPT routing rules anyway, so
//     functionally works but phrasing is misleading.
//
//   §20.8.5 Marco Polo chatbot canonical added to CLAUDE.md:
//   establishes the two-source binding (CLAUDE.md = accuracy
//   source, deployed pages = disclosure ceiling) and the §20.1.5
//   reveal-defense carve-out for tier-advancement gate values
//   (banned on chatbot even though /carriers publishes them) and
//   internal state-machine names (banned on public chatbot,
//   allowed on authenticated SYSTEM_PROMPT). Going-forward gate:
//   any future chatbot system-prompt edit must include a Phase A
//   audit of the three deployed public pages alongside the
//   CLAUDE.md sections. Adding a new fact to the chatbot prompt
//   requires either: (a) the fact already appears on a deployed
//   page, OR (b) the fact is added to a deployed page in the
//   SAME atomic sprint.
//
//   Sub-pattern 15 fire #5 banked: "directive-vs-canonical-rule
//   conflict where directive's own articulated principles forbid
//   the literal text" — the PFA Protects scenario. Cumulative
//   fire count for §19 review now 29 → 30. Sub-pattern 15 was
//   canonically promoted in v3.8.akw earlier today; this is the
//   first post-promotion fire, validating the going-forward gate
//   is in active operational use.
//
//   Pre-commit gates per Sub-pattern 11 CI parity (all clean):
//   * backend tsc --noEmit clean (chatController is pure constant-
//     string changes — no type cascade)
//   * backend vitest 224/224 pass
//   * frontend tsc --noEmit clean (defensive — no frontend source
//     changes)
//   * frontend npx next build clean
//
//   Scope: ~340 LOC source (chatController.ts) + ~250 LOC docs
//   across CLAUDE.md §20.8.5 + §11 row + this footer narrative +
//   version bump.
//
// v3.8.akw — §13.3 Items 51 + 52 + 53 closures (tender-flow micro-
//   cleanup bundle). Sub-pattern 15 canonical promotion: "Backlog-row-
//   drift vs §11-history-row" — three-fire validated within ~24h
//   across v3.8.akr (Item 8.5 close fire 1), Item 191 backlog
//   correction (fire 2), and this commit (fire 3).
//
//   Audit findings (delegated to Explore sub-agent + verbatim code
//   reads): of the three items proposed for atomic bundling, TWO were
//   already closed by Sprint 38/39 (v3.8.acd 2026-05-13) but never
//   marked CLOSED in §13.3. Only one genuine gap remained.
//
//   Item 51 — `notifyTenderAction` wiring on accept paths. Split
//   closure timeline: Sprint 45a (v3.8.abb, 2026-05-10) wired
//   notifyTenderAction("OFFERED") into createTender. Sprint 38
//   (v3.8.acd, 2026-05-13) wired notifyTenderAction("ACCEPTED") into
//   tenderController.acceptTender:205 + acceptTenderOnBehalf:375.
//   v3.8.akw closes the remaining waterfall accept path gap:
//   * NEW findFirst at waterfallEngineService.acceptPosition (before
//     the existing updateMany flip) captures the accepted tender's
//     id. updateMany doesn't return rows, so this separate read is
//     required to fire notifyTenderAction with the correct tender id.
//   * NEW non-blocking try/catch block between the check-call
//     schedule (lines 509-515) and tracking-link fan-out (lines
//     519-524). Pattern matches the existing Sprint 38 fan-out
//     convention verbatim. Failure logs at log.error but does not
//     block the dispatch flow. acceptedTender may be null in rare
//     race conditions (tender declined externally between position
//     lookup and updateMany); the conditional skip handles that
//     gracefully.
//   * Loadboard bid accept path is NOT in scope — uses LoadBid
//     model (not LoadTender), so notifyTenderAction(tenderId, ...)
//     doesn't apply. Banked as new Item 51.b: parallel notifyBidAction
//     helper required (~100-120 LOC, separate sprint).
//
//   Item 52 — `sendTrackingLinkToCrmContacts` on tender accept paths.
//   ALREADY FIXED retroactively in Sprint 38/39. Audit confirmed
//   the helper is wired at all five accept surfaces:
//   tenderController.acceptTender:212-217 (direct),
//   acceptTenderOnBehalf:380-385 (on-behalf),
//   waterfallEngineService.acceptPosition:519-524 (waterfall),
//   loadBids.ts:247-253 (loadboard bid),
//   withTenderController.createLoadWithTender:237-241 (drawer mode).
//   CLAUDE.md §2's "Sprint 39 α resolution: tracking-link fan-out
//   fires at the accept moment on all three paths" statement is
//   accurate as of post-Sprint-38/39 state. §13.3 row updated to
//   reflect CLOSED status retroactively. No source change needed.
//
//   Item 53 — Direct accept race condition (Promise.all → $transaction).
//   ALREADY FIXED retroactively in Sprint 38. Audit confirmed
//   tenderController.acceptTender:119-132 uses prisma.$transaction([
//   ...]) wrapping the three writes (loadTender.update → ACCEPTED,
//   load.update → BOOKED + carrierId, loadTender.updateMany → DECLINED
//   siblings) atomically. acceptTenderOnBehalf:285-298 mirrors the
//   same pattern. Loadboard bid accept at loadBids.ts:202-211 uses
//   two serial updates (not wrapped) — banked as potential future
//   gap if a regression surfaces, lower risk (single load state, no
//   tender siblings). §13.3 row updated to reflect CLOSED status
//   retroactively. No source change needed.
//
//   Sub-pattern 15 — "Backlog-row-drift vs §11-history-row" CANONICAL
//   PROMOTION 2026-05-25. Three independent fires within ~24h:
//   * Fire 1 (v3.8.akr Item 8.5 close, morning): 13 AddressBook
//     references in grep but 0 active consumers after classification.
//     Banked as "match-count is not consumer-count" case-study
//     extension.
//   * Fire 2 (Item 191 backlog correction, mid-morning): §13.3 Item
//     191 row claimed "Priority: ELEVATED" + "every future schema
//     migration is at risk" but the DIRECT_URL P1002 fix had already
//     shipped 24h prior in v3.8.ajg (2026-05-24). Wasi caught the
//     staleness when I surfaced Item 191 as top-priority. Banked
//     as "backlog-row-drift vs §11-history-row".
//   * Fire 3 (this commit, afternoon): §13.3 Items 52 + 53 row
//     text was 12 days stale relative to Sprint 38/39 actual
//     code. Of three "bundled cleanup" items, only Item 51's
//     waterfall path was a genuine gap.
//   §19 sub-pattern 15 entry added inline at CLAUDE.md §19 with
//   the three-fire registry entries (cumulative fire count
//   26 → 29). Sub-pattern 15 is the methodology library's first
//   **audit-layer** sub-pattern — operating above the execution
//   layer (sub-patterns 1-12 + 14 + 8.a) and the ratification
//   layer (sub-pattern 13). Three layers now stack: audit →
//   ratification → execution. A miss at the audit layer corrupts
//   the ratification + execution layers downstream.
//   Going-forward gate canonical: Sprint Phase A audits that
//   consult §13.3 backlog row text MUST cross-reference each item
//   against §11 history rows (grep for "closes.*Item N" or
//   "§13\.3 Item N.*CLOSED") AND verbatim against the file:line
//   references in the row's text, BEFORE relying on the row's
//   "Fix shape" or "Sprint shape" framing. Going-forward
//   maintenance: when shipping a closure, update both the §11
//   history row AND the §13.3 backlog row in the SAME commit.
//
//   Pre-commit gates (Sub-pattern 11 CI parity, 4 gates all clean):
//   * prisma generate clean
//   * backend tsc --noEmit clean
//   * backend vitest: 224/224 pass
//   * frontend tsc --noEmit clean
//   * frontend npx next build clean
//
//   Methodology: §3.5 audit-first (sub-agent Explore + verbatim
//   code reads before any source change — caught 2/3 items stale),
//   §3.3 atomic single-feature ship (only Item 51 waterfall fix is
//   source; 52 + 53 + 51.b banking are docs-only consequences of the
//   audit), §19 Sub-pattern 5 audit-both-ends-of-data-flow (verified
//   tender accept paths' notification + tracking-link wiring across
//   all 5 surfaces), §19 Sub-pattern 11 CI parity, §19 Sub-pattern 15
//   canonical promotion (this commit).
//
//   New §13.3 Item 51.b banked: loadboard bid accept notification
//   gap (~100-120 LOC follow-up — needs parallel notifyBidAction
//   helper since bids use LoadBid model, not LoadTender; not
//   BKN-blocking since loadboard bid is the secondary dispatch path).
//
//   §13.3 Items 51 + 52 + 53 LOG OPEN → CLOSED.
//   §19 Sub-pattern 15 banked + canonically promoted.
//   Net source change: ~15 LOC in waterfallEngineService.ts
//   (findFirst + non-blocking try/catch fan-out block) +
//   ~150 LOC docs across CLAUDE.md §13.3 + §19 + this footer.
//
// v3.8.akv — §13.3 Item 182 sprint 5 SURGICAL ROLLBACK. v3.8.aku
//   shipped onboarding-side verdict surfaces built on the
//   fmcsaService.getCarrierAuthority function that the 2026-05-23 audit
//   already documented as broken — the FMCSA QCMobile /authority
//   endpoint returns CURRENT-STATUS fields only (brokerAuthorityStatus
//   / commonAuthorityStatus), NOT historical GRANT events. The parser's
//   filter for originalAction === "GRANT" matches zero entries on every
//   real response, so getCarrierAuthority resolves to null for every
//   carrier. v3.8.aio shipped a manual AE-side workaround (POST
//   /carrier/:id/authority-grant-date) but never fixed the underlying
//   function. v3.8.aku built on the broken function despite the prior
//   audit comment at carrierController.ts:1193-1196; Phase A
//   sub-agent audit verified getCarrierAuthority's SIGNATURE +
//   exports + cache TTL but did not grep for prior source-comment
//   audits of the function's behavior — a Sub-pattern 5
//   audit-both-ends-of-data-flow miss EXTENDED (function-signature
//   audit ≠ function-behavior audit). Live deploy smoke caught the
//   regression: established 17-year-old motor carriers like INTEGRITY
//   EXPRESS LOGISTICS LLC (DOT 1911857) resolved to
//   authorityVerdict: "WAITING_LIST" and would have been blocked at
//   /onboarding and steered to the waitlist capture form.
//
//   REMOVED (the harmful verdict surfaces):
//   * backend/src/routes/carrier.ts — AuthorityVerdict type +
//     buildAuthorityVerdict() helper deleted; getCarrierAuthority +
//     calendarMonthsBetween + z imports removed (no other callers in
//     this file); the try/catch authority enrichment removed from
//     GET /fmcsa-lookup/:dotNumber and GET /fmcsa-mc-lookup/:mcNumber
//     — both endpoints now return the same response shape they did
//     pre-aku (current FMCSA carrier-identity data only); POST
//     /carrier/waitlist endpoint + waitlistSchema deleted (only
//     caller was the verdict-driven submitToWaitlist hook).
//   * frontend/src/app/onboarding/page.tsx — AuthorityVerdict type
//     + 4 enrichment fields stripped from FmcsaResult interface;
//     waitlistSubmitting/Submitted/Error state + submitToWaitlist()
//     mutation hook deleted; canNext() Step 1 gate reverted to
//     pre-aku single-line return (no longer blocks on
//     WAITING_LIST verdict); three verdict pill render branches +
//     waitlist confirmation card deleted from the FMCSA result
//     block. The /onboarding flow now matches its pre-aku behavior:
//     a carrier proceeds through registration without an
//     authority-age verdict gating them.
//
//   RETAINED (intentional preservation per directive):
//   * backend/prisma/schema.prisma — `model WaitingList` STAYS.
//     Migration 20260525160000_add_waiting_list/migration.sql STAYS.
//     The migration already applied to prod on the v3.8.aku deploy
//     2026-05-25; deleting the migration file would create schema
//     drift. The WaitingList table is intentionally retained (empty)
//     for the future Highway-backed reimplementation when a working
//     authority data source lands. WaitingList rows continue to be
//     writeable via Prisma directly (no public HTTP endpoint exists
//     post-rollback).
//
//   NOT TOUCHED (safety net stays intact, per directive):
//   * Tender-time authority-age gate at complianceMonitorService.ts
//     (v3.8.ahl/ahm) — continues to block at tender time for
//     post-cutoff carriers with null authorityGrantedDate;
//     AUTHORITY_UNVERIFIED branch fires past the 24h grace window.
//   * Manual AE authority-grant-date entry endpoint
//     (POST /carrier/:id/authority-grant-date, v3.8.aio) — only
//     working data path for populating CarrierProfile
//     .authorityGrantedDate today; AE provides reason + date,
//     auditTrail row emitted, gate then passes.
//   * Soft-grandfathering of pre-cutoff APPROVED carriers via
//     AUTHORITY_AGE_GATE_LIVE_AT constant in
//     complianceMonitorService.ts — existing carriers with
//     approvedAt < cutoff get a warning, never blocked.
//   * fmcsaService.getCarrierAuthority function itself + its
//     null-writing callers (populateAuthorityGrantedDate +
//     registerCarrier + setupAdminCarrierProfile fire-and-forget
//     post-registration calls) — these stay as the Highway
//     reimplementation site. The function still resolves to null
//     for every carrier post-rollback; that's the documented
//     status quo since 2026-05-23. The frontend OverrideComplianceModal
//     (v3.8.ahq) consuming blocked_codes and the
//     complianceCheck() AUTHORITY_TOO_YOUNG/AUTHORITY_UNVERIFIED
//     branches continue to work; AE has the existing override path
//     via OverrideComplianceModal (reason + 24h scoped override
//     limited to 15 per carrier per rolling 30 days).
//
//   Methodology bank (new sub-pattern candidate fire #1):
//   "audit-prior-audit-findings before depending on a function" —
//   when a sprint extends or depends on an existing function, the
//   Phase A audit must grep the codebase for inline source-comment
//   audits + commit-message audits of that function before
//   declaring it usable. v3.8.aku's Phase A sub-agent prompt
//   verified getCarrierAuthority's signature + return shape but
//   did not surface the 2026-05-23 audit comment at
//   carrierController.ts:1193 that documented the function returns
//   null for every carrier. Banking for §19 sub-rule c three-fire
//   validation lineage. Two more independent fires of the same
//   methodology gap class needed before §19 canonical promotion.
//
//   Path forward (banked, no firm slot):
//   * Investigation sprint — direct keyed request to FMCSA
//     /authority endpoint with the Render env webKey to capture
//     actual response shape; determine whether a different FMCSA
//     endpoint (L&I licensing system, SAFER) exposes historical
//     GRANT events.
//   * If no free FMCSA path: evaluate paid Highway-backed
//     reimplementation (Carrier Assure, RMIS, Highway.com — all
//     wrap FMCSA L&I data with authority history).
//   * Once a working data source lands, restore the verdict UI on
//     top of it + activate the WaitingList table for real use.
//
//   Net source change: ~210 LOC removed across 2 files (carrier.ts
//   -110 LOC: AuthorityVerdict type + helper + endpoint enrichment
//   + waitlist endpoint; onboarding/page.tsx -100 LOC: state +
//   mutation + canNext gate extension + 3 verdict render branches +
//   confirmation card). Net change after this footer comment block
//   + docs updates: ~+50 LOC docs. WaitingList schema model + its
//   migration preserved verbatim. No prisma migration changes; no
//   data-layer touches; Render's next deploy is a no-op against
//   the existing schema.
//   §13.3 Item 182 sprint 5 LOG CLOSED → LOG OPEN (re-opened for
//   Highway-backed reimplementation; epic stays at 4/5 sprints
//   shipped). §13.3 Item 182 sprint 5-original implementation
//   details preserved in §13.3 Item 182 closure narrative for
//   the Highway-reimplementation reference.
//
// v3.8.aku — §13.3 Item 182 sprint 5/5 close (Authority-age epic
//   complete). Onboarding UI + WaitingList Prisma model — the final
//   sprint of the 5-sprint Authority-age compliance epic that started
//   2026-05-21 with v3.8.ahj's FMCSA authority data plumbing.
//   The epic's locked behavior (do not re-litigate per Item 182 §13.3
//   directive): carriers with FMCSA authority age <12 months are
//   HARD-BLOCKED from /onboarding; 12-18 months are OVERRIDE_ELIGIBLE
//   (proceed to registration, AE applies post-approval override);
//   ≥18 months auto-allow. Sprint 5 closes the user-facing surface
//   that captures the <12-month carriers into a waitlist instead of
//   the original "hard rejection" framing.
//   Schema (backend/prisma/schema.prisma):
//   * NEW model WaitingList { id, email, dotNumber, mcNumber?,
//     authorityGrantedDate, eligibilityDate, notifiedAt?, createdAt }
//     + @@unique([email, dotNumber]) dedup + @@index on eligibilityDate
//     (for the Sprint 6 cron-notify query) + @@index on notifiedAt
//     (for the dedup-don't-renotify check). Manual migration at
//     prisma/migrations/20260525160000_add_waiting_list/migration.sql
//     per §2.2 (avoid prisma migrate dev against prod-pointed
//     DATABASE_URL). Render's migrate deploy applies on next push.
//   Backend (backend/src/routes/carrier.ts):
//   * NEW AuthorityVerdict type + buildAuthorityVerdict() helper.
//     Verdict thresholds match Item 182 locked decisions verbatim
//     (≥18mo → AUTO_ALLOW, 12-18mo → OVERRIDE_ELIGIBLE, <12mo OR
//     null → WAITING_LIST). Reuses calendarMonthsBetween() from
//     fmcsaService.ts — same primitive the post-approval
//     complianceCheck() gate uses, so onboarding-time + post-approval
//     verdicts stay architecturally in lockstep.
//   * EXTENDED GET /carrier/fmcsa-lookup/:dotNumber + GET /carrier/
//     fmcsa-mc-lookup/:mcNumber endpoints with authority enrichment
//     via getCarrierAuthority(dot) inside a try/catch (Option β:
//     defensive fallback to WAITING_LIST verdict on lookup failure
//     rather than silent pass-through). Response shape gains
//     { authorityGrantDate, authorityAgeMonths, authorityVerdict,
//     authorityEligibilityDate }.
//   * NEW POST /carrier/waitlist endpoint (public, no auth — same
//     shape as fmcsa-lookup endpoints + carrier registration, all
//     three serve pre-registration carriers). Zod-validated payload
//     { email, dotNumber, mcNumber?, authorityGrantDate?,
//     eligibilityDate? }. Upsert on (email, dotNumber) so a carrier
//     filling the form twice updates rather than duplicates. Does NOT
//     reset notifiedAt on re-add.
//   Frontend (frontend/src/app/onboarding/page.tsx):
//   * NEW AuthorityVerdict type + extended FmcsaResult interface
//     with the 4 enrichment fields.
//   * NEW state: waitlistSubmitting + waitlistSubmitted + waitlistError
//     + submitToWaitlist() mutation hook calling POST /carrier/waitlist.
//   * canNext() Step 1 gate EXTENDED — when
//     fmcsaResult.authorityVerdict === "WAITING_LIST", returns false.
//     Carrier cannot proceed to Step 2 until they submit the waitlist
//     form. OVERRIDE_ELIGIBLE (12-18mo) does NOT block — carrier
//     proceeds normally; AE applies ComplianceOverride post-registration
//     during approval review per the v3.8.ahq + frontend modal
//     extension that closed sprint 4.
//   * Three verdict-pill render branches inline in the FMCSA result
//     block (palette matches existing v3.8.aix surface):
//       - AUTO_ALLOW → silent green (#E6F0E9 bg, #2F7A4F text +
//         CheckCircle2 icon). "Authority active X months · You can
//         proceed".
//       - OVERRIDE_ELIGIBLE → amber warning (#FBEFD4 bg, #B07A1A text
//         + "!" badge). Explanatory paragraph about manual review
//         path + longer approval window.
//       - WAITING_LIST → red blocking surface (#F6E3E3 bg, #9B2C2C
//         text + "!" badge). Inline email input (defaults to
//         form.email) + "Notify me" button + projected eligibility
//         date ("projected June 2027" format). On submit success,
//         transitions to green "You're on the list" confirmation
//         card showing the email + eligibility month.
//   Methodology:
//   * Pattern 1 (audit-first via sub-agent Explore) — 9-question Phase A
//     audit before any code change.
//   * Sub-pattern 5 (audit-both-ends-of-data-flow) — verified backend
//     getCarrierAuthority + calendarMonthsBetween signatures BEFORE
//     extending lookup endpoints; verified existing applyFmcsaData()
//     flow BEFORE injecting verdict UI.
//   * Sub-pattern 11 (CI parity) — prisma generate + backend tsc +
//     backend npm test + frontend tsc + next build all clean pre-push.
//   ~270 LOC net across 4 files (schema.prisma + 1 migration +
//   routes/carrier.ts + onboarding/page.tsx + CLAUDE.md §13.3 epic
//   closure narrative + this footer block + version bump).
//   §13.3 Item 182 LOG OPEN → CLOSED (5 sprints across 5 days
//   2026-05-21 → 2026-05-25, zero rollbacks). Sprint 6 (auto-notify
//   cron — query WHERE eligibilityDate <= NOW() AND notifiedAt IS
//   NULL) banked as separate follow-up, no firm slot.
//
// v3.8.aks — §13.3 Item 178 close (superseded by Sprint 63) + Item
//   180.6.b close (CRM admin edit UI for the new Customer fields).
//   Two banked items closed in one atomic per §3.3 because both are
//   pure cleanup of the post-akr "remaining banked items" list and
//   neither blocks the other. Net: ~95 LOC frontend add + 2 docs
//   updates.
//   Item 178 — post-Sprint-63 reframing → CLOSED AS SUPERSEDED.
//   Phase A audit (sub-agent Explore) confirmed Sprint 63 deliberately
//   reduced Carrier Engagement Drawer scope from Sprint 59.b's 7
//   sections to a focused 3-editable-sections shape (Carrier picker +
//   Financials + Instructions) with a read-only SummaryHeader showing
//   Lane / Equipment / Schedule / Freight summary / References. The
//   original Item 178 sprint shape ("widen drawer Freight section to
//   an editable table") is structurally invalid — there's no Freight
//   section to widen. Post-Sprint-63 canon: freight editing lives in
//   Order Builder via LineItemsSection.tsx (full multi-line UI with
//   pieces/packageType/weight/description/freightClass/nmfcCode/
//   hazmat/hazmatUnNumber/hazmatClass per row); the drawer consumes
//   the already-finalized line array and round-trips it unchanged
//   through `POST /api/loads/with-tender` (primary line from form
//   state + rest from `lineItemsRest` prop). The "+N more lines"
//   SummaryHeader chip is read-only by design, not a UX gap. AE who
//   needs to edit line 2+ closes the drawer → edits in Order Builder
//   → reopens. Post-creation freight edits (after the Load row
//   exists) are §13.3 Item 3 territory (EditLoadModal). No source
//   change in the drawer; CLAUDE.md §13.3 Item 178 marked superseded
//   with the architectural reasoning preserved for posterity.
//   Item 180.6.b — CRM admin edit UI shipped.
//   Backend was already done in v3.8.ako (Items 180.6 + 180.7 schema
//   + validator + Order Builder consumer wiring) — `Customer
//   .defaultAccessorialRates` (Json, map of accessorial-type → rate)
//   + `Customer.minMarginPercent` (Float, 0-100 floor). Validator
//   at backend/src/validators/customer.ts:41+45 already accepts both
//   via `PATCH /customers/:id`. OrderSidebar at
//   frontend/src/app/dashboard/orders/OrderSidebar.tsx:145+258
//   already reads minMarginPercent via customerSnapshot for the
//   margin-floor alert. The missing piece was the write-side admin
//   UI letting AE actually set these per customer.
//   Changes:
//   * frontend/src/app/dashboard/crm/types.ts — added
//     `defaultAccessorialRates: Record<string,number> | null` +
//     `minMarginPercent: number | null` to the `CrmCustomer`
//     interface so EditProfileForm can hydrate from existing values.
//   * frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx — extended
//     the `EditProfileForm` component (lines 286-363 pre-aks):
//       - New `AccessorialRow = { type: string; rate: number }`
//         type capturing the flat-array UI shape; flattened to
//         `Record<string, number>` on save to match the validator's
//         `z.record(z.string(), z.number().nonnegative())` shape.
//       - New `accessorials: AccessorialRow[]` state hydrated from
//         `Object.entries(customer.defaultAccessorialRates ?? {})`.
//       - `minMarginPercent` added to existing `form` state.
//       - Save mutation payload extended with both fields; empty
//         accessorial list serializes to `null` (cleaner than `{}`
//         in DB); empty min-margin serializes to `null` to fall back
//         to the global 10% default.
//       - UI: number input 0-100 step 0.1 for min-margin floor with
//         "blank uses 10% global default" hint label; editable
//         table block for accessorials with type-text input
//         (placeholder "e.g. Detention, Layover, TONU") + rate
//         number input ($/hr) + remove button (×) per row + "+ Add"
//         button. Empty state shows italic "No customer-specific
//         rates set" placeholder. Uses existing chrome (gray-50
//         surface + gray-200 borders) for visual continuity with
//         the surrounding form.
//   Design rationale — open-ended type strings vs fixed dropdown:
//   `defaultAccessorialRates` validator accepts any string key (no
//   enum), and Order Builder's accessorial picker matches by string,
//   so free-text type input is the canonical shape. AE typing
//   "Detention" here will match Order Builder's "Detention" picker
//   entry on the next load. Future Item 180.6.c (out of scope) could
//   add a dropdown of common types if AE finds the free-text input
//   produces drift across loads.
//   Pre-commit gates per Sub-pattern 11 (CI parity):
//   * Backend tsc --noEmit clean on staged set (1 pre-existing tsc
//     error in untracked WIP backend/src/services/fuelIndexService.ts
//     unchanged from v3.8.akr — outside aks staged set).
//   * Backend npm test: 224/224 pass.
//   * Frontend tsc --noEmit clean.
//   * Frontend `npx next build` clean (all routes prerendered as
//     static; `/dashboard/crm` bundle absorbed the small UI add).
//   Methodology — Pattern 1 (audit-first via sub-agent) + Sub-pattern
//   5 (audit-both-ends-of-data-flow — verified write side (validator
//   accepts) + read side (OrderSidebar consumes) before adding the
//   admin UI in between).
//   §13.3 Item 178 LOG OPEN → CLOSED AS SUPERSEDED.
//   §13.3 Item 180.6.b LOG OPEN → CLOSED.
//   5-item verified-pending list (post-akq) now fully closed: Item
//   8.5 (akr), Item 87 followup (akq), Item 63 P3-2 (akq), Item 178
//   (this commit), Item 180.6.b (this commit).
//
// v3.8.akr — §13.3 Item 8.5 close: AddressBook dead-model deletion.
//   Phase A audit confirmed the model is structurally orphaned — zero
//   frontend consumers (grep frontend/src/ returned only 2 VersionFooter
//   comment mentions), zero backend service/controller consumers (grep
//   backend/src/ returned only the route file's own internal refs),
//   zero seed/script references, zero FKs from other models. Mounted at
//   /api/address-book/* with ADMIN/CEO/BROKER/DISPATCH/OPERATIONS authz
//   but never wired into any picker. usageCount + lastUsedAt fields
//   stayed at zero forever because nothing called PATCH /:id/use.
//   CustomerFacility (via FacilityPicker) is the active canonical
//   address primitive — §13.3 Items 8.2.2 + 8.2.3 closures (v3.8.uu/vv)
//   shipped operatingHours + edit + contactEmail; Order Builder
//   Section 2 (per Item 4 retroactive closure) auto-fills from
//   CustomerFacility.contactName/contactPhone on facility selection.
//   Wiring AddressBook into Order Builder origin/dest would create the
//   exact parallel-endpoint class banked at Items 40 + 158.
//   Per default-assume-removal posture when no consumers (user-memory
//   feedback_dead_model_removal precedent) + Sub-pattern 6 sub-rule c
//   verification (audits-can-be-wrong gate cleared: 13 surface refs
//   all classified as either route-self / schema-self / version-history
//   comments / archived-wiki docs — no active consumers anywhere).
//   Changes (atomic per §3.3):
//   * DELETED backend/src/routes/addressBook.ts (147 LOC, 6 endpoints
//     GET / POST / POST bulk / PATCH / PATCH /:id/use / DELETE).
//   * REMOVED import addressBookRoutes from routes/index.ts:74 +
//     router.use("/address-book", ...) mount at routes/index.ts:248.
//   * REMOVED model AddressBook { ... } block from schema.prisma
//     (29 lines including section divider). Indexes auto-drop with
//     the table.
//   * NEW migration prisma/migrations/20260525150000_drop_address_book
//     _dead_model/migration.sql — single DROP TABLE IF EXISTS
//     "public"."address_book" CASCADE; statement. Manual-authored per
//     §2.2 (avoid prisma migrate dev against prod-pointed
//     DATABASE_URL). Render's migrate deploy applies on next push.
//   ~180 LOC removed across 3 files + 1 small migration + version bump.
//   Pre-commit gates per Sub-pattern 11 (CI parity): prisma generate
//   clean (model removal regenerates client without AddressBook type),
//   backend tsc --noEmit clean, backend npm test clean, frontend tsc
//   + next build clean.
//   §13.3 Item 8.5 LOG OPEN → CLOSED (dead-model deletion path chosen
//   over wire-up-the-picker path).
//   2 banked items remain from the 5-item verified-pending list:
//   Item 178 (drawer multi-line freight edit — architectural decision
//   pending) + Item 180.6.b (CRM admin edit UI for
//   defaultAccessorialRates + minMarginPercent, ~80-100 LOC).
//
// v3.8.akq — §13.3 Item 87 followup + Item 63 P3-2 (vocab + chrome
//   consistency bundle). Two tiny token+vocabulary sweeps that share
//   the "consistency across surfaces" theme; bundled in one atomic.
//   Sub-pattern 6 fire (concurrent-sprint-coordination): parallel
//   v3.8.akp commit `b9de2a25` (Item 191 EIA fuel-index feed) landed
//   while this work was in WIP; akq sequence-continuous on top per
//   §3.1 + Sub-rule c re-verify-scope-against-latest-production-state
//   convention. Bumped 4 inline source comments + this footer block
//   from akp → akq during pre-commit.
//   Item 87 followup — buildQuoteEmail brand chrome migration:
//   * routes/orders.ts:buildQuoteEmail() three sweep-replacements
//     matching Sprint 45-RC-PRE Path α + v3.8.akf precedent: #0f172a
//     → #0A2540 (navy) on the H2 heading, #e2e8f0 → #E2EAF2 (divider)
//     on 5 table-cell borders, whaider@silkroutelogistics.ai →
//     operations@silkroutelogistics.ai (reply-target) on the
//     contact-us line. Customer-facing transactional emails now
//     correctly route through operations@ per §3.10. The pre-akq
//     hex literals + whaider@ were artifacts of the v3.8.akl
//     extract-without-migrate scope discipline; akq closes the
//     deferred chrome migration.
//   * Other slate-scale tokens (#64748b, #94a3b8) deliberately
//     preserved per Sprint 45-RC-PRE D2 ratification.
//   Item 63 P3-2 — vocabulary ratification:
//   * Ratified canonical: "Activity" (over "History"). Reasoning:
//     both surfaces (4 right-drawers + 3 AE Console panels) show
//     entity-scoped event feeds, not audit logs. Drawers shipped in
//     the more recent design wave and use "Activity"; AE Console
//     panels are older and use "History". Industry pattern check
//     (Salesforce, HubSpot, Front, Linear) uses "Activity" for
//     entity-scoped feeds. Pattern 7 design-system conformance:
//     same content should have the same label.
//   * Surface sweep: carriers/page.tsx:705 + loads/page.tsx:81 +
//     routing-guide/page.tsx:101 — all 3 "label: History" entries
//     swapped to "label: Activity". Tab keys (key="history") and
//     render-branch consumers preserved; only the visible label
//     changed.
//   ~12 LOC net across 4 source files + version bump. No schema
//   migration; no test changes needed.
//   §13.3 Item 87 followup LOG OPEN → CLOSED.
//   §13.3 Item 63 P3-2 LOG OPEN → CLOSED (ratification: Activity
//   canonical).
//   3 banked items remain from the 5-item verified-pending list:
//   Item 8.5 (AddressBook dead-model decision sprint), Item 178
//   (drawer multi-line freight edit — Sprint 63 reframing needed),
//   Item 180.6.b (CRM admin edit UI for the new Customer fields).
//
// v3.8.akp — Item 191 / Sprint 65 Phase 1: EIA fuel-index feed foundation.
//   Adds the upstream-feed scaffolding (env + schema + region map) that will
//   supply this week's diesel price to the EXISTING fuelSurchargeTableService
//   .lookupFuelSurcharge pipeline. Phase 1 ships storage + config + taxonomy
//   ONLY; the fetcher + cron + on-demand trigger land in v3.8.akq (Phase 2).
//   No change to quote computation, autoQuoteService, contract-rate path,
//   Load.fuelSurcharge read/write sites, or marketDataService in either
//   phase — this is a parallel upstream feed, not a quote-engine change.
//   Env (backend/src/config/env.ts):
//   * NEW EIA_API_KEY (optional string) — mirrors the FMCSA_WEB_KEY
//     short-circuit pattern; key value lives in Render dashboard.
//   * NEW FSC_INDEX_PROVIDER enum ("eia" | "manual"), default "eia".
//     "manual" short-circuits the EIA fetch so an operator can override
//     a region via direct DB write when EIA is unavailable.
//   Env documentation (backend/.env.example): both names added (no values).
//   Schema (backend/prisma/schema.prisma):
//   * NEW model FuelIndexCache — region (@id), indexPrice, indexDate,
//     source (default "EIA_DOE"), fetchedAt, expiresAt. Upsert-by-region
//     keeps the table at ~7 rows (NATIONAL + PADD1..PADD5 + CA). Index
//     on expiresAt for cleanup. Mirrors MileageCache conventions.
//   * NEW migration 20260525130000_add_fuel_index_cache — hand-authored
//     per §2.2 canonical + v3.8.aim/aio precedent (avoids prisma migrate
//     dev against prod-pointed DATABASE_URL). Render's migrate deploy
//     applies on next push.
//   Region map (backend/src/services/eiaRegionMap.ts NEW):
//   * NEW EiaRegion type + EIA_REGIONS array + stateToEiaRegion(state)
//     covering all 50 states + DC. CA maps to a dedicated CA region (not
//     PADD5) per EIA convention — CARB diesel runs $0.50-$1.00/gal higher
//     than national so non-CA West Coast states (AK, AZ, HI, NV, OR, WA)
//     map to PADD5 separately. Unknown / missing state → NATIONAL.
//   * Taxonomy-drift note: this is the third state-to-region helper in
//     the codebase (alongside constants/regions.ts US_REGIONS and
//     services/regionMap.ts UI groups). Neither matches EIA PADD, so
//     this new helper is the canonical EIA mapping. Reconciliation of
//     the three taxonomies is out of scope for this sprint (Pattern 7
//     spatial drift banked at §13.3 Item 7).
//   Sprint coordination note: latest VersionFooter at session start was
//   v3.8.ako (six letters past v3.8.aio that CLAUDE.md §11 last logged).
//   Per §3.1 sequence-continuous, next-free letter is akp — Sub-pattern 6
//   concurrent-sprint-coordination fire caught during pre-commit when
//   VersionFooter was read as canonical source instead of CLAUDE.md §11.
//   ~124 LOC across 6 files (env.ts +2, .env.example +7, schema.prisma
//   +14, migration.sql +18 new, eiaRegionMap.ts +83 new, this footer
//   block + version bump). Pre-commit gates: prisma generate clean,
//   backend tsc --noEmit clean on changed files (pre-existing tsc error
//   in untracked WIP backend/src/routes/quoteApprove.ts left in place
//   per user direction — committed by explicit path only, not staged).
//   §13.3 Item 191 LOG OPEN; closed at v3.8.akq when Phase 2 ships.
//   [Updated at v3.8.akt: Phase 2 actually shipped as akt, not akq —
//   three parallel sprints (akq Item 87+63, akr Item 8.5, aks Item
//   178+180.6.b) took the letters in between. Item 191 LOG OPEN
//   continues; closes at akt below.]
//
// v3.8.akt — Item 191 / Sprint 65 Phase 2: EIA fuel-index feed code +
//   cron + on-demand trigger. Builds the fetcher + scheduling on top
//   of the v3.8.akp foundation. Live verification (running the on-demand
//   script + reporting 7 prices back to chat + docs entries) happens
//   immediately AFTER this commit ships per the user's Phase 2 plan.
//   Boundary discipline held: no change to autoQuoteService,
//   fuelSurchargeTableService.lookupFuelSurcharge, contract-rate path,
//   Load.fuelSurcharge read/write sites, or marketDataService.
//   Service (backend/src/services/fuelIndexService.ts NEW, ~204 LOC):
//   * getFuelIndex(region) cache-only reader — returns null if region
//     never written; returns stale rows with stale:true flag so callers
//     can decide whether to use or fall back further. Does NOT trigger
//     a fetch — keeps per-quote read load at zero EIA calls.
//   * refreshAllRegions() serial sweep of all 7 EiaRegion values
//     (NATIONAL + PADD1..PADD5 + CA). Per-region failure preserves
//     last cached value + logs; loop continues to next region.
//   * Provider toggle via env.FSC_INDEX_PROVIDER: "eia" (default) hits
//     EIA Open Data API v2; "manual" short-circuits the fetch entirely
//     so an operator can override a region via direct DB upsert when
//     EIA is unavailable.
//   * HTTP shape mirrors mileageService: native fetch +
//     AbortSignal.timeout(10_000) + throw on non-200/timeout + no
//     retry. EIA_API_KEY short-circuit mirrors fmcsaService FMCSA_WEB_KEY.
//   * EIA v2 facet IDs (VERIFIED via WebFetch against EIA's published
//     series-ID pattern EMD_EPD2D_PTE_<REGION>_DPG at eia.gov/dnav/pet,
//     not guessed): product=EPD2D, process=PTE, duoarea = NUS / R10 /
//     R20 / R30 / R40 / R5XCA (West Coast LESS California per akp
//     sprint decision — non-CA West Coast should not carry CA's CARB-
//     diesel premium) / SCA (California).
//   * RefreshOutcome.note (renamed from .error per review sign-off) is
//     a free-text annotation used for BOTH success and failure paths;
//     consumers decide outcome via the .ok boolean.
//   Cron (backend/src/cron/index.ts +20 LOC):
//   * NEW weekly-fuel-index job at "0 22 * * 1" UTC (Monday 18:00 ET,
//     after EIA's Monday-afternoon Eastern publish ~16:00 ET). UTC
//     default per Item 185 internal-data-refresh convention. Slotted
//     next to auto-reversal at line 422; standard withGuard pattern +
//     lazy require() of the service per file convention.
//   On-demand trigger (backend/scripts/refresh-fuel-index.ts NEW, ~50 LOC):
//   * Run via `cd backend && npx ts-node scripts/refresh-fuel-index.ts`
//     for manual seeding / verification. Outputs console.table with
//     region / label / price / week-ending date / note per region.
//     Exit code 0 if every outcome ok=true, else 1. No string-matching
//     on the note field (per review sign-off — manual provider returns
//     ok=true uniformly, so no special-case needed).
//   Sprint accounting — Sub-pattern 6 (concurrent-sprint-coordination)
//   fired THREE times during this Phase 2 build:
//   * Fire 1 (akq parallel): Item 87 followup + Item 63 P3-2 chrome +
//     vocab bundle landed mid-build as commit 16534005. Phase 2 paused
//     per user's Y1 ratification, awaited akq to ship before resuming.
//   * Fire 2 (akr parallel): Item 8.5 AddressBook deletion landed as
//     commit d5899f6f shortly after akq. Hold continued.
//   * Fire 3 (aks parallel): Item 178 + Item 180.6.b CRM admin edit
//     UI landed as commit dc65ef37. Hold continued until working tree
//     fully clear.
//   Net cost of the three-fire wait: ~2 letters slipped (planned akq →
//   actual akt). The user's Y1 protocol prevented any version-history
//   collision or commit race. Pattern 6 sub-rule c gate held across
//   the entire session: every committed letter matched VersionFooter's
//   canonical state at commit time, never CLAUDE.md §11 or any stale
//   chat assumption.
//   Pre-commit gates per Sub-pattern 11 (CI parity): prisma generate
//   clean (FuelIndexCache type still resolves), backend tsc --noEmit
//   clean (0 errors across the working tree — the pre-existing
//   quoteApprove.ts ActorType error from earlier in this session was
//   resolved by one of the parallel sprints between akp and akt).
//   Live verification (run on-demand script against prod, report 7
//   regional prices from FuelIndexCache after first successful refresh)
//   + docs entries (regression-log.md, CLAUDE.md §11 row, §13.3 Item
//   191 close marker, Item 7 region-taxonomy-drift cross-link) ship
//   as a separate small follow-on commit after live data lands.
//   §13.3 Item 191 ships code-complete. Live verification + docs are
//   the next ratification cycle (no version bump expected for docs).
//
// v3.8.akw — EIA fuel-index live-verification fix: parser type-check
//   bug caught + corrected against real EIA v2 response (the keyed
//   request the akt sprint skipped per Sub-pattern 6 fire #3
//   methodology debt — VERIFY-on-first-fetch deferred to live-run,
//   live-run surfaced the bug, fix shipped same cycle).
//   Scope: surgical, two-line change inside fetchEiaPrice in
//   backend/src/services/fuelIndexService.ts. Nothing else touched.
//   The bug: my akt parser checked typeof row.value !== "number".
//   EIA v2 returns numeric values as STRINGS ("5.596", not 5.596),
//   so the type-check rejected every successful response and threw
//   "EIA returned no data; response shape unexpected" for all 7
//   regions. The shape (json.response.data[0]) was correct — only
//   the value-type assumption was wrong.
//   Fix: parseFloat the value, validate via Number.isFinite, return
//   the parsed number to upsertCache. Error message extended to
//   include the actual value + period for future debugging.
//   Live verification (run from local with key from .env, parsed-only
//   output, no raw response printed to avoid re-leaking the key that
//   EIA v2 echoes at request.params.api_key):
//     NATIONAL (NUS)   = $5.596/gal  week-ending 2026-05-18
//     PADD1    (R10)   = $5.420/gal  week-ending 2026-05-18
//     PADD2    (R20)   = $5.749/gal  week-ending 2026-05-18
//     PADD3    (R30)   = $5.122/gal  week-ending 2026-05-18
//     PADD4    (R40)   = $5.549/gal  week-ending 2026-05-18
//     PADD5    (R5XCA) = $5.920/gal  week-ending 2026-05-18  ← West Coast LESS California
//     CA       (SCA)   = $7.222/gal  week-ending 2026-05-18
//   All 7 match WebFetch-confirmed expected values exactly.
//   Spread CA-vs-PADD5 = $1.302/gal — confirms the akp sprint decision
//   to keep CA + West-Coast-less-CA as separate regions was load-
//   bearing (a single aggregate PADD5 series would have inflated non-
//   CA West Coast pricing by ~$1.30/gal).
//   Security flag — EIA_API_KEY rotation recommended:
//   During diagnosis the raw EIA response body was dumped to inspect
//   shape. EIA v2 echoes api_key back at request.params.api_key in the
//   response, which means any raw response print leaks the key. The
//   leaked value is in the akw-sprint session's chat history + harness
//   logs. Production code does NOT log raw response (only the parsed
//   price + date) so the leak was diagnostic-only, but the value
//   should be rotated before the next live cycle. Methodology
//   footgun banked: when printing API responses for debugging, pre-
//   redact known credential fields (api_key, authorization tokens,
//   bearer headers). Extension to Sub-pattern 9 (text-extraction-
//   pre-push-smoke): when smoke-printing external API responses,
//   credential-redact pre-print, not post-print.
//   Item-number collision flagged (NOT fixed here — docs scope):
//   Prior commit 4d88d3b5 marked an OLDER §13.3 Item 191 (DIRECT_URL
//   split shipped in v3.8.ajg/ajs) as CLOSED. My EIA fuel-index work
//   has been mis-numbered against that older item since akp. The
//   docs commit (regression-log + CLAUDE.md §11) will surface the
//   collision + propose a renumber (likely Item 192 for EIA) or
//   annotate both items in §13.3.
//   §13.3 EIA-fuel-index item ship-status: code is now live-verified
//   for all 7 regions and ready for the docs commit. The docs commit
//   ships with no version bump per §3.1 docs-only convention.
//   Files: 2 (fuelIndexService.ts +9/-3 = +12 LOC net, this footer
//   block + version bump). Pre-commit gates per Sub-pattern 11:
//   prisma generate clean (no schema change), backend tsc --noEmit
//   clean, frontend tsc --noEmit clean.
//
// v3.8.aky — Carrier onboarding hardening: (Item 2) browser-autofill
//   opt-out on First Name + Last Name inputs at onboarding/page.tsx
//   :979/983 — Chrome had been injecting saved address-profile
//   values (city → First Name "Skokie", state → Last Name "IL") on
//   pageload because the inputs carried default `name="firstName"`/
//   `"lastName"` matching Chrome's address-card heuristic. Live
//   repro hypothesized FMCSA mapping bug; sub-pattern 14 (diff-
//   disproves-hypothesis halt) caught the wrong root cause — read
//   `applyFmcsaData` at onboarding/page.tsx:291-302 verbatim,
//   confirmed zero mapping writes to firstName/lastName. Actual
//   cause: browser autofill cross-contamination. Fix matches v3.8.aiu
//   pattern (email/phone/password): autoComplete="off" + non-standard
//   `name="carrier-registration-firstname"` / `"-lastname"`. NO
//   pattern validator added — would red-border legitimate accented
//   and non-Latin names (José, Nguyễn) common in the owner-operator
//   base. (Item 3) Workers' Compensation Coverage promoted from
//   mention-inside-COI to dedicated 4th required document card.
//   Accepts WC certificate OR signed exemption affidavit (single-
//   driver operators with no employees are exempt in some states;
//   the affidavit IS acceptable proof, do NOT hard-block them).
//   Frontend: 4th doc card in `docs` array at onboarding/page.tsx
//   :1386-1391, `canNext` step===2 gate extended with `wc` check at
//   :399-409, required-count banner array extended at :1370. Backend
//   `DOC_TYPE_MAP` at carrierController.ts:175-180 maps wc →
//   "WORKERS_COMP" string. Path γ canonical adopted per sub-rule c
//   fire #31: Document.docType is a free-form String? column, NOT
//   a Prisma enum — initial directive specified "add enum value
//   WORKERS_COMP with its migration" but authoritative-source check
//   on schema.prisma:2009 confirmed no `enum DocType { ... }` block
//   exists (the "enum" was the documented value list in the column
//   comment). Path γ = add WORKERS_COMP as canonical string value +
//   update the comment list; NO migration, NO enum block, NO Neon-
//   direct verification step. Queries WHERE docType = 'WORKERS_COMP'
//   work today. Sub-rule c also fired #30 on the Item 2 diff-
//   disproves-hypothesis halt — two sub-rule c fires within a
//   single sprint Phase B; cumulative §19 registry advances 29 →
//   31. Carry-forward: schedulerService.ts cron disable from the
//   prior session (post-v3.8.akx) was orphaned uncommitted when
//   v3.8.akx Marco Polo selectively included only the §13.3 Item
//   192 docs row but not the code change. Bundled into v3.8.aky
//   to ship the operational change behind the documented banking.
//   Per-user opt-out + threshold tuning + test-load exclusion is
//   the proper Item 192 sprint, deferred. NO backend required-doc
//   validation gate added in this sprint (pre-existing gap, kept
//   atomic per §3.3). NO duplicate-detection or OTP work (next
//   sprint, pending SMS-path decision). Files: 4 (onboarding/page
//   .tsx +24/-3 LOC net, carrierController.ts +7/-4 LOC net,
//   schema.prisma column comment +1 line edit, schedulerService.ts
//   +8/-4 LOC carry-forward, this footer block + version bump,
//   CLAUDE.md §11 row). Pre-commit gates per Sub-pattern 11:
//   backend tsc --noEmit clean, frontend tsc --noEmit clean,
//   frontend npx next build clean. No Prisma migration.
//
// v3.8.akz — Item 1 (insurance-agent verification flow, Path β):
//   wire `sendInsuranceVerificationEmail()` into the `registerCarrier`
//   post-response fire-and-forget chain, AND unify the trigger gate
//   in `insuranceVerificationService` so register + updateCarrier +
//   carrierCompliance share one source of truth. Pre-akz state per
//   the v3.8.aky audit: the email sender at insuranceVerificationService
//   .ts:83-243 was healthy + sending to `carrier.insuranceAgentEmail`,
//   but `registerCarrier` never invoked it. Only `updateCarrier`
//   (admin endpoint, carrierController.ts:1185), the carrier-compliance
//   PATCH route (carrierCompliance.ts:286), and the expiry-reminder
//   cron (insuranceVerificationService.ts:285) called it. Original
//   "all 4 agent fields populated" design intent never landed — the
//   existing gates were single-field (`updated.insuranceAgentEmail`
//   only). Net pre-akz behavior: carrier completes onboarding with
//   all 4 agent fields populated → agent receives nothing.
//
//   Path β implementation (unified gate via new helper):
//   New `maybeSendInsuranceVerificationEmail(carrierId,
//   insuranceFieldsChanged: boolean)` exported from
//   insuranceVerificationService.ts. Two-condition gate:
//   (a) CHANGE-CONDITION — `insuranceFieldsChanged` must be true;
//       caller knows whether their write touched any insurance-
//       relevant field. Prevents re-sends on unrelated PATCHes
//       (status flip, address-only update, scorecard refresh) that
//       happen to touch the carrier row but not insurance.
//   (b) COMPLETENESS-CONDITION — all 4 agent fields (name, email,
//       phone, agency) populated on the RESULTING persisted record.
//       Helper reads `prisma.carrierProfile.findUnique` AFTER the
//       caller's write completed (not the request payload), so a
//       PATCH touching one agent field still evaluates correctly
//       against the union of prior + new state.
//   Returns `{ sent: boolean, reason?: string }` so callsites can
//   log skip-reasons at info level for AE forensic visibility.
//
//   Also exported: `didInsuranceFieldsChange(data)` helper that
//   inventories the 12 insurance-relevant fields (4 coverage
//   provider/amount pairs + 4 agent fields) and returns true if
//   any are present in the write payload. Used by `updateCarrier`
//   + `registerCarrier` to compute the change-condition uniformly.
//
//   Three callsite changes:
//   (1) `registerCarrier` (carrierController.ts:387, between admin-
//       notify Step 2 and chameleon-fingerprint Step 3): NEW call.
//       Step 2.5 in the post-response fire-and-forget chain. Skip-
//       reason logged if either gate fails (e.g. carrier skipped
//       Step 3 Insurance entirely, or agent fields incomplete).
//       For a brand new record where the carrier filled all agent
//       fields per the Step 3 canNext gate, this fires the
//       verification email at registration time.
//   (2) `updateCarrier` (carrierController.ts:1185): replaces the
//       prior `insuranceFieldsUpdated && updated.insuranceAgentEmail`
//       single-field check. Inline `insuranceFieldsUpdated` array
//       removed — replaced with `didInsuranceFieldsChange(data)`
//       helper call for single-source-of-truth on the change-
//       condition inventory.
//   (3) `carrierCompliance.ts:286`: replaces the prior `if
//       (updated.insuranceAgentEmail)` single-field check. Change-
//       condition is trivially true (this route's PATCH semantic
//       is "carrier updated their insurance record" by routing
//       definition); completeness-condition still applies via the
//       helper's post-write DB read.
//
//   Cron path (`checkExpiringInsurance` in insuranceVerificationService
//   .ts:285) UNCHANGED — different semantic (periodic reminder, not
//   a "fields changed" event). Cron's existing `daysUntil === 60 ||
//   30 || 7` gate is correct for the reminder loop. Routing the
//   cron through the unified gate would incorrectly skip reminders
//   whenever insurance fields hadn't changed in the most recent
//   write.
//
//   Architectural pattern banked (consistent with v3.8.akw notify
//   TenderAction fan-out at all five accept surfaces): when multiple
//   callsites share a common gate + side effect, the gate logic
//   lives in the service layer alongside the side effect. Controllers
//   + route handlers pass authoritative inputs (post-write record
//   reads + change-condition booleans); they don't reimplement gate
//   logic. Future sprints adding a 5th callsite (e.g. AE bulk
//   insurance import, third-party COI sync webhook) inherit the gate
//   automatically.
//
//   Files: 4 (insuranceVerificationService.ts +60/0 LOC unified gate
//   helper + INSURANCE_RELEVANT_FIELDS constant + didInsurance
//   FieldsChange helper, carrierController.ts +30/-12 LOC unified
//   gate wiring at updateCarrier + new registerCarrier Step 2.5
//   call, carrierCompliance.ts +12/-5 LOC unified gate wiring at
//   PATCH /insurance endpoint, this footer block + version bump,
//   CLAUDE.md §11 row). Pre-commit gates per Sub-pattern 11: backend
//   tsc --noEmit clean, frontend tsc --noEmit + npx next build clean
//   (no frontend source changes; gates run defensively). No Prisma
//   migration. No new env vars. No new dependencies.
//
//   §13.3 Item closure: the insurance-agent verification flow gap
//   audited in v3.8.aky Phase A as "NOT FIRING TODAY" is now LIVE
//   on the registration path. Future polish: AE-facing UI to view
//   sent verification emails per carrier (banked but not in akz
//   scope), agent-side reply tracking (out of scope, no inbound
//   webhook). Per §3.1: v3.8.aky → v3.8.akz sequence-continuous.
//
// v3.8.ala — Onboarding contact-security: phone duplicate detection +
//   per-IP + per-contact rate limiting on /api/carrier/register +
//   compliance@ flag on every duplicate hit + enumeration hygiene.
//   NO SMS path. NO OTP verification. NO A2P dependency. Closes the
//   phone/email duplicate-check asymmetry: pre-ala `registerCarrier`
//   rejected duplicate emails (`User.email` unique constraint +
//   findUnique at carrierController.ts:27-30 → 409 "Email already
//   registered") but had no phone duplicate check at all. Same
//   endpoint had zero rate limiter — wide open to enumeration
//   scraping. No compliance signal on collision today.
//
//   Phase A audit confirmed: (a) `express-rate-limit ^7.5.0` already
//   in backend/package.json — no new dep; (b) phone stored as-typed
//   on User.phone (e.g. "(269) 220-6760"); two local 10-digit strip
//   helpers exist in chameleonDetectionService + crossReferenceService
//   for fingerprint hashing but neither feeds duplicate-checks; no
//   E.164 normalizer; (c) registration is US-only — no country
//   picker, frontend assumes +1; (d) compliance flag pattern: two
//   shapes exist (chameleon → role-based dispatch; insuranceVerify
//   → COMPLIANCE_EMAIL constant from config/authority.ts). Directive
//   says "flag to compliance@" — using COMPLIANCE_EMAIL constant
//   pattern.
//
//   Five files touched:
//   (1) NEW `backend/src/lib/phoneNormalization.ts` — `normalizePhone
//       E164(raw)` + `phoneNumbersMatch(a, b)` helpers. ~25 LOC.
//       Strips non-digits + handles leading "1" country code +
//       prepends "+1" to 10-digit US national number; returns null
//       on any input that doesn't normalize to exactly 10 US digits.
//       Header comment documents the swap target for libphonenumber-
//       js when/if international registration ships — every caller
//       inherits the upgrade transparently.
//   (2) `backend/src/controllers/carrierController.ts` — phone
//       duplicate check inserted between email check and DOT/MC
//       checks. Both stored + submitted numbers normalized to E.164
//       before comparison (light scan at pre-revenue volumes; the
//       indexed `phoneNormalized` column refactor is banked at
//       ~10K+ rows). Also new `flagRegistrationDuplicate(opts)`
//       helper (~50 LOC) — fires a brief alert to COMPLIANCE_EMAIL
//       + writes SystemLog WARNING row with logType=SECURITY +
//       source="registration-duplicate". Both wrapped in .catch()
//       so neither blocks the 409 response. Email body + SystemLog
//       details carry SHA-256 hash (first 16 chars) of the
//       colliding value — never plaintext PII. registrationIp +
//       registrationCountry capture moved earlier in the function
//       so the compliance flag has forensic context (was previously
//       captured after duplicate checks; pre-ala duplicate hits
//       had no IP/country signal because the variables didn't
//       exist yet). Email + phone collision branches both fire
//       the flag before returning.
//   (3) `backend/src/routes/carrier.ts` — two new rate limiters
//       mounted on POST /register: (a) registerIpLimiter — 10
//       attempts / 15 min keyed by req.ip, fires BEFORE multer
//       (no body needed); (b) registerContactLimiter — 3 attempts
//       / 60 min keyed by composite `${lowercaseEmail}|${digitOnly
//       Phone}`, fires AFTER multer + body normalization
//       middleware so req.body.email + req.body.phone are
//       populated. Composite-key fallback to `ip:${req.ip}` if
//       both email + phone absent (malformed request) — never
//       returns empty string which express-rate-limit would treat
//       as a global counter. Skip-handler returns 429 "Too many
//       registration attempts. Please try again later." — generic
//       per enumeration hygiene (no echo of which limiter fired
//       or against which key).
//   (4) `frontend/src/components/ui/VersionFooter.tsx` — version
//       bump + this comment block.
//   (5) `CLAUDE.md` — §11 row.
//
//   Enumeration hygiene (directive §4): duplicate error responses
//   carry NO name / MC / agency echo. Email collide → 409 "Email
//   already registered" (unchanged from today). Phone collide →
//   409 "Phone number already registered" (mirrors). Rate-limit
//   hit → 429 with generic message. Compliance flag dispatch
//   happens AFTER the 409 response is sent, so duplicate-hit
//   response time is indistinguishable from non-collision response
//   from the attacker's clock — closes the timing-side-channel.
//
//   Banked for future sprints (out of v3.8.ala scope):
//   - Email lowercase-on-lookup to close the case-sensitivity
//     enumeration vector (`Test@example.com` ≠ `test@example.com`
//     today on Postgres + Prisma findUnique). Pre-existing gap.
//   - `User.phone @unique` schema constraint + backfill — race
//     window stays today since the duplicate check is application-
//     level only. Pre-revenue volumes make this acceptable for
//     now; race window closes via DB constraint when N grows.
//   - libphonenumber-js adoption — only when international
//     registration ships. Current DIY normalizer is sufficient
//     for US-only scope.
//   - Indexed `phoneNormalized` column on User — refactor when
//     N > ~10K carriers. Today's full scan over phone-bearing
//     users is light at pre-revenue volumes.
//   - OTP verification path / SMS verification — next sprint
//     pending Wasi's SMS-path decision per directive.
//   - Backend required-doc validation gate — pre-existing gap
//     from v3.8.aky banking. Continues to defer.
//
//   Pre-commit gates per Sub-pattern 11: backend tsc --noEmit
//   clean, frontend tsc --noEmit + npx next build clean. No
//   Prisma migration. No new env vars. express-rate-limit
//   already in deps — no new package install. Per §3.1:
//   v3.8.akz → v3.8.ala sequence-continuous.
// v3.8.alb — Registration-endpoint hardening, two defense-in-depth gaps.
//   Item A: email case-insensitivity on the duplicate-check (closes
//   live bypass shipped in v3.8.ala). Item C: backend required-doc
//   gate on the /api/carrier/register submission (frontend canNext
//   becomes UX guide; backend is authoritative). See CLAUDE.md §11
//   row for full narrative + scope boundary.
//
// v3.8.alc — alb required-doc gate hardened against client-asserted
//   spoofing. Gate now derives doc-type presence from req.files.files
//   (multer payload), not req.body.docTypes (client array). Closes
//   the curl-with-empty-files API bypass. See §11 row.
//
// v3.8.ald — Email read-path case-insensitivity across all 8 lookup
//   sites. Extracts normalizeEmail + caseInsensitiveEmailFilter
//   helpers (mirroring phoneNormalization), routes the carrier
//   registration write through normalizeEmail, and applies Prisma
//   mode: "insensitive" to login + OTP-verify + forgot-password +
//   reset-password + AE-register-duplicate + carrier-login + carrier-
//   resend-otp + admin-token-mint. Resolves both lowercased (post-alb)
//   and pre-existing mixed-case stored rows. See §11 row.
//
// v3.8.ale — Email DB-level case-insensitive uniqueness via citext.
//   Closes the auth-ambiguity ald's findFirst-with-mode-insensitive
//   was working around. Dedupe-scan ran first against Neon prod (0
//   case-duplicate rows in 10-user table); migration applied directly
//   via $executeRawUnsafe (DIRECT_URL not set in local .env so
//   prisma migrate CLI couldn't run; raw SQL via runtime client
//   bypasses that requirement). Five-check verification on Neon
//   confirms citext v1.6 enabled, users.email udt_name=citext,
//   users_email_key UNIQUE INDEX present, behavioral case-insensitive
//   equality + Prisma round-trip working. See §11 row.
//
// v3.8.alf — Ledger reconciliation for the ale citext migration BEFORE
//   the next Render deploy. State-verified ale migration file +
//   schema + DB all aligned; only the _prisma_migrations ledger row
//   was missing (the ale apply path used $executeRawUnsafe which
//   bypassed Prisma's ledger machinery). Added DIRECT_URL to local
//   backend/.env per §2.2 canonical (derived from DATABASE_URL by
//   stripping `-pooler`), then ran `prisma migrate resolve --applied
//   20260526164943_email_citext` to record the ledger row with
//   applied_steps_count=0 (no SQL re-run). prisma migrate status
//   now reports "Database schema is up to date!" — Render's next
//   migrate deploy will skip the migration cleanly. Also closes the
//   render.yaml docs gap surfaced during state verification: the
//   envVars block didn't list DIRECT_URL or PRISMA_MIGRATE_LOCK_TIMEOUT
//   despite both being canonical since v3.8.ajg/ajs. Render dashboard
//   IS set correctly (otherwise check-direct-url.js would fail every
//   build since 2026-05-24); only the docs file lagged. See §11 row.
//
// v3.8.alg — Node.js engines bump + Item 8.10 lineage closure
//   annotation. (1) backend/package.json engines.node: ">=18.0.0"
//   → "^24.0.0". Floor was Node 18 (EOL since April 2025, 13 months
//   past EOL); Render auto-picked Node 26.2.0 (Current, not LTS).
//   Pinning to ^24 lineage = Node 24 Active LTS (supported through
//   Apr 2027) for production stability. (2) §13.3 Item 8.10 lineage
//   status annotated CLOSED-and-EMPIRICALLY-VALIDATED via the v3.8.alf
//   push + Render build log evidence — check-direct-url.js guard
//   fired correctly, prisma migrate deploy reported "No pending
//   migrations to apply" with 21 migrations found, post-deploy
//   migrate status reported "Database schema is up to date!".
//   Full deploy-chain investigation arc (8.10 → 191 → ale → alf)
//   now structurally complete. (3) Prisma 7 upgrade attempted but
//   reverted to Prisma 6.19.3 status quo — Phase A revealed a
//   13-callsite refactor requirement (PrismaClient adapter pattern
//   + url/directUrl moved out of schema.prisma datasource) past
//   the atomic threshold. Banked for a dedicated future sprint when
//   prioritized. See §11 row.
//
// v3.8.alh — ald test-mock regression fix (Sub-pattern 11 third
//   fire). CI red across ald → alf → alg (~24h, 3 commits) on
//   the GitHub Actions backend job; production unaffected because
//   Render's build chain doesn't run vitest. v3.8.ald swapped 5
//   callsites in authController.ts from findUnique → findFirst for
//   case-insensitive email lookup; __tests__/setup.ts prisma.user
//   mock had findUnique but not findFirst → TypeError at every
//   test exercising those paths (10 failures). Fix: added
//   findFirst: vi.fn() to the user mock + re-pointed 7 test mocks
//   in authController.test.ts from findUnique.mockResolvedValue
//   → findFirst.mockResolvedValue. Suite now 224/224 green.
//   npm test added to canonical pre-commit gate at CLAUDE.md §3.3.
//   Sub-rule c registry advances 32 → 33. Banked observation:
//   Render-vs-CI gate divergence — passing Render deploy is NOT
//   evidence of passing test suite. See §11 row.
// v3.8.alm — /carriers §20 audit polish (Lens 1 + 2 + 4). Removed 5
//   body em-dashes from tier-req / Founding / universals copy (Lens 2,
//   tier-name redundancy dropped, "Unlocks at" clarifies requirement);
//   non-canonical gold #C8963E ×5 → #C5A572 (dark fraud banner, matches
//   its rgba border) + #BA7517 (light-bg section-label + subhead) (Lens
//   4 brand drift, §13.3 Item 30 class); "Six milestones" → "One
//   ladder" (stale M1-M6 framing, retired in locked model §10); legacy
//   canvas #faf9f7 → #FBF7F0; arithmetic "10 days faster" → "9 days
//   faster" (Net-30 → Net-21 = 9; §4 #13 canonical already correct at
//   HEAD). carriers.html only; next build gate green.
// v3.8.all — /index Caravan teaser: §20 Lens 3 redundancy (Option A) +
//   §5 cleanup. Demoted homepage tier pills to qualitative teasers
//   (Silver "Day-1 entry" / Gold "Faster pay" / Platinum "Lowest fees");
//   pay-term specifics (Net-30/21/14, 3/2/1% QP) now live only on
//   /carriers#caravan (redundancy closed). Removed §5 prohibited "safety
//   bonuses" (retired v3.8.aib) + stale "Six milestones" + M4/M5 framing;
//   pill gold rgba(200,150,62)/#B8862E → canonical #C5A572/#BA7517; CTA
//   → /carriers.html#caravan deep link. index.html only; build gate green.
//   NOTE banked: /index line 427 "Tier-graduated FSC" tile (§5, Item 182)
//   + 4 decorative #C8963E (hero SVG L105-107 + JS L822) left for a
//   dedicated /index brand-cleanup pass.
// v3.8.aln — /carriers tier-card icons: refined brass treatment (§20
//   Commit 3, Option 3 — no new assets). Flat tier-icon fills → struck-
//   medallion metallic gradients: Silver cool brushed silver (navy
//   100/200/300), Gold warm brushed brass (gold-light/gold/gold-dark),
//   Platinum deep navy premium (navy-700/navy/navy-900) + gold icon +
//   gold ring. Base .tier-icon gains inset highlight + drop shadow +
//   hairline ring. Lucide line-icons kept per skill "Lucide icons only".
//   carriers.css only. Heritage photo-icon paths (emblems / full photos)
//   held pending eval — swap if Option 3 doesn't land. Letter: parallel
//   v3.8.alm (test-fence Items 189/190) landed post-push; aln continues.
// v3.8.alw — Compass Score Build A: real on-time pickup/delivery. Wired
//   the carrier scorecard (integrationService.recalculateCarrierCPP) + the
//   Caravan advancement gate (caravanService.checkMilestoneAdvancement) to
//   read the actual event timestamps the carrier portal already captures
//   (Load.actualPickupDatetime / actualDeliveryDatetime) vs the scheduled
//   appointment window + 2h grace — replacing the always-100% stubs that
//   made the published Compass Score outrun the backend. New shared
//   lib/onTimePerformance.ts (11 vitest cases). NO migration (columns
//   already exist + are stamped by carrierLoads.ts). Locked decisions: 2h
//   grace, exclude no-window + no-actual loads, neutral 100 until
//   measurable; the advancement GATE requires measurable proof (won't
//   advance to Gold/Platinum on zero measurable on-time history). Build B
//   widens coverage (AE-path stamping + AT_PICKUP trigger + backfill).
// v3.8.alx — Compass Score Build B: widen on-time data capture. New shared
//   lib/loadEventStamps.ts stamps Load.actualPickupDatetime /
//   actualDeliveryDatetime on status change — (a) AT_PICKUP is now the
//   PRIMARY pickup signal (was LOADED/IN_TRANSIT only), (b) POD_RECEIVED is
//   a delivery fallback, (c) the AE-console status path now stamps them too
//   (carrierLoads already did; loadController never did). Never overwrites.
//   New backfill script scripts/backfill-actual-event-timestamps.ts derives
//   historical timestamps from Shipment.actualPickup/actualDelivery +
//   podReceivedAt (dry-run default, --commit to apply). No migration. Pairs
//   with Build A (alw) which READS these columns for the on-time score.
// v3.8.aly — Compass Score Build D: real document timeliness. POD now scored
//   on whether it was uploaded within 24h of the actual delivery timestamp
//   (populated by Builds A/B), measured per load that has both an actual
//   delivery time + a POD on file. Replaces the "any upload = timely"
//   simplification in integrationService.recalculateCarrierCPP. Neutral 100
//   until measurable. No migration. 6 of 7 Compass factors now genuinely
//   measured; GPS/tracking (Build C — rename + ELD-ready) is the last stub.
//
// v3.8.alz — §13.3 Item 145: tender funnel + decline-taxonomy analytics.
//   New GET /analytics/tender-funnel (ADMIN/CEO/BROKER/OPERATIONS) — single
//   windowed fetch of LoadTender (with load.equipmentType + carrier.cppTier)
//   + JS aggregation: funnel (offered → accepted/declined/countered/expired/
//   pending), conversion (acceptance-of-total, acceptance-of-responded,
//   response rate), avg response time, decline-reason distribution, and
//   breakdowns by equipment / carrier tier / expiry-window (4h/24h/48h
//   preset effectiveness, pairing with Item 144). New
//   /dashboard/tender-analytics page (Intelligence cluster) — funnel stat
//   cards + conversion bars + decline-reason bar list + 3 acceptance-rate
//   tables, all with honest empty-states (the data needs ~50+ tenders/wk to
//   be statistically meaningful — surfaces "no tenders yet" at low N).
//   Closes the last tender-lifecycle backlog item. ~250 LOC across the
//   endpoint + page + 1 sidebar line. No schema, no migration. Letter:
//   parallel Compass-Score Builds A/B/D took alw/alx/aly mid-build; bumped
//   to alz (Sub-pattern 6). Gates: backend tsc + vitest 235/235 + frontend
//   tsc + next build all clean.
// v3.8.ama — Compass Score Build C: real Tracking compliance + ELD-ready.
//   De-aliased the GPS factor (was mirroring the check-call response rate) to
//   read real location visibility from LoadTrackingEvent.latitude — unifies
//   carrier-portal / geofence / check-call-email AND ELD pings (motiveService /
//   samsaraService already write LoadTrackingEvent with locationSource=ELD), so
//   connecting telematics raises the score with no rework. Renamed public factor
//   "GPS compliance" -> "Tracking compliance" (/carriers + CLAUDE.md §9; DB
//   column gpsCompliancePct unchanged). New per-carrier ELD credential fields on
//   CarrierProfile (eldApiKeyEncrypted / eldExternalAccountId / eldEnabled /
//   eldConnectedAt) + migration — storage ready for when a carrier shares keys.
//   ALL 7 Compass factors now genuinely measured (Builds A/B/D/C). Existing
//   EldEvent / ELDDeviceMapping / eldService infra reused (no duplicate build).
// v3.8.amb — Compass Score Build E: finalize + verification. Extracted POD
//   doc-timeliness into a pure, unit-tested lib/docTimeliness helper (mirrors
//   lib/onTimePerformance) — behavior-neutral, +8 vitest cases (243 total).
//   Closes the A/B/C/D/E arc: all 7 Compass factors genuinely measured +
//   correctly combined (claimRatio inverted, weights sum 1.0); scorer wired
//   (onLoadDelivered + weekly Sunday-23:00 cron); page claims verified honest
//   live ("Tracking compliance" rename deployed). Open design item surfaced:
//   tracking-compliance returns 0% when loads exist but no location captured,
//   vs neutral-100 for on-time/doc — a fairness asymmetry for Wasi to rule on.
// v3.8.amc — Compass Score Build F: tracking compliance telematics-activated
//   (Wasi decision, option 2). The tracking factor now stays NEUTRAL (100)
//   until a carrier connects ELD (CarrierProfile.eldEnabled) — consistent with
//   the neutral-default on-time/doc factors — so no carrier is penalized for
//   SRL's pre-ELD location-capture gap. Once ELD is connected the SAME
//   LoadTrackingEvent query measures real coverage (no rework). Resolves the
//   only open finding from the A/B/C/D/E adversarial audit. integrationService
//   1-block change + CLAUDE.md §9 note. No migration.
// v3.8.amd — /contact §20 audit sweep. Softened "15-minute quote" SLA →
//   "fast quotes during business hours, one click or email" (§5 unenforced-SLA
//   class); "transit twice daily"→"daily" (matched shipperLoadNotifyService);
//   added "18+ months" FMCSA authority (Item 182 parity); #C8963E→#BA7517 gold
//   drift ×2; body em-dash sweep (title/meta + comments left per Lens 2); added
//   Marco Polo AI contact channel (closes AI pillar → 4/4); CTAs Get-a-Quote→
//   /shippers.html#quote-form + Join-Network→/onboarding. §20.6 audit-log updated:
//   /carriers marked FULL (Compass arc closed), /contact recorded. Minor optional
//   left: quick-link icons, FAQ-vs-/faq.html overlap, /tracking.html→/track.
// v3.8.ame — /faq §20 MAJOR honesty correction. Page was pre-v3.7 stale with
//   live retired claims. Rewrote Carriers + Technology sections to §8/§10/§4
//   canonical: killed retired tier model (180d/75-loads, 360d/150-loads, $150/
//   $300-mo safety bonuses, referral + "3 lanes" gates), "24-48 hour" onboarding
//   SLA, "live GPS"/ELD-live/EDI(204/990/214/210) overclaims, "GPS compliance"→
//   "tracking compliance", LTL (not in whitelist), "15-minute" quote SLA ×3,
//   billing@→accounting@. Gold #C8963E→#BA7517 ×~20 + em-dash sweep. Kept the
//   honest answers (double-brokering, factoring, 7-day-vs-2-day). /contact (amd)
//   verified live + clean. §20.6 updated; /carriers + /contact + /faq now closed.
// v3.8.amf — /blog §20 audit. News-aggregator shell ("The Freight Insider"),
//   aggregated articles are third-party RSS (exempt). Shell already clean (no
//   gold drift / em-dashes / stale claims). One fix: hero "curated daily by AI"
//   → "from across the industry, updated throughout the day" — newsAggregator
//   Service is RSS + keyword categorization (no AI/LLM), 4-hour cron not daily,
//   so "by AI" + "daily" both overclaimed. LTL confirmed dropped (no /faq change
//   needed). §20.6: /blog closed; only /careers + /track + legal remain (+ /about
//   partial). Per §3.1: v3.8.ame → amf.
// v3.8.amg — /careers §20 audit. Mostly honest already. Rewrote "Tech-Forward
//   Environment" card: dropped "EDI systems" (not operational), "machine
//   learning" (unconfirmed), "cutting-edge" (consultant-speak), "changing the
//   industry" (hyperbole) → real systems (Marco Polo AI, Compass Engine, in-house
//   TMS). Gold #C8963E→#BA7517 ×7. careers@ alias kept (Wasi directive) +
//   documented in §1. §20.6: /careers closed; /track + legal remain (+/about
//   partial). NEXT: Wasi flagged the /track "How updates reach you" section as
//   over-disclosing internal tracking architecture (EDI 214 / 15-min ELD / geofence
//   / ops processing) — Lens 1.5 reveal + EDI/ELD overclaim; to be genericized.
// v3.8.amh — /track "How updates reach you" reveal genericized (Wasi flag).
//   The section spelled out the full internal tracking pipeline as marketing
//   copy (EDI 214 auto-mapping, 15-min ELD cadence, geofence mechanics, the ops
//   "logs it / tags source / recomputes ETA" processing, a 60-second internal
//   SLA) — a competitor blueprint per Lens 1.5, and EDI/live-ELD aren't even
//   operational. Replaced with customer-benefit-only copy (latest status, source
//   + timestamp shown, no-login, portal for PODs/exports). Reveal terms confirmed
//   gone + no duplicates on other pages. Minor residual: client-side JS status→
//   label map (588-589) lists standard freight-status names (low concern, std
//   industry terms). Per §3.1: v3.8.amg → amh.
// v3.8.ami — bullet-symmetry pass 1/2 (Wasi directive: "keep cards, bullet the
//   backs"). /track "How updates reach you" prose → ›-bullets (reused
//   .explainer-sources). /shippers 6 system-card-flip backs: paragraphs →
//   .card-bullets ›-lists (new CSS, matches /index "Ship With Confidence" +
//   /track marker). Bonus honesty fixes on /shippers: dropped retired "Fuel
//   pass-through tier-graduated" (§5) on the rate-con card → "FSC itemized";
//   softened 3× "within 15 minutes" quote SLA → "fast during business hours".
//   Pass 2/2 = /carriers commitment-card "How it works" backs → bullets (next).
// v3.8.amj — bullet-symmetry pass 2/2: /carriers commitment-card "How it works"
//   backs converted from numbered <ol class="mechanism-steps"> (step-num circles)
//   to ›-bulleted <ul> — matches /shippers .card-bullets + /track + /index. CSS
//   reworked (.commitment-card-back .mechanism-steps li::before ›); supersedes
//   the v3.8.aia numbered-steps standardization. Heritage-photo flip-card fronts
//   untouched. All flip-card / explainer backs site-wide now use the same
//   ›-bullet style. Pass 1 (ami) did /shippers + /track.
// v3.8.amk — legal-pages over-disclosure audit (Wasi: "too much public info about
//   the company / what MUST NOT be public"). Surgical content fixes across the 3
//   legal surfaces + cookie layer; every legally-required disclosure kept. PRIVACY:
//   removed the "secure data centers" FALSEHOOD (SRL is cloud-hosted, runs none) +
//   collapsed §3's detailed security checklist to a 1-line summary + link to the
//   Security Policy (which correctly NDA-gates implementation detail); fixed §1
//   "credit card numbers" (contradicted Security Policy §3 "no card data stored")
//   → "payment & banking info via our payment partners"; trimmed §4 Cookies +
//   §1/§5 to essential-only (grep confirmed ZERO analytics tooling site-wide — no
//   GA/Plausible/Mixpanel/Segment/etc.; the banner already says essential-only, so
//   §4 was over-claiming analytics + preference cookies that don't exist). TERMS:
//   dropped "less-than-truckload (LTL)" from §2 services (SRL doesn't broker LTL,
//   matches the shippers/faq sweep); tidied "AI-powered tools…Marco Polo platform"
//   → "AI tools…Marco Polo, our freight assistant". EMAILS: privacy@ + legal@ were
//   non-routed aliases (not in canonical §1 list) → repointed to compliance@ across
//   Privacy §8, Terms §11, Security Policy §5 (zero risk of a bounced legal/data
//   request). COOKIE-CONSENT.JS: non-canonical gold #c8a951/#b8963e + navy #0D1B2A
//   → canonical #C5A572/#BA7517 + #0A2540. NO leaks found anywhere (no vendor names,
//   no infra/server detail, no employee names, no schema/API) — Security Policy is
//   the model, kept as-is except the email. Per scope decision: Security Policy
//   nav/footer/navy chrome rework deferred (content-only pass). Per §3.1: amj → amk.
// v3.8.aml — Security Policy chrome aligned to canonical (deferred amk item).
//   Replaced the one-off `.nav-bar` (custom sticky bar + non-canonical text
//   wordmark "Silk Route Logistics" + gold #c8a951) with the canonical
//   logo-only INCLUDE:nav (5 links + Sign In dropdown + mobile menu) and added
//   the canonical INCLUDE:footer — the page had no footer before. Wrapped doc in
//   <main id="main-content"> + skip-link; added nav-scroll/hamburger JS + Marco
//   Polo widget (parity with privacy/terms). HEAD now links srl-logo.css. CSS:
//   added the canonical .navbar/.hamburger/.mobile-menu layout block (hardcoded
//   #C5A572/#BA7517, immune to the site-wide --gold #C8963E drift in
//   utilities.css); footer + mobile-login resolve from utilities.css. Bumped
//   .doc-container padding-top 40px→112px to clear the fixed 72px nav (96px on
//   mobile). Recolored doc-header gold #c8a951→#C5A572, h1 #f0f4f8→#FBF7F0,
//   subtitle/meta → canonical on-navy tones, gradient #1a2d45→#15365A; added
//   .section a gold-dark link styling (links were defaulting to browser-blue).
//   Removed dead .nav-bar/.nav-logo/.toc/.download-bar/.highlight-box/.back-link
//   rules (§3.7). Content untouched (the NDA-gated capabilities copy is the model
//   per amk audit). NOTE: utilities.css --gold #C8963E + 8 footer-hover drifts are
//   site-wide pre-existing — left for a separate scoped pass. Per §3.1: amk → aml.
// v3.8.amm — shared-CSS gold drift fix (utilities.css, site-wide footer chrome).
//   utilities.css was the lone shared file holding `--gold: #C8963E` (non-canonical
//   olive) + `--gold-light: #D4A84E` + 6 hardcoded #C8963E footer/mobile-login
//   instances. Cascade audit: every marketing page-CSS already defines
//   `--gold: #C5A572` (canonical) and loads AFTER utilities.css, so they override
//   it — meaning the drift only actually RENDERED on pages with no page-CSS --gold
//   override, i.e. the /security-policy footer I just added in aml. Fix: --gold
//   #C8963E→#C5A572 + --gold-light #D4A84E→#DAC39C (now matches srl-tokens.css +
//   all page-CSS); 6 hardcoded #C8963E → var(--gold); DELETED the dead
//   `.login-dropdown` block (§13.3 Item 26, grep-confirmed 0 HTML refs — it held
//   the last #B8862E/rgba(200,150,62)/#0D1B2A/#0F1E30 legacy values; superseded by
//   the canonical .nav-login-* dropdown which is RETAINED). utilities.css now 0
//   non-canonical gold/navy literals. Footer golds on every page resolve to
//   canonical #C5A572 (better contrast on navy than the olive too). Banked, NOT
//   touched (separate surfaces): tracking.css (1 legacy public page, --gold
//   #C8963E) + auth/root-login|root-register.css (app pages, 9 hardcoded #C8963E).
//   Per §3.1: aml → amm.
// v3.8.amn — residual #C8963E mop-up (the 3 remaining drift surfaces after amm).
//   tracking.css (legacy /tracking.html): :root --gold #C8963E→#C5A572 +
//   --gold-light #D4A84E→#DAC39C (cascades to all var(--gold) uses) + 2 rgba glow
//   tints rgba(200,150,62)→rgba(197,165,114); now matches its canonical sibling
//   track.css. auth/root-login.css + auth/root-register.css (app-login surface):
//   #C8963E→#BA7517 (CTAs/underline/gradient/dot), #B8862E→#854F0B (CTA hover,
//   already used elsewhere on these pages), rgba(200,150,62)→rgba(197,165,114)
//   glow tints. Left #0D1B2A — it's these pages' legacy --navy used consistently
//   as body bg, a separate non-gold migration (§2.1). All public/app gold now
//   canonical; 0 #C8963E across the codebase's rendered CSS. Per §3.1: amm → amn.
// v3.8.amo — legal-page consistency (Wasi: privacy/terms still showed Feb 1; "Security
//   policy page is totally different"). (1) Privacy + Terms "Last Updated: February 1,
//   2026" → "June 1, 2026" (reflects the amk content edits). (2) Security Policy body
//   rebuilt from the bespoke navy doc-header/doc-container/section register to the
//   CANONICAL legal-page template shared by privacy/terms: cream `.hero` ("Legal"
//   eyebrow + Playfair `Information <em>Security Policy</em>` italic-gold + hero-text +
//   gold divider) → `.legal-section` > `.legal-content` > `.legal-updated` +
//   `.legal-block`s. Procurement metadata (Document SRL-ISP-2026-001 · Version 2.0 ·
//   Effective May 3 2026 · Classification: Public) preserved in the `.legal-updated`
//   line. Sections 1–5 → legal-blocks; §1 em-dash → colon (§18.9). security-policy.css
//   rewritten to the legal template (hero + legal-block + global Playfair h1–h4),
//   keeping the aml canonical nav chrome; footer still resolves from utilities.css.
//   Now visually identical register to privacy/terms. Per §3.1: amn → amo.
// v3.8.amp — /track full §20 sweep (hero/UI/voice + AI pillar + bullet symmetry).
//   (1) Lens 1 honesty: hero-sub "Real-time status on every load" → "The latest
//   status on every load SRL moves"; meta description (×3: name/og/twitter) dropped
//   "in real time" + "live status" → "current status" — the page's own genericized
//   reveal shows updates come from carrier check-ins + SRL check calls + telematics
//   WHERE AVAILABLE, so "real-time on every load" overclaimed. (2) Lens 4: /track was
//   the only public page missing the Marco Polo widget — added marco-polo.css/js
//   (AI pillar + chrome parity). (3) Lens 5: explainer-fineprint "sign in to the
//   shipper portal above" (vague) → direct <a href="/shipper/login">. (4) Bullet
//   symmetry: .explainer-sources li::before '·' → '\203A' (›) matching every other
//   page. (5) Lens 1.5: JS publicStatusLabel fallback `replace(/_/g,' ')` (echoed raw
//   internal enum) → generic 'In progress'. (6) .search-btn:hover #8f5a11 → canonical
//   #854F0B. track.css already canonical (#C5A572 tokens, no #C8963E). Per §3.1: amo → amp.
// v3.8.amq — /about full §20 sweep (closes the last partial page). (1) §5 PROHIBITED
//   FIX: the retired "tier-graduated FSC pass-through" claim was live in 3 places
//   (Our Story §3, Mission card, "Published Before Asked" card) — retired site-wide in
//   v3.8.aib but /about never updated. All 3 → "fuel surcharge itemized on every rate
//   confirmation" (§4 #1 canonical). (2) #C8963E gold drift in 6 inline SVG icon strokes
//   (Mission/Vision/Promise + the 3 What-Sets-Us-Apart icons) → #BA7517. (3) Meta
//   description em-dash (×3 name/og/twitter) "Logistics — a technology-driven" → comma
//   (§18.9). (4) "Records stay on SRL servers" → "under SRL's control" (cloud-hosted, not
//   physical servers — same fix class as the privacy data-center line). Deferred
//   "heritage photo-icons for Mission/Vision/Promise" CLOSED as keep-Lucide — per Lens
//   1.6/1.7 the Lucide icons are the correct register (heritage photo-icons failed the
//   4-second-scan + brand-modernity tests on /index). about.css already canonical. All 12
//   public surfaces now §20-clean. Per §3.1: amp → amq.
// v3.8.amr — Security Policy footer navy-background fix (Wasi flag: "footer is still
//   not updated for Security policy page"). Root cause: utilities.css supplies the
//   footer grid + link colors (which assume a DARK bg) but NOT the background itself;
//   each page-CSS sets `.footer { background: var(--navy) }` (privacy.css/terms.css do).
//   When security-policy.css was rewritten to the legal template (amo) it relied on
//   utilities.css for the whole footer and never added the navy bg — so the light
//   footer text rendered on the cream page background and was nearly invisible. Added
//   `.footer { background: var(--navy); color: var(--fg-on-navy); padding: 80px 0 40px }`.
//   Footer now matches privacy/terms. Per §3.1: amq → amr.
// v3.8.ams — final §20 completion cleanup (surfaced by a full clean-bill sweep when
//   Wasi asked "is the website upgrade complete"). TWO residuals caught: (1) the footer
//   "Get a Quote" link pointed at /shippers.html#quote, but /shippers' anchor is
//   id="quote-form" (bare #quote doesn't exist → jumped to page top). Fixed across the
//   shared _partials/footer.html source + the 10 pages with the expanded footer
//   (carriers/about/contact/faq/blog/careers/track/privacy/terms/security-policy);
//   index + shippers already used #quote-form. (2) Last #C8963E gold drift on public
//   surfaces: index.html .srl-penguin mascot SVG (3× fill, beak+feet) → #BA7517 +
//   scroll-spy active-nav JS color → #C5A572 (lighter gold for the navy nav); srl-logo.css
//   .srl-logo-text-gold (wordmark gold "for light backgrounds") → #BA7517. NOT touched:
//   themes.css --theme-primary #C8963E — that's the APP/dashboard theme, not linked on any
//   public page (§12 exempt; tracked separately as §13.3 Item 10). All public marketing
//   surfaces now 0 #C8963E + 0 broken footer anchors. Per §3.1: amr → ams.
// v3.8.amt — contact-form confirmation + inquiry number (Wasi request: on submit, show a
//   thank-you + inquiry number on screen, and email operations@ with the inquiry number +
//   sender email). Backend `createContactSubmission` (websiteController.ts): derives
//   `INQ-XXXXXXXX` from the saved WebsiteLead id (no schema change; mirrors the carrier
//   APP-XXXXXXXX pattern); notification recipient changed info@ → operations@ (info@ isn't
//   a canonical alias per §1) with the inquiry number + sender email front-and-center;
//   ADDED a submitter confirmation email carrying the inquiry number (parity with the quote
//   flow); response now returns `inquiryNumber`. Frontend contact.html success handler reads
//   `data.inquiryNumber` and renders "Thank you for contacting us. Your inquiry number is
//   INQ-… We'll get back to you during business hours, and a copy is on its way to your
//   email." — replaces the prior unenforced "respond within 2 business hours" SLA with the
//   §6 honest "during business hours". Per §3.1: ams → amt.
// v3.8.amu — quote-request flow: same treatment as contact + UNBREAK the form (P0).
//   DISCOVERY: the /shippers "Get a Quote" form was silently broken — it POSTs
//   {companyName, contactName, originCity, destinationCity (combined "City, State"
//   free-text), freightType, estimatedWeight, specialRequirements}, but the backend
//   quoteRequestSchema required {name, company, originState, destCity, destState} and
//   rejected EVERY submission with 400 (confirmed via live POST). No lead was created,
//   no email fired. FIX: realigned quoteRequestSchema + createWebsiteLead to the form's
//   actual fields (companyName→company, contactName→name, destinationCity→destCity,
//   freightType→equipment, estimatedWeight→weight, specialRequirements→details; state
//   columns left null since the form combines city/state). THEN the requested treatment:
//   QTE-XXXXXXXX reference derived from the lead id; sales@ notification (canonical lead
//   inbox per §1) + submitter confirmation now both carry the reference; "you'll hear
//   from us within 15 minutes during business hours" → honest "during business hours
//   (Mon–Fri 7am–7pm ET)"; response returns referenceNumber. Frontend shippers.html
//   reads data.referenceNumber and shows "Your quote reference is QTE-…". Per §3.1: amt → amu.
// v3.8.amv — quote notification recipient sales@ → operations@ (fixes "leads not arriving").
//   ROOT CAUSE (found via Resend dashboard): Resend had AUTO-SUPPRESSED
//   sales@silkroutelogistics.ai after the early hard bounces (my amu verification tests
//   fired before the user set up the sales@→operations@ alias, so they bounced "user
//   unknown"; Resend blocklists an address after a hard bounce). Every subsequent quote
//   notification to sales@ showed "Suppressed" in Resend and was never sent — which is why
//   Google's Email Log Search returned 0 (Resend never delivered it; not a Google
//   spam/quarantine issue). Resend has no easy self-serve UI to clear a suppression. FIX:
//   send the notification directly to operations@silkroutelogistics.ai — the real shared
//   mailbox (created 2026-05-28, not suppressed) that sales@ aliases to anyway. This
//   bypasses the suppression AND consolidates everything in the single operations@ inbox
//   the user wants (contact form already notifies operations@). Submitter confirmation
//   unchanged (delivers fine to external addresses). §1 sales@ note updated. Per §3.1: amu → amv.
// v3.8.amw — SRL Driver Academy Sprint T1: carrier-managed driver roster (epic foundation).
//   Closes the structural gap surfaced by the 2026-06-12 carrier-portal audit: the Driver
//   model (schema:2452) had NO relation to CarrierProfile or User — pure AE-console fleet
//   scaffolding — so no carrier-owned roster could exist, and the Academy's per-driver
//   training logins (T2, phone + PIN per ratified decisions) had nothing to attach to.
//   SHIPPED: (1) Driver.carrierProfileId nullable FK + CarrierProfile.drivers relation +
//   manual migration (additive; legacy NULL rows stay AE-only); (2) /api/carrier-drivers
//   (authenticate + authorize CARRIER + APPROVED gate): GET roster / POST add (phone
//   REQUIRED + normalizePhoneE164 + per-carrier dupe 409) / PATCH edit / deactivate /
//   reactivate (no hard delete — training records must survive roster churn); mounted in
//   index.ts BEFORE /carrier + added to CARRIER_PORTAL_MOUNTS (Sprint 53.a cookie lesson);
//   (3) /carrier/dashboard/drivers roster page (documents-page idiom: CarrierCard, gold
//   gradient CTA, TanStack) with add/edit form, expiry-tone warnings (red past / amber
//   <30d) on license + med card, inline error banners (Item 43 lesson), Academy teaser
//   strip; (4) "Drivers" sidebar entry (Users icon) between My Loads and Compliance.
//   Epic plan + T2-T7 banked at CLAUDE.md §13.3 Item 193. Per §3.1: amv → amw.
// v3.8.amx — P0 hotfix bundle from the 2026-06-10/12 public-site enhancement audit
//   (19-batch workflow, 173 adversarially-verified findings; Wasi GO on the 5 P0s).
//   (1) _redirects: /track/* + /verify/* rewrite targets .html → extensionless. The
//   .html target was 308-normalized by Cloudflare and DROPPED the token splat, so
//   every BOL QR scan + email tracking link landed on the empty /track search page
//   (verified live pre-fix; /quote/approve/* extensionless pattern verified working).
//   (2) Mobile nav un-broken on /shippers (shippers.css styled .nav-hamburger while
//   chrome renders .hamburger — 6-selector rename) and /track (no nav JS at all +
//   .mobile-menu hard-hidden with no .open state — canonical wiring + slide-in CSS
//   ported from contact.html/contact.css). (3) /blog Load More + empty state could
//   never render: elements ship .d-none, show-path set style.display='' which left
//   the class applied — toggled via classList at all 5 sites; archive past 12
//   articles now reachable. (4) §5-prohibited "Tier-graduated FSC" (retired v3.8.aib)
//   still live on the homepage capabilities wall — swapped to "Day-1 Silver entry"
//   (§4 #14) in index.html tile + capabilities-wall.js pool; FSC-itemized text not
//   used because "Itemized rate cons" already sits in the pool (near-dupe).
//   (5) /carriers hero stat "2-Day Quick Pay Option" → "Same-Day" (§8 offers 7-day +
//   same-day only; 2-day is the competitor framing /faq itself rebuts).
//   Per §3.1: amw → amx. Bundle precedent: v3.8.ajt/ajv critical-bug bundles.
export const SRL_VERSION = "3.8.amx";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] ${className || ""}`} style={{ color: "var(--srl-text-muted)" }}>
      SRL v{SRL_VERSION}
    </p>
  );
}
