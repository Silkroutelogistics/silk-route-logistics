# SRL Defect + Issue Log

Running catalog of known defects, open issues, and
quality concerns. Updated continuously. Lives in git
so it's searchable and never lost.

## Format per entry
- One-line symptom description
- Page / component / file where it lives
- Severity: P0 (prospect-blocking) / P1 (visible but non-blocking) / P2 (cosmetic)
- Status: Open / Investigating / Fixed in <commit>
- Date noted

---

## Open — discovered 2026-04-22 evening

### P2 — "Get a Free Quote" information vague
- Form / section — needs content rewrite
- Unclear what info the prospect provides or what they get back

---

## S6 family — AE Console defects (all P1, pre-existing)

### S6 (parent) — AE Console: some tabs render "super dark"
- Location: Various AE Console tabs (specific labels TBD)
- Symptom: Visual defect, usable but wrong — tabs render with very dark backgrounds that hurt readability
- Severity: P1 visual
- Status: Open, parent-level audit deferred until specific tab labels are enumerated
- Discovered: 2026-04-22

### S6.b — Load Board: "New Load" button non-functional
- Location: AE Console → Load Board tab → "New Load" button
- Symptom: Button click does nothing (silent failure or error — exact behavior TBD in audit)
- Severity: P1 functional defect blocking load creation
- Status: Open, will audit and fix in v3.7.n.8
- Discovered: 2026-04-23

### S6.c — Lane Analytics: runtime crash on undefined .toFixed()
- Location: AE Console → Lane Analytics tab
- Symptom: Error boundary renders "Something went wrong" with stack trace "Cannot read properties of undefined (reading 'toFixed')"
- Secondary issue: Error message text rendered white-on-white, barely visible
- Severity: P1 functional crash + visual defect in error state
- Status: Open, will audit and fix in v3.7.n.9
- Discovered: 2026-04-23

---

## Open — content density concerns (not bugs, design debt)
- Some pages feel long with too much info + extra pictures
- Candidates for trim: TBD (list tomorrow)
- Scope: content editorial, separate from technical defects

## P2 — UX content improvements (tradeoffs to decide during editorial pass)
- Shippers page quote form: "Origin City/State" and "Destination City/State" fields — open question whether to require full address including street + ZIP (higher friction, richer data) or keep city/state (lower friction, faster lead capture). UX tradeoff to decide during editorial pass, not a bug.
- Shippers page "BY THE NUMBERS / Performance That Speaks" section — currently shows only "48 States Covered" with no other stats. Pre-launch, no real operational numbers to report. Editorial decision required: (a) delete section, (b) replace with capability block, (c) replace with credentials block. Do NOT fabricate performance metrics. Defer to Friday/weekend editorial pass.

---

## Fixed — recent

- 2026-04-22 | Compass logo missing on prod BOLs | v3.7.o-build-prep + Render dashboard
- 2026-04-22 | Email signature file-not-found | v3.7.o-build-prep.1 + Render dashboard
- 2026-04-22 | Sign In dropdown Shipper/Carrier labels invisible | v3.7.n.1
- 2026-04-22 | CI feature flag test timeout flaky | v3.7.n.2
- 2026-04-23 | Shippers page content invisible below hero (JS null-dereference on getElementById('hamburgerBtn') halted IIFE) | v3.7.n.3
- 2026-04-23 | Carrier page CTA "Questions?" line invisible (black text on navy-gradient bg) + onboarding email updated accounting@ → carriers@ | v3.7.n.4
- 2026-04-23 | Track page logo rendering at intrinsic PNG dimensions (tracking.html missing srl-logo.css link) | v3.7.n.5
- 2026-04-23 | Track page footer layout collapsed to centered text stack (tracking.css had 2-rule stub; ported full 4-column rules from carriers.css, adapted for navy bg) | v3.7.n.5
- 2026-04-23 | Contact page "Find Us" map: deprecated Google Maps iframe endpoint no longer renders; replaced with static location card + "Open in Google Maps" link | v3.7.n.6
- 2026-04-23 | Lead Hunter Send Outreach modal body text + Cancel button rendering text-slate-400 on dark navy bg (3.2:1 contrast, failed WCAG AA for body text); swapped to text-slate-300 (4.8:1) matching readable-sibling convention | v3.7.n.7

---

## Deferred

- Mobile menu dropdown — not verified post-v3.7.n.1, may share same bug
- AWS Rekognition SDK fallback on prod — biometric verification using hash-based
- BOLTemplate.tsx preview pane visual mismatch with downloaded PDF — honest-label banner shipped in v3.7.o
- security-policy.html does NOT load srl-logo.css, but this is NOT the same bug as S4 on tracking.html. security-policy.html uses its own nav structure + its own 32px logo sizing rule (not the shared .srl-logo-* classes). Page renders correctly as-is. Adding srl-logo.css would be a no-op. Flagged here for future nav-unification phase consideration (converting security-policy.html to use the shared nav partial would be the right tidy-up, but is scope creep for hotfix commits).
- 2026-04-23 | CSV Import modal in Lead Hunter tab: 2 parallel text-slate-400 → text-slate-300 contrast fixes needed (same pattern as S6.a Send Outreach modal, flagged during v3.7.n.7 audit). Defer to follow-up micro-commit; not prospect-blocking, internal AE Console only.
