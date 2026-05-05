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
export const SRL_VERSION = "3.8.vv";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] ${className || ""}`} style={{ color: "var(--srl-text-muted)" }}>
      SRL v{SRL_VERSION}
    </p>
  );
}
