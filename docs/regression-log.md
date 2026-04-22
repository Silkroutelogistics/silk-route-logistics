# SRL Regression + Issue Log

Running catalog of known regressions, issues, and
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

### P0 — Shippers page broken
- silkroutelogistics.ai/shippers — broken (symptom TBD via audit)
- Blocks any shipper prospect clicking through from Apollo outreach

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

### P1 — AE Console: some tabs render "super dark"
- Affected tabs: TBD, list them tomorrow
- Visual regression, usable but wrong

### P2 — "Get a Free Quote" information vague
- Form / section — needs content rewrite
- Unclear what info the prospect provides or what they get back

## Open — content density concerns (not bugs, design debt)
- Some pages feel long with too much info + extra pictures
- Candidates for trim: TBD (list tomorrow)
- Scope: content editorial, separate from technical regressions

---

## Fixed — recent

- 2026-04-22 | Compass logo missing on prod BOLs | v3.7.o-build-prep + Render dashboard
- 2026-04-22 | Email signature file-not-found | v3.7.o-build-prep.1 + Render dashboard
- 2026-04-22 | Sign In dropdown Shipper/Carrier labels invisible | v3.7.n.1
- 2026-04-22 | CI feature flag test timeout flaky | v3.7.n.2

---

## Deferred

- Mobile menu dropdown — not verified post-v3.7.n.1, may share same bug
- AWS Rekognition SDK fallback on prod — biometric verification using hash-based
- BOLTemplate.tsx preview pane visual mismatch with downloaded PDF — honest-label banner shipped in v3.7.o
