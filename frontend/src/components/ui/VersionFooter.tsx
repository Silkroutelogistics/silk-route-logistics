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
export const SRL_VERSION = "3.8.d.1";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] ${className || ""}`} style={{ color: "var(--srl-text-muted)" }}>
      SRL v{SRL_VERSION}
    </p>
  );
}
