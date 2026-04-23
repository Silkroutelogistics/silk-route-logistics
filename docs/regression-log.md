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

### P0 — Carrier page: wrong email in "Start your application"
- silkroutelogistics.ai/carriers — "Start your application" section
- Reads "accounting@silkroutelogistics.ai"
- Should read "carrier@silkroutelogistics.ai" (or whatever the correct carrier-onboarding address is)
- Also: "line is way dark" in same section — visual

### P1 — Contact page: Find Us map broken
- silkroutelogistics.ai/contact — map widget not rendering
- Iframe/embed issue likely

### P1 — Track page: logo is halved
- silkroutelogistics.ai/track — logo partially clipped
- CSS width/overflow issue

### P1 — Track page: footer broken
- silkroutelogistics.ai/track — footer layout issue
- Possibly shared site-chrome footer not applying to /track

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

### S6.a — Lead Hunter: email view dark/low-contrast
- Location: AE Console → Lead Hunter tab → click on any email entry to expand/view
- Symptom: Text renders dark-on-dark or very low contrast, hard to read
- Severity: P1 visual defect; content is present but unreadable
- Status: Open, will audit and fix in v3.7.n.7
- Discovered: 2026-04-23

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

---

## Fixed — recent

- 2026-04-22 | Compass logo missing on prod BOLs | v3.7.o-build-prep + Render dashboard
- 2026-04-22 | Email signature file-not-found | v3.7.o-build-prep.1 + Render dashboard
- 2026-04-22 | Sign In dropdown Shipper/Carrier labels invisible | v3.7.n.1
- 2026-04-22 | CI feature flag test timeout flaky | v3.7.n.2
- 2026-04-23 | Shippers page content invisible below hero (JS null-dereference on getElementById('hamburgerBtn') halted IIFE) | v3.7.n.3

---

## Deferred

- Mobile menu dropdown — not verified post-v3.7.n.1, may share same bug
- AWS Rekognition SDK fallback on prod — biometric verification using hash-based
- BOLTemplate.tsx preview pane visual mismatch with downloaded PDF — honest-label banner shipped in v3.7.o
