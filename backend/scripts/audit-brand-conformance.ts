/**
 * audit-brand-conformance.ts — Static-code scanner for SRL brand-token
 * drift and surface-mode readability failures.
 *
 * Run from repo root or backend/:
 *   cd backend && npx ts-node scripts/audit-brand-conformance.ts
 *
 * Output: markdown report to stdout AND written to
 *   docs/audit-reports/brand-conformance-<ISO-stamp>.md
 *
 * Three passes (v1, 2026-05-03):
 *
 *   Pass 1 — Color literal violations.
 *            Hex literals, rgb()/rgba(), hsl()/hsla(), Tailwind
 *            color utility classes. Compared against canonical
 *            whitelist extracted from
 *            .claude/skills/srl-brand-design/references/tokens.md
 *            and the LEGACY-ALLOWED set explicitly retained per
 *            CLAUDE.md §2.1 (themes.css legacy navy #0D1B2A,
 *            IconTabs dark gold #854F0B, AE Console dark surfaces,
 *            portal canvas #faf9f7).
 *
 *   Pass 2 — Font-family violations.
 *            Non-canonical primary fonts in font-family
 *            declarations and @font-face. Canonical: Playfair
 *            Display (display), DM Sans (body), Georgia (tagline
 *            only), SF Mono (mono).
 *
 *   Pass 3 — Surface-mode contrast violations (MANDATORY in v1).
 *            For each (background-setting selector, child-color
 *            setting selector) pair in the same stylesheet,
 *            compute WCAG relative-luminance contrast ratio.
 *            Catches the /about footer invisible-text class and
 *            the /track navy-on-navy class that screenshots
 *            surfaced 2026-05-03.
 *            <3:1 = P0, 3:1-4.5:1 = P1, >=4.5:1 = pass.
 *
 * Heuristic, not AST. False positives expected. Every finding is
 * a CANDIDATE for manual review, not an automated fix.
 *
 * Triage note: drift detected alone doesn't classify severity.
 * Pass 3 contrast violations <3:1 are P0 (readability failure).
 * Pass 1 / Pass 2 token-drift defaults to P1. Comment-block
 * hex values + canonical hex literals (token-discipline drift,
 * not broken-color drift) classify as P2 informational. Cross-
 * check P1 findings against site-chrome.json — one source-of-
 * truth edit may resolve dozens of downstream findings.
 *
 * Revision log:
 *
 *   v1 (2026-05-03) — initial release with three passes (color
 *           literals, font families, surface-mode contrast).
 *           Documented in Sprint 2 directive.
 *
 *   v2 (2026-05-03) — alpha-overlay handling. Sprint 3 spot-check
 *           confirmed 3 of 5 v1 P0 findings were alpha artifacts
 *           (e.g. `rgba(255,255,255,0.05)` overlay in
 *           `.sidebar-nav a:hover` reported as 1.00:1 white-on-
 *           white when the real rendering composites to ~12:1
 *           white-on-slightly-lifted-navy). v1 stripped alpha and
 *           treated `rgba(R,G,B,α)` as solid `#RRGGBB` for
 *           contrast math; v2 preserves alpha through
 *           `resolveColor()`, then in Pass 3 finds the nearest
 *           opaque ancestor bg and applies standard sRGB
 *           composition (`composited.C = α × overlay.C +
 *           (1 − α) × parent.C`) before computing the contrast
 *           ratio. Same fix applied to fg-with-alpha (rare).
 *           Cascade-inheritance branch also composites the
 *           overlay before checking dark-surface luminance, so
 *           e.g. `rgba(239,68,68,0.10)` over white doesn't
 *           trigger as "dark bg" anymore. Pass 3 summary now
 *           reports `compositedCount` so the operator can see
 *           how many findings benefited from the new logic.
 *
 *           New helpers:
 *             - compositeAlpha(overlayHex, alpha, parentHex)
 *             - findOpaqueParentBg(child, bgRules, fileBodyBg,
 *               globalBodyBg)
 *             - findCascadeBg / buildGlobalCascadeBg (mirror of
 *               the existing color-cascade walkers, for body bg)
 *
 *           Behavior delta: v1 P0 contrast count drops sharply
 *           because the alpha-overlay class is no longer
 *           misclassified. Real readability failures (e.g. solid
 *           gold-on-white .btn-primary, marketing footer cascade)
 *           survive into v2. Sprint 5 P0 sweep is the operational
 *           consumer of v2's reduced output.
 *
 *   v3 (2026-05-04) — three cascade fixes that eliminate the
 *           ~80–100 false-positive class surfaced by the Sprint 5
 *           re-run. Targets:
 *
 *           Fix 1 — Pseudo-class rule cascading. v2's
 *           `isDescendantSelector` returned false for `.X:hover`
 *           vs `.X` (the `:` next-char failed the `[space,>,+,~]`
 *           check), so cascade-inherit walker treated pseudo
 *           rules as standalone — missing the base rule's color:
 *           that browsers cascade through per CSS specificity.
 *           v3 adds `stripPseudoSuffix` + `getAllBaseSelectors`
 *           and extends the cascade-inherit walker's
 *           `hasExplicitColor` check to ALSO consider base
 *           selectors. When base has explicit color, the
 *           pseudo-class rule is treated as having that
 *           inherited color → cascade-inherit finding skipped.
 *
 *           Fix 2 — Multi-mode token resolution. v2's
 *           `buildVarMap` swept all `--token: value;` lines
 *           regardless of selector context, so vars defined
 *           in `[data-mode="dark"]` blocks would overwrite
 *           default-mode values when the dark declaration
 *           appeared later in the file. Defaults like
 *           `--theme-text-heading: #FFFFFF` (dark mode)
 *           leaked into rules like `.export-card h3 { color:
 *           var(--theme-text-heading, #0d1b2a) }` producing
 *           white-on-white false positives. v3 adds
 *           `findDarkModeSkipRanges` (brace-counting walker)
 *           and modifies `buildVarMap` to skip declarations
 *           whose offset falls inside a dark-mode block.
 *           Default-mode rendering is what the scanner
 *           targets (no `data-mode` attribute set on the html
 *           element on silkroutelogistics.ai's public pages),
 *           so dark-mode values shouldn't influence the
 *           resolution.
 *
 *           Fix 3 — HTML cascade hints. v2's `findOpaqueParentBg`
 *           walked `bgRules` ancestors via CSS-selector descent
 *           only. Selectors like `.sidebar-nav` aren't recognized
 *           as descendants of `.sidebar` even though HTML nests
 *           them (`<aside class="sidebar"><nav class="sidebar-
 *           nav">`), so alpha overlays composited over the body
 *           bg fallback instead of the true opaque ancestor.
 *           v3 adds `HTML_CASCADE_HINTS` covering documented
 *           nesting patterns (`.sidebar-` inside `.sidebar`,
 *           `.modal-` inside `.modal`, `.card-` inside `.card`,
 *           `.notif-` inside `.notif-list`, `.action-item-` inside
 *           `.action-list`, `.badge-` inside `.card`, etc.) and
 *           consults them when CSS-selector descent finds no
 *           opaque ancestor. Hint lookup is a fallback — CSS
 *           descent runs first per directive priority.
 *           findOpaqueParentBg now returns a richer
 *           `OpaqueParentResult` with source tag (`css-descent` /
 *           `html-hint` / `file-body` / `global-body` / `default-
 *           white`) for finding-output trail.
 *
 *           Behavior delta: P0 contrast count drops sharply
 *           because the three known false-positive classes are
 *           eliminated. Remaining P0s are real readability
 *           issues — input for Sprint 7 fix sweep.
 *
 *   v4 (2026-05-04) — cross-file bgRules merging. v3's HTML
 *           cascade hints (and CSS-selector descent) only searched
 *           same-file bgRules, so themed selectors in themes.css
 *           (`html[data-mode="dark"] .sidebar-nav a:hover`) couldn't
 *           resolve their opaque parent bg because the parent rule
 *           (`.sidebar { background: var(--theme-sidebar-bg) }`)
 *           lives in console.css. The HTML hint correctly identified
 *           `.sidebar` as the parent class but the same-file lookup
 *           returned no match.
 *
 *           v4 builds a global bgRules index across all CSS files at
 *           Pass 3 startup (`buildGlobalBgRules`) with file
 *           attribution. `findOpaqueParentBg` extends to a 5-tier
 *           lookup chain:
 *             Tier 1 — same-file CSS-selector descent (existing)
 *             Tier 2 — same-file HTML cascade hint (existing)
 *             Tier 3 — global CSS-selector descent (NEW)
 *             Tier 4 — global HTML cascade hint (NEW)
 *             Tier 5 — body bg fallback chain (existing)
 *
 *           Same-file priority preserved so per-file overrides win
 *           when present (per directive confirmation #4). Mode-prefix
 *           stripping applied on both sides of the global match
 *           (`stripModePrefix`) so themed variants resolve to the
 *           canonical parent class regardless of `[data-mode="X"]` /
 *           `[data-theme="X"]` prefix presence.
 *
 *           Ambiguous global matches (multiple files defining the
 *           same selector — e.g., `.sidebar` in console.css and
 *           carrier-console.css with potentially different bg
 *           values) take first-match-wins per directive
 *           confirmation #1, with `ambiguousMatches` count
 *           surfaced in finding-output trail for human triage.
 *
 *           OpaqueParentResult source enum extended with
 *           `global-css-descent` and `global-html-hint`. Trail
 *           additions: `viaFile` for global hits, `ambiguousMatches`
 *           when applicable.
 *
 *           Behavior delta: themed-selector false positives
 *           eliminated when the parent class has an opaque bg rule
 *           anywhere in scope. Pass 3 summary surfaces
 *           `globalMatchCount` and `ambiguousGlobalCount` for
 *           operator visibility.
 *
 *   v5 (2026-05-04) — per-page body-bg context + Tailwind class
 *           resolution on .tsx components. Closes the two
 *           structural false-positive classes documented in Sprint
 *           8 Phase C analysis.
 *
 *           Fix 1 — Per-page body-bg context. v4's body-bg fallback
 *           used a single global value (whichever CSS file in walk
 *           order first declared `body { background }`). For the
 *           SRL repo this lands on a marketing-page `#FFFFFF`,
 *           which is wrong for any CSS file that's actually loaded
 *           by a non-marketing page. Carrier-portal `tools.css`
 *           widget findings composited over `#FFFFFF` produced
 *           2.56:1 P0s; real rendering composites over carrier-
 *           portal navy bg → ~6:1 PASS.
 *
 *           v5 adds `buildPageBgContext(htmlFiles, cssFiles, vars)`:
 *           walks `frontend/public/**\/*.html`, parses
 *           `<link rel="stylesheet" href="...">` tags, finds the
 *           effective body bg by walking loaded CSS files in
 *           order, builds `Map<cssFilePath, PageBgContextEntry>`.
 *           `findOpaqueParentBg` extends to a 7-tier lookup chain
 *           (Tier 5 NEW): Tier 1-2 same-file → Tier 3-4 global
 *           cross-file → **Tier 5 page-context body bg** → Tier 6
 *           file-body → Tier 7 global-body → Tier 8 default white.
 *
 *           Per Sprint 9 directive confirmation #4: first walk-
 *           order match wins on multi-page conflicts; conflicts
 *           count surfaced for triage.
 *           OpaqueParentResult source enum extended with
 *           `page-context-body`. New trail field: `viaHtml` for the
 *           HTML page that supplied the body bg.
 *
 *           Fix 2 — Tailwind class resolution on .tsx. v4's Pass 3
 *           only iterated `.css` files. React components using
 *           Tailwind utility classes for bg/fg pairs (Lead Hunter
 *           modal, /track, dashboard pages) were invisible to
 *           contrast detection. Pass 1 flagged non-canonical
 *           palettes but didn't compute actual contrast.
 *
 *           v5 adds `TAILWIND_PALETTES` (14 palettes × 11 shades =
 *           154 entries + white/black) per directive confirmation
 *           #1, plus `resolveTailwindClass()` to map a single
 *           utility-class token → hex (with alpha for opacity
 *           suffix patterns like `text-white/80`, with arbitrary-
 *           value support for `bg-[#0A2540]`). New `pass3Tailwind`
 *           function:
 *             - Extracts className expressions from .tsx files
 *               (static "..." / '...' / `...` template literals
 *               WITHOUT `${...}` interpolation per directive
 *               confirmation #3).
 *             - Tokenizes on whitespace, groups by pseudo-variant
 *               prefix (base / hover / focus / active per directive
 *               confirmation #2 — sm:/md:/lg:/dark: variants
 *               deferred to v6).
 *             - For each variant group with both `text-*` AND
 *               `bg-*` resolved tokens, computes WCAG contrast and
 *               emits findings using same P0/P1/P2 buckets as the
 *               CSS pass.
 *             - Files with dynamic `${...}` className interpolation
 *               are logged once per file as
 *               `dynamicSkippedFiles` for human triage.
 *
 *           v5 simplifications: same-element pairing only (parent-
 *           child JSX walking deferred to v6); composite alpha-
 *           overlay text/bg against `#FFFFFF` default parent (no
 *           JSX tree walk to resolve actual ancestor).
 *
 *           Behavior delta: scanner now covers BOTH CSS files AND
 *           React/Tailwind components. Trusted baseline established
 *           for sitewide contrast detection across all surfaces.
 *
 *   v6 (2026-05-04) — JSX tree walking for parent-child element
 *           contrast. Closes the ~320 false-positive class
 *           surfaced by Sprint 10's Phase A inspection: Tailwind
 *           translucent overlays (`bg-white/5`, `bg-black/40`,
 *           `bg-white/10`) are reported by v5 as 1.05:1 white-on-
 *           white because v5 composites the overlay against
 *           `#FFFFFF` default parent (no JSX walking). Real
 *           rendering: the JSX ancestor element (often
 *           `<div className="bg-[#0f172a]">` for /track or
 *           dashboard pages) supplies an opaque dark navy bg, and
 *           the translucent overlay composites to a slightly-lifted
 *           navy → contrast against text-white is ~14:1 PASS.
 *
 *           v6 introduces a stack-based regex JSX walker (no AST
 *           dep per directive confirmation #4) that builds a per-
 *           file element tree at Pass 3 startup
 *           (`buildJsxElementStack`). Walker handles: self-closing
 *           tags, fragments (`<>` / `</>`), HTML tags vs React
 *           components (capitalized first char), clsx()/cn()
 *           helper unwrapping (string-literal args extracted),
 *           dynamic interpolation `${...}` skipped per directive
 *           confirmation #3 (file noted in dynamicSkippedFiles),
 *           multi-line className expressions, brace-depth tracking
 *           for nested ternaries.
 *
 *           `findAncestorBg(elementIndex, elements, counter)`
 *           walks the parentIndex chain and returns the first
 *           ancestor with a `bg-*` resolved class. When walking
 *           past a capitalized-tag (component) ancestor without
 *           bg-*, increments `crossFileBoundaryCount` because the
 *           component's actual rendered bg lives in a different
 *           file (deferred to v7 — cross-file component
 *           composition).
 *
 *           pass3Tailwind refactored to two cases:
 *             Case 1 — same-element bg+text pair (existing v5
 *               path). When bg has α<1, NEW: composite against
 *               findAncestorBg result (not #FFFFFF default).
 *               Increments `ancestorBgFiringCount` when the
 *               ancestor lookup fires and changes the parent bg
 *               from default white to the JSX ancestor.
 *             Case 2 — orphan text-* element with no same-element
 *               bg-* (NEW v6 path). Pair against findAncestorBg
 *               result. Increments `orphanTextFiringCount`. Closes
 *               the dashboard-page pattern where `<h2 className="
 *               text-white">` sits inside `<div className="
 *               bg-[#0A2540]">` two levels up.
 *
 *           Counters surfaced in summary:
 *             - tailwindAncestorBgFiringCount
 *             - tailwindOrphanTextFiringCount
 *             - tailwindCrossFileBoundaryCount
 *
 *           Behavior delta: Sprint 10 baseline 571 P0s expected
 *           to drop sharply because the dashboard-page +
 *           public-tracking translucent-overlay class is no
 *           longer misclassified. Surviving P0s are real
 *           readability issues — input for Sprint 12 fix sweep.
 *
 *   v7 (2026-05-04) — translucent-ancestor recursion in
 *           findAncestorBg. Closes the ~729 false-positive class
 *           identified in Sprint 11 Phase C analysis: text sits
 *           inside translucent overlay (`bg-white/5`) which
 *           itself sits inside opaque dark ancestor
 *           (`bg-[#0f172a]` or `bg-navy` two levels up). v6's
 *           findAncestorBg returned the FIRST bg-* ancestor
 *           (which was translucent) and the caller's
 *           simplification composited that translucent value
 *           against `#FFFFFF` default → reported white-on-white
 *           1.00:1 P0. Real rendering composites overlay on
 *           dark navy → ~14:1 high contrast.
 *
 *           v7 makes findAncestorBg recursive: when the first
 *           bg-* ancestor has α<1, recurse on that ancestor's
 *           parentIndex to find what it composites against.
 *           Build stack of overlays as recursion proceeds. When
 *           opaque ancestor (or fallback `#FFFFFF`) is reached,
 *           composite stack from innermost outward via
 *           successive `compositeAlpha()` calls. Return type
 *           simplified — `alpha?` field dropped (always opaque
 *           after v7); new fields `stack`, `baseHex`,
 *           `fellThroughToBody`, `depthExceeded` carry the trail
 *           data for finding-output transparency.
 *
 *           Recursion capped at MAX_ANCESTOR_BG_DEPTH = 5
 *           (defensive — real JSX rarely exceeds 2-3 levels of
 *           nested translucency). Falls back to `#FFFFFF` when:
 *           (a) recursion hits root with no opaque bg-* found in
 *           lexical chain, OR (b) depth cap exceeded. Both cases
 *           set `fellThroughToBody = true` and the latter sets
 *           `depthExceeded = true`.
 *
 *           Both pass3Tailwind callers (Case 1 same-element bg+
 *           text pair, Case 2 orphan text-*) simplify — the v6
 *           "if anc.alpha < 1, composite against #FFFFFF"
 *           conditional is gone. Single expression `bg = anc.hex`
 *           because v7 guarantees opacity.
 *
 *           Stack trail format in finding output:
 *             "ancestor stack: <div> α=0.05 #FFFFFF →
 *              <div> α=0.40 #000000 → #0F172A composited:
 *              <final-hex> (depth=2)"
 *           — outermost (closest to viewer) first, base last.
 *
 *           Counters surfaced in summary:
 *             - tailwindRecursionFiringCount (≥1 stack layer)
 *             - tailwindRecursionDepthHistogram (depth=1, depth=2, …)
 *             - tailwindFellThroughToBodyCount (#FFFFFF default base)
 *             - tailwindDepthExceededCount (cap hit)
 *
 *           Tailwind path note: page-context body bg fallback
 *           (CSS pass v5 feature) is NOT available here because
 *           .tsx files don't lexically link CSS via
 *           `<link rel="stylesheet">`. Next.js app-router pages
 *           inherit body bg from layout.tsx cascade. Resolving
 *           that requires traversing the app-router layout tree
 *           per page — v8 candidate alongside cross-file
 *           component composition.
 *
 *           Behavior delta: Sprint 11 baseline 1,627 P0s
 *           expected to drop sharply (~729 V7-FP retired).
 *           Surviving P0s are the trusted-baseline real
 *           readability issues for final CSS + Tailwind sweeps.
 *
 *   v8 (2026-05-04) — app-router layout.tsx body-bg resolution
 *           for Tailwind path. Closes the v7 fall-through class
 *           (Sprint 12: 1,188 of 1,382 recursive stacks fell
 *           through to #FFFFFF default because the .tsx file
 *           contained no opaque bg-* anywhere in its lexical
 *           chain). Real rendering inherits body bg from the
 *           Next.js app-router layout cascade (e.g. /dashboard/*
 *           pages render against app/dashboard/layout.tsx's
 *           outermost wrapper bg).
 *
 *           v8 introduces:
 *             - LayoutBgContextEntry — per-layout-file record
 *               with route prefix, raw bg value, resolved hex,
 *               and source ("tailwind-class" | "inline-style-
 *               literal" | "inline-style-var")
 *             - buildLayoutBgContext(tsxFiles, vars) — walks
 *               app/**\/layout.tsx files, resolves bg from
 *               either:
 *                 (1) inline `style={{ background: '...' }}`
 *                     via regex + reuse of resolveColor() for
 *                     var(--name) and rgb/rgba/hex literals
 *                 (2) outermost element's className with bg-*
 *                     token via existing resolveTailwindClass()
 *               First match wins. Files with no resolvable bg
 *               are absent from the map (longest-prefix lookup
 *               falls through).
 *             - deriveRoutePrefix(layoutFile) — converts file
 *               path to route prefix (app/dashboard/layout.tsx
 *               → /dashboard, app/layout.tsx → /)
 *             - findLayoutBgForPage(pageFile, layoutBgContext)
 *               — longest-prefix match returning the most-
 *               specific layout entry for a given page
 *             - findAncestorBg() extended with layoutFallback
 *               parameter; recursion's null-inner branch and
 *               outermost walk's empty-result branch use the
 *               layout-resolved bg in place of #FFFFFF default
 *             - findAncestorBg() returns a SYNTHETIC layout-
 *               fallback ancestor at depth=0 when the JSX walk
 *               completes empty but a layout fallback is
 *               available — Case 2 orphan-text findings now
 *               emit instead of skipping (the v7 `if (!anc)
 *               continue` path)
 *
 *           Layout cascade per Next.js semantics: child layouts
 *           override parent. Longest-prefix-wins on lookup so
 *           /dashboard/loads/page.tsx finds /dashboard's layout
 *           rather than /'s.
 *
 *           Important light-mode semantic: `--srl-bg-base` in
 *           globals.css resolves to `#F5F3EF` (light cream)
 *           by default (`:root, [data-mode="light"]`); only
 *           resolves to `#0F1117` (dark navy) when
 *           `[data-mode="dark"]` attribute is set. Per the
 *           existing v3 default-mode convention, scanner
 *           targets default rendering (no data-mode set),
 *           so dashboard/accounting/admin pages now correctly
 *           composite against light cream. Many `text-white`
 *           findings on these pages are GENUINE readability
 *           bugs in light mode — v8 SURFACES them rather than
 *           retires them, which is correct semantic.
 *
 *           Counters surfaced in summary:
 *             - layoutBgContextSize (number of layouts registered)
 *             - layoutBgContextEntries (full list with route
 *               prefix → resolved hex → source for transparency)
 *             - tailwindLayoutFallbackFiringCount (how often a
 *               page used the layout fallback)
 *             - tailwindLayoutPrefixHistogram (which prefixes
 *               supplied the fallback — usage distribution)
 *             - tailwindLayoutNotFoundCount (files with no
 *               matching layout — outside app/ OR no layout.tsx
 *               in the route segment chain)
 *
 *           Trail format extension:
 *             "ancestor stack: <div> α=0.05 #FFFFFF →
 *              #F5F3EF (layout fallback) composited:
 *              <final-hex> (depth=1) · layout: /dashboard
 *              (inline-style-var) bg=var(--srl-bg-base)→#F5F3EF"
 *
 *           v8 simplifications (acceptable):
 *             - String-literal classNames + style values only;
 *               no template-literal interpolation (consistent
 *               with rest of scanner)
 *             - First-bg-ancestor wins on layout outermost
 *               element (conditional rendering uses first
 *               branch literal)
 *             - No cross-file component import resolution
 *               (defer to v9 — `<DashboardShell>` wrapping
 *               component currently not present in repo)
 *             - Globals.css `body { background }` not consulted
 *               (out of scope for v8; layouts cover the cases
 *               that matter)
 *             - Translucent layout outermost bg composited
 *               against #FFFFFF (rare; v9 candidate to recurse)
 *
 *           Behavior delta vs Sprint 12 v7 baseline: P0 expected
 *           to MOVE rather than reduce sharply. v7's #FFFFFF
 *           default fall-through misclassified some text-white
 *           cases AS pass-through P0s (1.00:1 white-on-white)
 *           that are still P0 against #F5F3EF light cream
 *           (1.00:1 white-on-cream — both fail). The v7 P0
 *           count was correct in CLASSIFICATION, but the
 *           composition trail is now accurate. v8 also
 *           SURFACES previously-skipped Case 2 orphan-text
 *           findings (v7's `if (!anc) continue`), expected to
 *           ADD findings net. Real-world P0 may go UP, not
 *           down, on this commit — that's correct semantic.
 *
 * v9 candidates deferred from this scope:
 *   - Cross-file React component composition (resolve `<Card>`,
 *     `<Modal>`, `<DashboardShell>` ancestor bg by walking the
 *     component's own file — would require multi-file element
 *     tree merging at component-boundary; currently scanner
 *     walks past components and increments
 *     crossFileBoundaryCount)
 *   - Globals.css body styling consultation (when layout.tsx
 *     has no bg but globals.css sets one — currently skipped
 *     for v8 simplicity)
 *   - sm:/md:/lg:/xl:/2xl: responsive variant evaluation
 *   - dark: variant evaluation against the dark-mode body bg
 *   - State-driven conditional className branches (ternary
 *     inside clsx args — currently first-string-literal-wins)
 *   - Full AST parsing (typescript / @babel/parser) — would
 *     resolve clsx/cn helpers with arbitrary call signatures
 *     and spread arguments correctly, plus enable type-aware
 *     analysis
 *   - CSS-in-JS dynamic styles (styled-components / emotion /
 *     not currently used in repo)
 *   - @media query rules
 *   - pseudo-element styling (::before, ::after)
 *   - PDF template colors (backend/src/services/pdfService.ts)
 *     — out of frontend scope per Sprint 2 directive
 *   - orphan-CSS detection (Sprint 3 spot-check 2 found
 *     `tracking.css` is dead code post-v3.8.q routing
 *     consolidation — scanner doesn't yet flag CSS files with
 *     zero HTML/TSX consumers)
 *   - Memoized cache for findAncestorBg results per element
 *     index (currently O(N×depth) but N×depth is small in
 *     practice; add only if smoke shows runtime regression)
 *   - Translucent layout outermost bg recursion (when
 *     layout.tsx outermost wrapper itself has α<1, currently
 *     composited against #FFFFFF — should recurse parent
 *     layout per cascade)
 *   - Dark-mode opt-in flag (run scanner in [data-mode="dark"]
 *     posture against dashboard pages — would let users
 *     verify dark-mode rendering separately from default
 *     light-mode rendering)
 */

import * as fs from "fs";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../..");
const FRONTEND_PUBLIC = path.join(REPO_ROOT, "frontend/public");
const FRONTEND_SRC = path.join(REPO_ROOT, "frontend/src");
const SITE_CHROME_JSON = path.join(REPO_ROOT, "frontend/src/lib/site-chrome.json");
const REPORT_DIR = path.join(REPO_ROOT, "docs/audit-reports");

// Canonical hex set — all values from tokens.md normalized to UPPERCASE.
const CANONICAL_HEX: Set<string> = new Set([
  // Navy 10-stop
  "#061629", "#0A2540", "#15365A", "#234A73", "#355E8A",
  "#5B7EA3", "#8AA5C0", "#BECEDE", "#E2EAF2",
  // Gold 4-stop
  "#C5A572", "#BA7517", "#DAC39C", "#FAEEDA",
  // Cream/surface (white serves as print canvas + web card elevation)
  "#FBF7F0", "#F5EEE0", "#EFE6D3", "#FFFFFF",
  // Foreground (--fg-1 #0A2540 already in navy set; --fg-on-navy #FBF7F0 in cream set)
  "#3A4A5F", "#6B7685", "#A7AEB8", "#C9D2DE",
  // Status pairs
  "#2F7A4F", "#E6F0E9", "#B07A1A", "#FBEFD4",
  "#9B2C2C", "#F6E3E3", "#2A5B8B",
  // Black is allowed for text shadow / pure-black contexts only — leaving
  // out so it surfaces; reviewer can suppress per-case.
]);

// LEGACY-ALLOWED — explicitly retained per CLAUDE.md §2.1 LEGACY block.
// Listed here so they don't pollute Pass 1 P1 noise. Migration to
// canonical tokens is tracked separately under Phase 6 — Theme System
// Cleanup.
const LEGACY_ALLOWED_HEX: Set<string> = new Set([
  "#0D1B2A",  // themes.css light-default navy (CLAUDE.md §2.1)
  "#854F0B",  // IconTabs + ContactsPanel dark gold (§2.1)
  "#0F1117", "#1A1A2E", "#0A1220",  // AE Console dark surfaces
  "#FAF9F7",  // portal canvas
  "#1A2D45",  // doc-header gradient stop (paired with #0D1B2A)
  "#C8A951", "#C8963E", "#B8862E", "#8B7535", "#B8963E",  // legacy gold
  "#F0F4F8", "#7A9BB8", "#8A9DB0",  // doc-header text
  "#0F1E30",  // login-dropdown legacy
]);

// rgba()/hsla() base-color triples (R,G,B) that are canonical regardless
// of alpha. Stored as comma-joined triples (whitespace-collapsed).
const CANONICAL_RGBA_BASES: Set<string> = new Set([
  "10,37,64",      // navy --bg-navy (#0A2540)
  "251,247,240",   // cream --fg-on-navy (#FBF7F0)
  "197,165,114",   // gold focus ring (#C5A572)
]);

// Canonical font primary names (the FIRST entry in font-family stacks).
const CANONICAL_FONTS: Set<string> = new Set([
  "Playfair Display",
  "DM Sans",
  "Georgia",
  "SF Mono",
]);

// Legitimate fallback names that may appear after the canonical primary
// in a font-family stack. Not flagged.
const FALLBACK_FONTS: Set<string> = new Set([
  "-apple-system", "BlinkMacSystemFont", "system-ui",
  "sans-serif", "serif", "monospace", "ui-sans-serif", "ui-serif",
  "ui-monospace", "Times New Roman", "Times", "Menlo", "Consolas",
  "Courier New", "Courier", "Helvetica", "Arial",
  "Lucide", // icon font
]);

// Tailwind palette names that are NOT canonical SRL — flag any utility
// class that uses these prefixes.
const NON_CANONICAL_TW_PALETTES: Set<string> = new Set([
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
  "fuchsia", "pink", "rose",
  "black", "white",  // utility variants like bg-black/50 are still flagged
]);

// Tailwind color utility class regex.
// Matches: bg-{palette}-{shade}, text-{palette}-{shade}, etc.
const TW_COLOR_CLASS_RE =
  /\b(bg|text|border|fill|stroke|ring|outline|divide|placeholder|caret|accent|from|via|to)-([a-z]+)(?:-([0-9]{2,3}))?(?:\/[0-9]+)?\b/g;

// v5 — Tailwind palette map for Pass 3 contrast resolution on .tsx
// React components. Covers all 14 standard color palettes × 11 shades
// (50–950) per Sprint 9 directive confirmation #1 ("include all 14 for
// completeness — costs ~150 lines of map data, eliminates need for
// grep-then-extend"). Plus white / black for non-shaded variants.
const TAILWIND_PALETTES: { [palette: string]: { [shade: string]: string } } = {
  slate:    { "50": "#F8FAFC", "100": "#F1F5F9", "200": "#E2E8F0", "300": "#CBD5E1", "400": "#94A3B8", "500": "#64748B", "600": "#475569", "700": "#334155", "800": "#1E293B", "900": "#0F172A", "950": "#020617" },
  gray:     { "50": "#F9FAFB", "100": "#F3F4F6", "200": "#E5E7EB", "300": "#D1D5DB", "400": "#9CA3AF", "500": "#6B7280", "600": "#4B5563", "700": "#374151", "800": "#1F2937", "900": "#111827", "950": "#030712" },
  zinc:     { "50": "#FAFAFA", "100": "#F4F4F5", "200": "#E4E4E7", "300": "#D4D4D8", "400": "#A1A1AA", "500": "#71717A", "600": "#52525B", "700": "#3F3F46", "800": "#27272A", "900": "#18181B", "950": "#09090B" },
  stone:    { "50": "#FAFAF9", "100": "#F5F5F4", "200": "#E7E5E4", "300": "#D6D3D1", "400": "#A8A29E", "500": "#78716C", "600": "#57534E", "700": "#44403C", "800": "#292524", "900": "#1C1917", "950": "#0C0A09" },
  neutral:  { "50": "#FAFAFA", "100": "#F5F5F5", "200": "#E5E5E5", "300": "#D4D4D4", "400": "#A3A3A3", "500": "#737373", "600": "#525252", "700": "#404040", "800": "#262626", "900": "#171717", "950": "#0A0A0A" },
  red:      { "50": "#FEF2F2", "100": "#FEE2E2", "200": "#FECACA", "300": "#FCA5A5", "400": "#F87171", "500": "#EF4444", "600": "#DC2626", "700": "#B91C1C", "800": "#991B1B", "900": "#7F1D1D", "950": "#450A0A" },
  orange:   { "50": "#FFF7ED", "100": "#FFEDD5", "200": "#FED7AA", "300": "#FDBA74", "400": "#FB923C", "500": "#F97316", "600": "#EA580C", "700": "#C2410C", "800": "#9A3412", "900": "#7C2D12", "950": "#431407" },
  amber:    { "50": "#FFFBEB", "100": "#FEF3C7", "200": "#FDE68A", "300": "#FCD34D", "400": "#FBBF24", "500": "#F59E0B", "600": "#D97706", "700": "#B45309", "800": "#92400E", "900": "#78350F", "950": "#451A03" },
  yellow:   { "50": "#FEFCE8", "100": "#FEF9C3", "200": "#FEF08A", "300": "#FDE047", "400": "#FACC15", "500": "#EAB308", "600": "#CA8A04", "700": "#A16207", "800": "#854D0E", "900": "#713F12", "950": "#422006" },
  green:    { "50": "#F0FDF4", "100": "#DCFCE7", "200": "#BBF7D0", "300": "#86EFAC", "400": "#4ADE80", "500": "#22C55E", "600": "#16A34A", "700": "#15803D", "800": "#166534", "900": "#14532D", "950": "#052E16" },
  emerald:  { "50": "#ECFDF5", "100": "#D1FAE5", "200": "#A7F3D0", "300": "#6EE7B7", "400": "#34D399", "500": "#10B981", "600": "#059669", "700": "#047857", "800": "#065F46", "900": "#064E3B", "950": "#022C22" },
  blue:     { "50": "#EFF6FF", "100": "#DBEAFE", "200": "#BFDBFE", "300": "#93C5FD", "400": "#60A5FA", "500": "#3B82F6", "600": "#2563EB", "700": "#1D4ED8", "800": "#1E40AF", "900": "#1E3A8A", "950": "#172554" },
  indigo:   { "50": "#EEF2FF", "100": "#E0E7FF", "200": "#C7D2FE", "300": "#A5B4FC", "400": "#818CF8", "500": "#6366F1", "600": "#4F46E5", "700": "#4338CA", "800": "#3730A3", "900": "#312E81", "950": "#1E1B4B" },
  violet:   { "50": "#F5F3FF", "100": "#EDE9FE", "200": "#DDD6FE", "300": "#C4B5FD", "400": "#A78BFA", "500": "#8B5CF6", "600": "#7C3AED", "700": "#6D28D9", "800": "#5B21B6", "900": "#4C1D95", "950": "#2E1065" },
};
const TAILWIND_SPECIAL: { [name: string]: string } = {
  "white": "#FFFFFF",
  "black": "#000000",
};

// v5 — Resolve a Tailwind utility class token (e.g. `text-slate-400`,
// `bg-white`, `bg-[#0A2540]`, `text-white/80`) to a hex value plus
// optional alpha. Returns null if the token can't be resolved (unknown
// palette, dynamic interpolation, non-color utility). The kind
// (`bg` / `text`) is returned alongside hex so callers can pair on the
// same JSX element.
function resolveTailwindClass(token: string): { kind: "bg" | "text"; hex: string; alpha?: number; raw: string } | null {
  // Strip arbitrary-opacity suffix (e.g. text-white/80 → text-white α=0.8)
  let cls = token;
  let alpha: number | undefined;
  const opacityMatch = cls.match(/^(.+?)\/(\d+)$/);
  if (opacityMatch) {
    cls = opacityMatch[1];
    alpha = Math.max(0, Math.min(100, parseInt(opacityMatch[2], 10))) / 100;
  }
  // Arbitrary value: text-[#FF0000] / bg-[#0A2540]
  const arbMatch = cls.match(/^(text|bg)-\[(#[0-9A-Fa-f]{3,8})\]$/);
  if (arbMatch) {
    return { kind: arbMatch[1] as "bg" | "text", hex: normHex(arbMatch[2]), alpha, raw: token };
  }
  // Standard format: text-{palette}-{shade} OR text-white / text-black
  const stdMatch = cls.match(/^(text|bg)-([a-z]+)(?:-(\d+))?$/);
  if (!stdMatch) return null;
  const kind = stdMatch[1] as "bg" | "text";
  const palette = stdMatch[2];
  const shade = stdMatch[3];
  if (!shade && TAILWIND_SPECIAL[palette] !== undefined) {
    return { kind, hex: TAILWIND_SPECIAL[palette], alpha, raw: token };
  }
  if (shade && TAILWIND_PALETTES[palette] && TAILWIND_PALETTES[palette][shade]) {
    return { kind, hex: TAILWIND_PALETTES[palette][shade], alpha, raw: token };
  }
  return null;
}

// ─── Shared helpers ────────────────────────────────────────────────────

function walkFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        stack.push(full);
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  }
  return out;
}

function readFile(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function relPath(file: string): string {
  return path.relative(REPO_ROOT, file).replace(/\\/g, "/");
}

function normHex(hex: string): string {
  // Normalize to #RRGGBB uppercase. Accepts #RGB, #RRGGBB, #RRGGBBAA.
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (h.length === 8) {
    // Drop alpha for canonical comparison.
    return `#${h.slice(0, 6)}`.toUpperCase();
  }
  return `#${h}`.toUpperCase();
}

function isCanonicalHex(hex: string): boolean {
  return CANONICAL_HEX.has(normHex(hex));
}

function isLegacyHex(hex: string): boolean {
  return LEGACY_ALLOWED_HEX.has(normHex(hex));
}

// Strip multi-line block comments and single-line // comments from a
// string. Used to skip color literals in comments. Pragmatic, not a
// full CSS parser.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Detect whether the line index sits inside a /* ... */ block within
// the original source. Used by per-line passes that work on .split('\n').
function lineInBlockComment(lines: string[], lineIdx: number): boolean {
  let inside = false;
  for (let i = 0; i <= lineIdx; i++) {
    const line = lines[i];
    let j = 0;
    while (j < line.length) {
      if (!inside && line[j] === "/" && line[j + 1] === "*") {
        inside = true; j += 2; continue;
      }
      if (inside && line[j] === "*" && line[j + 1] === "/") {
        inside = false; j += 2; continue;
      }
      j++;
    }
    if (i === lineIdx) return inside || /^\s*\/\//.test(line);
  }
  return false;
}

// ─── WCAG contrast math (hand-rolled, no deps) ──────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6 || h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

// v2 — Composite an alpha overlay over an opaque parent in sRGB space.
// Uses straight-alpha (CSS-standard) compositing per A3 formula:
//   composited.C = α × overlay.C + (1 − α) × parent.C
// Returns #RRGGBB. Caller must guarantee the parent is opaque; nested
// transparency must be resolved by walking up the cascade first.
function compositeAlpha(overlayHex: string, alpha: number, parentHex: string): string {
  const o = hexToRgb(overlayHex);
  const p = hexToRgb(parentHex);
  if (!o || !p) return overlayHex;
  const a = Math.max(0, Math.min(1, alpha));
  const c = [0, 1, 2].map((i) => Math.round(a * o[i] + (1 - a) * p[i]));
  return `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

// ─── Pass 1: Color literal violations ──────────────────────────────────

type Severity = "P0" | "P1" | "P2";

interface ColorFinding {
  file: string;
  line: number;
  match: string;
  severity: Severity;
  reason: string;
  closest?: string;
}

function classifyHex(hex: string, isComment: boolean): { severity: Severity; reason: string } | null {
  if (isComment) return { severity: "P2", reason: "hex value in comment block (informational)" };
  const norm = normHex(hex);
  if (isCanonicalHex(norm)) {
    return { severity: "P2", reason: "canonical hex literal — token-discipline drift (use var(--token) instead)" };
  }
  if (isLegacyHex(norm)) return null; // allowed per CLAUDE.md §2.1
  return { severity: "P1", reason: "non-canonical hex literal — not in tokens.md whitelist or LEGACY-ALLOWED" };
}

function classifyRgba(triple: string, alpha: string | null, isComment: boolean): { severity: Severity; reason: string } | null {
  if (isComment) return { severity: "P2", reason: "rgba/hsla in comment block (informational)" };
  const norm = triple.replace(/\s+/g, "");
  if (CANONICAL_RGBA_BASES.has(norm)) return null; // canonical alpha-on-token
  return { severity: "P1", reason: `non-canonical rgba/hsla base (${norm})${alpha ? ` alpha=${alpha}` : ""}` };
}

function pass1Color(files: string[]): ColorFinding[] {
  const findings: ColorFinding[] = [];
  const hexRe = /#[0-9A-Fa-f]{8}\b|#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g;
  const rgbaRe = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)/g;

  for (const file of files) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const inComment = lineInBlockComment(lines, i);

      // Hex literals
      let m: RegExpExecArray | null;
      hexRe.lastIndex = 0;
      while ((m = hexRe.exec(line)) !== null) {
        const c = classifyHex(m[0], inComment);
        if (c) findings.push({ file, line: i + 1, match: m[0], severity: c.severity, reason: c.reason });
      }

      // rgb/rgba/hsla
      rgbaRe.lastIndex = 0;
      while ((m = rgbaRe.exec(line)) !== null) {
        const triple = `${m[1]},${m[2]},${m[3]}`;
        const c = classifyRgba(triple, m[4] || null, inComment);
        if (c) findings.push({ file, line: i + 1, match: m[0], severity: c.severity, reason: c.reason });
      }

      // Tailwind utility classes (only relevant in .tsx / .ts / .html files
      // that include className= or class= contexts). Pragmatic: scan all
      // lines, but only report when preceded by className= / class=.
      if (/\b(className|class)\s*=/.test(line) || /\bclassName\s*=/.test(line)) {
        TW_COLOR_CLASS_RE.lastIndex = 0;
        while ((m = TW_COLOR_CLASS_RE.exec(line)) !== null) {
          const palette = m[2];
          if (NON_CANONICAL_TW_PALETTES.has(palette)) {
            findings.push({
              file, line: i + 1, match: m[0],
              severity: "P1",
              reason: `Tailwind utility uses non-canonical palette "${palette}" — should use SRL token (bg-navy, text-fg-1, etc.)`,
            });
          }
        }
      }
    }
  }
  return findings;
}

// ─── Pass 2: Font family violations ─────────────────────────────────────

interface FontFinding {
  file: string;
  line: number;
  match: string;
  severity: Severity;
  reason: string;
}

function pass2Fonts(files: string[]): FontFinding[] {
  const findings: FontFinding[] = [];
  const ffRe = /font-family\s*:\s*([^;{}]+)/gi;
  const fontFaceRe = /@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^'";\s]+)/gi;
  const importRe = /@import\s+url\s*\(\s*['"][^'"]*family=([^'":&)]+)/gi;

  for (const file of files) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const inComment = lineInBlockComment(lines, i);
      if (inComment) continue;

      // font-family declarations
      let m: RegExpExecArray | null;
      ffRe.lastIndex = 0;
      while ((m = ffRe.exec(line)) !== null) {
        const stack = m[1].trim();
        // Take the first font in the stack (strip quotes + whitespace).
        const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
        if (CANONICAL_FONTS.has(first)) continue;
        if (FALLBACK_FONTS.has(first)) continue;
        // Allow var(--font-...) which delegates to a token-defined stack.
        if (/^var\(/.test(first)) continue;
        // Inherit / initial / unset are allowed.
        if (/^(inherit|initial|unset|revert)$/.test(first)) continue;

        findings.push({
          file, line: i + 1, match: stack.slice(0, 80),
          severity: "P1",
          reason: `non-canonical primary font "${first}" — canonical: Playfair Display / DM Sans / Georgia / SF Mono`,
        });
      }

      // @import url(...family=...) — fonts loaded from Google Fonts
      importRe.lastIndex = 0;
      while ((m = importRe.exec(line)) !== null) {
        const fam = decodeURIComponent(m[1]).replace(/\+/g, " ");
        if (CANONICAL_FONTS.has(fam)) continue;
        findings.push({
          file, line: i + 1, match: `@import family=${fam}`,
          severity: "P1",
          reason: `non-canonical Google Font import "${fam}"`,
        });
      }
    }

    // @font-face declarations (multi-line)
    fontFaceRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = fontFaceRe.exec(content)) !== null) {
      const fam = m[1];
      if (CANONICAL_FONTS.has(fam)) continue;
      const lineIdx = content.slice(0, m.index).split("\n").length;
      findings.push({
        file, line: lineIdx, match: `@font-face ${fam}`,
        severity: "P1",
        reason: `non-canonical @font-face declaration "${fam}"`,
      });
    }
  }
  return findings;
}

// ─── Pass 3: Surface-mode contrast ──────────────────────────────────────

interface ContrastFinding {
  file: string;
  selector: string;
  background: string;
  foreground: string;
  ratio: number;
  severity: Severity;
  note: string;
}

interface UnresolvedFinding {
  file: string;
  selector: string;
  property: "background" | "color";
  value: string;
  reason: string;
}

interface VarMap {
  [name: string]: string; // --token → resolved hex (best-effort)
}

// v3 — Find offset ranges of `[data-mode="dark"]` blocks in a CSS file
// using brace counting. Used by buildVarMap to skip variable
// declarations defined ONLY in dark mode, which would otherwise leak
// into default-mode resolution and produce false positives like
// .export-card h3 reporting #FFFFFF (dark-mode value) on white card.
//
// Per Sprint 6 directive Phase A2 confirmation #2: only the exact
// `[data-mode="dark"]` selector is treated as skip-worthy. Other named
// modes (e.g., `data-mode="silk-route-classic"`, `data-mode="midnight-
// blue"`) stay in the default map as additional theme variants — the
// public site's default state has no data-mode attribute, so all
// non-dark scoped vars are equivalent to default.
function findDarkModeSkipRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const openRe = /\[data-mode\s*=\s*["']dark["']\][^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(content)) !== null) {
    const blockStart = m.index;
    const openBraceIdx = m.index + m[0].length - 1;
    let depth = 1;
    let i = openBraceIdx + 1;
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    ranges.push([blockStart, i]);
    openRe.lastIndex = i; // advance past the closed block
  }
  return ranges;
}

function isInRange(offset: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (offset >= s && offset < e) return true;
  }
  return false;
}

// Build a global variable map by scanning :root, @theme, and other
// top-level variable-declaring blocks across all CSS sources passed in.
//
// v3 — Skips var declarations inside `[data-mode="dark"]` blocks. This
// matches what browsers compute for the default render (no data-mode
// attribute set on the html element). Vars defined ONLY in dark mode
// become undefined in our map, so var(--name, fallback) syntax falls
// back to the literal default per CSS spec. Vars defined in BOTH
// default scope AND dark mode keep the default value because dark
// declarations are skipped.
function buildVarMap(cssFiles: string[]): VarMap {
  const vars: VarMap = {};
  // First pass: capture raw declarations, skipping dark-mode-only ones.
  const rawDecls: { [name: string]: string } = {};
  for (const file of cssFiles) {
    const content = readFile(file);
    const skipRanges = findDarkModeSkipRanges(content);
    // Match lines like:   --foo: #BA7517;   OR   --foo: var(--bar);
    const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (isInRange(m.index, skipRanges)) continue;
      const name = m[1];
      const val = m[2].trim();
      // Skip composite shorthand values (multiple words/commas without
      // a single resolvable color) for v1.
      if (/^#[0-9A-Fa-f]{3,8}$/.test(val) || /^var\(--[A-Za-z0-9_-]+\)$/.test(val) || /^rgba?\(/.test(val)) {
        rawDecls[name] = val;
      }
    }
  }
  // Second pass: resolve var(...) references with simple substitution
  // (max 5 hops to avoid loops).
  for (const name of Object.keys(rawDecls)) {
    let val = rawDecls[name];
    for (let i = 0; i < 5 && /^var\(--[A-Za-z0-9_-]+\)$/.test(val); i++) {
      const ref = val.match(/^var\((--[A-Za-z0-9_-]+)\)$/)![1];
      if (rawDecls[ref] === undefined) break;
      val = rawDecls[ref];
    }
    vars[name] = val;
  }
  return vars;
}

// Resolve a CSS value to a concrete hex string + optional alpha (0..1).
// alpha === undefined means opaque (alpha = 1). Preserving alpha is what
// enables Pass 3 v2 alpha-overlay compositing — see compositeAlpha().
function resolveColor(value: string, vars: VarMap): { hex: string | null; alpha?: number; unresolved?: string } {
  const v = value.trim();

  // Direct hex — including #RRGGBBAA which carries alpha.
  if (/^#[0-9A-Fa-f]{3,8}$/.test(v)) {
    const h = v.replace("#", "");
    const norm = normHex(v);
    if (h.length === 8) {
      const alpha = parseInt(h.slice(6, 8), 16) / 255;
      return alpha < 1 ? { hex: norm, alpha } : { hex: norm };
    }
    return { hex: norm };
  }

  // rgb / rgba — preserve alpha when present (4th argument).
  const rgbMatch = v.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)/);
  if (rgbMatch) {
    const [r, g, b] = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) => parseInt(n, 10));
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    if (rgbMatch[4] !== undefined) {
      const alpha = parseFloat(rgbMatch[4]);
      return alpha < 1 ? { hex, alpha } : { hex };
    }
    return { hex };
  }

  // var(--token, fallback) — try to resolve var, then fall back to the
  // second argument if var is unresolvable.
  const varWithFallbackMatch = v.match(/^var\((--[A-Za-z0-9_-]+)\s*,\s*([^)]+)\)$/);
  if (varWithFallbackMatch) {
    const name = varWithFallbackMatch[1];
    const fallback = varWithFallbackMatch[2].trim();
    if (vars[name] !== undefined) return resolveColor(vars[name], vars);
    return resolveColor(fallback, vars);
  }
  const varMatch = v.match(/^var\((--[A-Za-z0-9_-]+)\)$/);
  if (varMatch) {
    const name = varMatch[1];
    if (vars[name] !== undefined) {
      return resolveColor(vars[name], vars);
    }
    return { hex: null, unresolved: name };
  }

  // CSS keywords that are not colors-with-hex — silently skip from
  // unresolved list (these are not contrast-relevant).
  const SKIP_KEYWORDS = new Set([
    "inherit", "initial", "unset", "revert", "revert-layer",
    "currentcolor", "none", "auto",
  ]);
  if (SKIP_KEYWORDS.has(v.toLowerCase())) {
    return { hex: null }; // no unresolved field — silently skipped
  }

  // Named keywords — minimal subset (white/black/transparent only).
  const keywordMap: { [k: string]: string } = {
    white: "#FFFFFF",
    black: "#000000",
    transparent: "TRANSPARENT",
  };
  if (keywordMap[v.toLowerCase()] !== undefined) {
    return { hex: keywordMap[v.toLowerCase()] };
  }

  return { hex: null, unresolved: v };
}

// Parse a CSS file into selector → { background, color } map.
// Pragmatic: top-level rules only; @media / nested @supports skipped (v2).
function parseCssRules(content: string): {
  rules: Array<{ selector: string; background?: string; color?: string }>;
  skippedMediaCount: number;
} {
  const rules: Array<{ selector: string; background?: string; color?: string }> = [];
  let skippedMediaCount = 0;

  // Strip block comments first to simplify parsing.
  const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "");

  // Walk the file character by character to track nesting.
  let i = 0;
  let inAtRule: string | null = null;
  let depth = 0;
  let pendingSelector = "";
  let pendingBody = "";
  let captureBody = false;

  while (i < noComments.length) {
    const ch = noComments[i];

    if (ch === "@" && depth === 0 && !captureBody) {
      // Read at-rule name
      let j = i + 1;
      while (j < noComments.length && /[a-zA-Z-]/.test(noComments[j])) j++;
      inAtRule = noComments.slice(i + 1, j);
      // Skip to matching { or ;
      while (j < noComments.length && noComments[j] !== "{" && noComments[j] !== ";") j++;
      if (noComments[j] === "{") {
        // Block at-rule (@media, @supports, @theme, @keyframes...)
        if (inAtRule === "media" || inAtRule === "supports" || inAtRule === "keyframes") {
          // Skip the whole block — count for reporting.
          if (inAtRule === "media") skippedMediaCount++;
          let bd = 1;
          let k = j + 1;
          while (k < noComments.length && bd > 0) {
            if (noComments[k] === "{") bd++;
            if (noComments[k] === "}") bd--;
            k++;
          }
          i = k;
          inAtRule = null;
          continue;
        }
        // Other at-rules (@theme, @font-face) — fall through and let
        // selector-less body capture its declarations.
        depth = 1;
        captureBody = true;
        pendingSelector = `@${inAtRule}`;
        pendingBody = "";
        i = j + 1;
        continue;
      }
      i = j + 1;
      inAtRule = null;
      continue;
    }

    if (ch === "{" && !captureBody) {
      captureBody = true;
      depth++;
      pendingBody = "";
      i++;
      continue;
    }

    if (ch === "}" && captureBody) {
      depth--;
      if (depth === 0) {
        // Parse declarations
        const decls = pendingBody.split(";").map((d) => d.trim()).filter(Boolean);
        const rule: { selector: string; background?: string; color?: string } = {
          selector: pendingSelector.trim(),
        };
        for (const d of decls) {
          const colonIdx = d.indexOf(":");
          if (colonIdx === -1) continue;
          const prop = d.slice(0, colonIdx).trim().toLowerCase();
          const val = d.slice(colonIdx + 1).trim();
          if (prop === "background-color" || prop === "background") {
            // For shorthand background, take the first color-shaped token.
            const m = val.match(/(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\)|var\(--[A-Za-z0-9_-]+\))/);
            if (m) rule.background = m[1];
          } else if (prop === "color") {
            rule.color = val;
          }
        }
        if (rule.background || rule.color) rules.push(rule);
        captureBody = false;
        pendingSelector = "";
        pendingBody = "";
      } else if (captureBody) {
        pendingBody += ch;
      }
      i++;
      continue;
    }

    if (captureBody) {
      pendingBody += ch;
    } else {
      pendingSelector += ch;
    }
    i++;
  }

  return { rules, skippedMediaCount };
}

// Severity based on contrast ratio.
function contrastSeverity(ratio: number): Severity | null {
  if (ratio < 3) return "P0";
  if (ratio < 4.5) return "P1";
  return null;
}

// Selector ancestor matcher — does `child` selector descend from `parent`?
// Pragmatic: check if child starts with parent followed by space / > / : / .
function isDescendantSelector(parent: string, child: string): boolean {
  if (parent === child) return false;
  if (!child.startsWith(parent)) return false;
  const next = child[parent.length];
  return next === " " || next === ">" || next === "+" || next === "~";
}

// v3 — Strip the outermost pseudo-class / functional-pseudo from a
// selector. Returns the stripped form (one level), or null if no
// strippable suffix is present. Used by the cascade-inherit walker to
// recognize that `.btn-navy:hover` shares its color cascade with
// `.btn-navy` per CSS specificity (a :hover rule that only changes bg
// keeps the base rule's `color:` declaration in effect).
//
// Patterns supported:
//   .X:hover               → .X
//   .X:focus-visible       → .X
//   .X:not(:disabled)      → .X
//   .X:hover:not(:disabled) → .X:hover (one level only — apply repeatedly)
//
// Per Sprint 6 directive Phase A confirmation #1: outermost-first
// repeated application via getAllBaseSelectors() below.
function stripPseudoSuffix(sel: string): string | null {
  // Functional pseudo: :foo(...)
  const fnMatch = sel.match(/^(.+):(?:not|is|where|has|nth-child|nth-of-type|first-child|first-of-type|last-child|last-of-type)\([^)]*\)$/);
  if (fnMatch) return fnMatch[1];
  // Simple pseudo: :foo (must come at very end, not mid-selector
  // descendants like `.parent:hover .child`).
  const simpleMatch = sel.match(/^(.+):(hover|focus|active|focus-visible|focus-within|checked|disabled|visited|link|first-child|last-child|only-child|empty|target)$/);
  if (simpleMatch) return simpleMatch[1];
  return null;
}

// v3 — Collect all base selectors by repeatedly stripping pseudo-class
// suffixes. Used to find every level of the cascade chain that may
// contribute color/bg via CSS specificity.
function getAllBaseSelectors(sel: string): string[] {
  const bases: string[] = [];
  let current = sel;
  for (let i = 0; i < 8; i++) {
    const next = stripPseudoSuffix(current);
    if (next === null || next === current) break;
    bases.push(next);
    current = next;
  }
  return bases;
}

// v3 — HTML cascade hints. CSS-selector descent in findOpaqueParentBg
// can't see HTML structure where elements share a class prefix without
// an explicit selector relationship (e.g., `<aside class="sidebar">
// <nav class="sidebar-nav">` — `.sidebar-nav` is NOT a descendant of
// `.sidebar` per CSS, but IS contained inside it per HTML). These hints
// hardcode the documented nesting patterns surfaced in Sprint 3 spot-
// checks + Sprint 5 false-positive analysis.
//
// Per Sprint 6 directive Phase A2 Option (a): hardcoded table covers the
// known cases; full HTML-DOM cascade is a v4 candidate.
//
// Priority per Sprint 6 directive confirmation #4: CSS-selector descent
// runs first; HTML hints are consulted only when CSS descent finds no
// opaque ancestor in bgRules.
interface CascadeHint { childRegex: RegExp; parentSelector: string; }
const HTML_CASCADE_HINTS: CascadeHint[] = [
  { childRegex: /^\.sidebar-/,     parentSelector: ".sidebar" },
  { childRegex: /^\.topbar-/,      parentSelector: ".topbar" },
  { childRegex: /^\.modal-/,       parentSelector: ".modal" },
  { childRegex: /^\.card-/,        parentSelector: ".card" },
  { childRegex: /^\.panel-/,       parentSelector: ".panel" },
  { childRegex: /^\.notif-/,       parentSelector: ".notif-list" },
  { childRegex: /^\.action-item-/, parentSelector: ".action-list" },
  { childRegex: /^\.badge-/,       parentSelector: ".card" },
];

// Find body/html/:root foreground color in a single rule list (per-file).
// Used by the cascade-inheritance detector to "walk up the cascade where
// possible" per Sprint 2 directive Step 5. Per-file lookup beats a single
// global color because marketing pages and AE Console pages have
// different body-color baselines and a single global value would mis-
// classify one or the other.
function findCascadeColor(
  rules: Array<{ selector: string; color?: string }>,
  vars: VarMap
): string | null {
  for (const r of rules) {
    if (!r.color) continue;
    const sel = r.selector.trim();
    if (sel === "body" || sel === "html" || sel === "html, body" || sel === ":root") {
      const res = resolveColor(r.color, vars);
      if (res.hex && res.hex !== "TRANSPARENT") return res.hex;
    }
  }
  return null;
}

// v2 — Per-file body/html/:root background lookup (opaque only).
// Used as a fallback when an alpha-overlay bg has no opaque ancestor in
// the same stylesheet. Mirrors findCascadeColor but for backgrounds.
function findCascadeBg(
  rules: Array<{ selector: string; background?: string }>,
  vars: VarMap
): string | null {
  for (const r of rules) {
    if (!r.background) continue;
    const sel = r.selector.trim();
    if (sel === "body" || sel === "html" || sel === "html, body" || sel === ":root") {
      const res = resolveColor(r.background, vars);
      if (res.hex && res.hex !== "TRANSPARENT" && (res.alpha === undefined || res.alpha >= 1)) {
        return res.hex;
      }
    }
  }
  return null;
}

// Global fallback — first body color found across all files. Used only
// when a CSS file has no local body/html/:root color rule.
function buildGlobalCascadeColor(cssFiles: string[], vars: VarMap): string | null {
  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules } = parseCssRules(content);
    const c = findCascadeColor(rules, vars);
    if (c) return c;
  }
  return null;
}

// v2 — Global body-bg fallback. Same per-file→global fallback pattern.
function buildGlobalCascadeBg(cssFiles: string[], vars: VarMap): string | null {
  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules } = parseCssRules(content);
    const c = findCascadeBg(rules, vars);
    if (c) return c;
  }
  return null;
}

// v5 — Per-page body-bg context. Walks frontend/public/**/*.html files
// at scanner startup; for each HTML file, parses `<link
// rel="stylesheet" href="...">` tags to identify the loaded CSS files,
// then walks those CSS files in order to resolve the effective body bg
// for that page. Builds a map of CSS-file-path → page body bg so Pass 3
// can use the right context when a CSS file (e.g., carrier-portal
// `tools.css`) doesn't declare its own body bg but is loaded by an
// HTML page where another CSS file (e.g., `carrier-console.css`) sets
// it.
//
// Closes the carrier-portal dark-theme false-positive class from
// Sprint 8 Phase C: tools.css widget cards previously composited over
// AE Console body-bg `#F8FAFC` fallback (since walk-order picked up a
// marketing-page `body { background: #FFFFFF }` first), producing
// 2.56:1 P0 findings against white. Real rendering composites over
// carrier portal navy bg → ~6:1 PASS.
//
// Per Sprint 9 directive confirmation #4: first walk-order match wins
// when a CSS file is loaded by multiple HTML pages with different body
// bgs; conflicts count surfaced for transparency.
interface PageBgContextEntry { bg: string; viaHtml: string; conflicts?: number }
function buildPageBgContext(
  htmlFiles: string[],
  cssFiles: string[],
  vars: VarMap
): Map<string, PageBgContextEntry> {
  const ctx = new Map<string, PageBgContextEntry>();
  // Pre-cache parsed CSS rules so we don't re-parse for every HTML page.
  const cssCache = new Map<string, ReturnType<typeof parseCssRules>>();
  for (const file of cssFiles) {
    cssCache.set(file, parseCssRules(readFile(file)));
  }

  for (const htmlFile of htmlFiles) {
    const html = readFile(htmlFile);
    // Match <link rel="stylesheet" href="..."> in any attribute order.
    // Extract href via two-pass regex to be robust to attribute ordering.
    const linkTagRe = /<link\b[^>]*>/gi;
    const linkedRelPaths: string[] = [];
    let lm: RegExpExecArray | null;
    while ((lm = linkTagRe.exec(html)) !== null) {
      const tag = lm[0];
      if (!/rel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
      const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch) linkedRelPaths.push(hrefMatch[1]);
    }

    // Resolve linked hrefs to absolute paths matching cssFiles[].
    const linkedCss: string[] = [];
    for (const rel of linkedRelPaths) {
      const cleanRel = rel.split("?")[0].split("#")[0];
      // Absolute path (starts with /) → relative to FRONTEND_PUBLIC.
      // Relative path → relative to the HTML file's directory.
      let absCandidate: string;
      if (cleanRel.startsWith("/")) {
        absCandidate = path.join(FRONTEND_PUBLIC, cleanRel.replace(/^\//, ""));
      } else {
        absCandidate = path.join(path.dirname(htmlFile), cleanRel);
      }
      const norm = path.normalize(absCandidate);
      const match = cssFiles.find((f) => path.normalize(f) === norm);
      if (match) linkedCss.push(match);
    }
    if (linkedCss.length === 0) continue;

    // Find first opaque body bg by walking the loaded CSS files in
    // load order. First match wins.
    let pageBodyBg: string | null = null;
    for (const cssFile of linkedCss) {
      const { rules } = cssCache.get(cssFile)!;
      const bg = findCascadeBg(rules, vars);
      if (bg) {
        pageBodyBg = bg;
        break;
      }
    }
    if (!pageBodyBg) continue;

    // Stamp every loaded CSS file with this page's body bg. If a CSS
    // file is already stamped from a previous HTML page with a
    // DIFFERENT bg, increment conflicts but keep first match.
    for (const cssFile of linkedCss) {
      const existing = ctx.get(cssFile);
      if (existing) {
        if (existing.bg !== pageBodyBg) {
          existing.conflicts = (existing.conflicts ?? 0) + 1;
        }
      } else {
        ctx.set(cssFile, { bg: pageBodyBg, viaHtml: htmlFile });
      }
    }
  }
  return ctx;
}

// v2 — Walk bgRules for ancestors of childSelector and return the most-
// specific OPAQUE background. Used to resolve what an alpha overlay sits
// on top of for compositing.
//
// v3 — Falls through to HTML_CASCADE_HINTS when CSS-selector descent
// finds no opaque ancestor in bgRules. Hints cover documented HTML
// nesting patterns (`.sidebar-nav` inside `.sidebar`, etc.) where CSS
// selector relationships don't reflect the rendered DOM containment.
// Per Sprint 6 directive Phase A2 confirmation #4: CSS descent runs
// first; HTML hints are consulted as a fallback.
//
// Returns an object with the resolved hex plus a `source` tag for trail
// reporting in Pass 3 finding output: `css-descent` / `html-hint` /
// `global-css-descent` / `global-html-hint` (v4) / `file-body` /
// `global-body` / `default-white`.
interface BgRuleEntry { selector: string; bgHex: string; bgAlpha?: number; raw: string }
interface GlobalBgRuleEntry extends BgRuleEntry { file: string }
interface OpaqueParentResult {
  hex: string;
  source: "css-descent" | "html-hint" | "global-css-descent" | "global-html-hint" | "page-context-body" | "file-body" | "global-body" | "default-white";
  viaSelector?: string;
  viaFile?: string;          // v4 — origin file when source is global-*
  ambiguousMatches?: number; // v4 — count when multiple global files define same selector
  pageContextConflicts?: number; // v5 — count when page-context-body matched multiple HTML pages
}

// v4 — Strip `html[data-mode="X"]` and `html[data-theme="X"][data-mode="X"]`
// prefixes from a selector. Used by global bgRules matching so themed
// variants (`html[data-mode="dark"] .sidebar-nav a:hover`) resolve to
// the canonical class hierarchy (`.sidebar-nav a:hover`) for cross-file
// lookup.
function stripModePrefix(sel: string): string {
  // Combined theme + mode: html[data-theme="X"][data-mode="X"]
  let out = sel.replace(/^html\[data-theme\s*=\s*["'][^"']*["']\]\[data-mode\s*=\s*["'][^"']*["']\]\s*/, "");
  // Mode-only: html[data-mode="X"]
  out = out.replace(/^html\[data-mode\s*=\s*["'][^"']*["']\]\s*/, "");
  // Theme-only: html[data-theme="X"]
  out = out.replace(/^html\[data-theme\s*=\s*["'][^"']*["']\]\s*/, "");
  return out;
}

// v4 — Build global bgRules index across all CSS files. Used as a Tier-3
// fallback when same-file bgRules can't resolve the opaque parent (e.g.,
// themes.css sets `--theme-sidebar-bg` but the opaque `.sidebar`
// background rule lives in console.css). Each entry carries `file`
// attribution for ambiguity logging when multiple files define the same
// selector.
function buildGlobalBgRules(cssFiles: string[], vars: VarMap): GlobalBgRuleEntry[] {
  const out: GlobalBgRuleEntry[] = [];
  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules } = parseCssRules(content);
    for (const r of rules) {
      if (!r.background) continue;
      const res = resolveColor(r.background, vars);
      if (res.hex && res.hex !== "TRANSPARENT") {
        out.push({
          selector: r.selector,
          bgHex: res.hex,
          bgAlpha: res.alpha,
          raw: r.background,
          file,
        });
      }
    }
  }
  return out;
}

function findOpaqueParentBg(
  childSelector: string,
  bgRules: BgRuleEntry[],
  fileBodyBg: string | null,
  globalBodyBg: string | null,
  globalBgRules?: GlobalBgRuleEntry[],
  pageContextBg?: { bg: string; viaHtml: string; conflicts?: number }
): OpaqueParentResult {
  // Tier 1 — Same-file CSS-selector descent (v2 behavior, unchanged priority).
  let best: BgRuleEntry | null = null;
  for (const b of bgRules) {
    if (b.selector === childSelector) continue; // exclude self — we want strict ancestors
    if (!isDescendantSelector(b.selector, childSelector)) continue;
    const opaque = b.bgAlpha === undefined || b.bgAlpha >= 1;
    if (!opaque) continue;
    if (!best || b.selector.length > best.selector.length) best = b;
  }
  if (best) return { hex: best.bgHex, source: "css-descent", viaSelector: best.selector };

  // Tier 2 — v3 same-file HTML cascade hints. Extract the FIRST .className
  // token anywhere in childSelector (skipping html / body / attribute
  // prefixes), match against hint table, look up the parent class in
  // same-file bgRules.
  const leadingClassMatch = childSelector.match(/\.([A-Za-z][A-Za-z0-9_-]*)/);
  const leadingClass = leadingClassMatch ? "." + leadingClassMatch[1] : null;
  if (leadingClass) {
    for (const hint of HTML_CASCADE_HINTS) {
      if (!hint.childRegex.test(leadingClass)) continue;
      const parent = bgRules.find(
        (b) => b.selector === hint.parentSelector && (b.bgAlpha === undefined || b.bgAlpha >= 1)
      );
      if (parent) {
        return { hex: parent.bgHex, source: "html-hint", viaSelector: hint.parentSelector };
      }
    }
  }

  // v4 — Global bgRules fallback. Matches against a cross-file index
  // with `html[data-mode="X"]` / `html[data-theme="X"]` prefixes
  // stripped on both sides, so themed variants resolve to canonical
  // parent classes living in different files. Per Sprint 7 directive
  // confirmations: same-file priority preserved (Tier 1 + 2 first);
  // first-match-wins on ambiguity with `ambiguousMatches` count
  // surfaced for transparency.
  if (globalBgRules) {
    const normalizedChild = stripModePrefix(childSelector);

    // Tier 3 — Global CSS-selector descent.
    let bestGlobal: GlobalBgRuleEntry | null = null;
    let bestGlobalParentNorm = "";
    for (const b of globalBgRules) {
      const normalizedParent = stripModePrefix(b.selector);
      if (normalizedParent === normalizedChild) continue;
      if (!isDescendantSelector(normalizedParent, normalizedChild)) continue;
      const opaque = b.bgAlpha === undefined || b.bgAlpha >= 1;
      if (!opaque) continue;
      if (!bestGlobal || normalizedParent.length > bestGlobalParentNorm.length) {
        bestGlobal = b;
        bestGlobalParentNorm = normalizedParent;
      }
    }
    if (bestGlobal) {
      return {
        hex: bestGlobal.bgHex,
        source: "global-css-descent",
        viaSelector: bestGlobalParentNorm,
        viaFile: bestGlobal.file,
      };
    }

    // Tier 4 — Global HTML cascade hints.
    if (leadingClass) {
      for (const hint of HTML_CASCADE_HINTS) {
        if (!hint.childRegex.test(leadingClass)) continue;
        const matches = globalBgRules.filter(
          (b) =>
            stripModePrefix(b.selector) === hint.parentSelector &&
            (b.bgAlpha === undefined || b.bgAlpha >= 1)
        );
        if (matches.length > 0) {
          return {
            hex: matches[0].bgHex,
            source: "global-html-hint",
            viaSelector: hint.parentSelector,
            viaFile: matches[0].file,
            ambiguousMatches: matches.length > 1 ? matches.length : undefined,
          };
        }
      }
    }
  }

  // Tier 5 — v5 page-context body bg. When the current CSS file is
  // loaded by an HTML page that resolves a different body bg than the
  // global default, prefer the page-context value. Closes the carrier-
  // portal pattern where tools.css loads alongside carrier-console.css
  // (which sets navy body bg) but the global default fell back to
  // marketing-page white.
  if (pageContextBg) {
    return {
      hex: pageContextBg.bg,
      source: "page-context-body",
      viaFile: pageContextBg.viaHtml,
      pageContextConflicts: pageContextBg.conflicts,
    };
  }

  // Tier 6 — Body-bg fallback chain (existing behavior).
  if (fileBodyBg) return { hex: fileBodyBg, source: "file-body" };
  if (globalBodyBg) return { hex: globalBodyBg, source: "global-body" };
  return { hex: "#FFFFFF", source: "default-white" };
}

function pass3Contrast(
  cssFiles: string[],
  vars: VarMap,
  htmlFiles: string[]
): { findings: ContrastFinding[]; unresolved: UnresolvedFinding[]; resolved: number; skippedMedia: number; inferredBody: string | null; compositedCount: number; globalMatchCount: number; ambiguousGlobalCount: number; pageContextMatchCount: number; pageContextConflictsCount: number } {
  const findings: ContrastFinding[] = [];
  const unresolved: UnresolvedFinding[] = [];
  let resolved = 0;
  let skippedMedia = 0;
  let compositedCount = 0;  // v2: tracks how many findings used alpha compositing
  let globalMatchCount = 0; // v4: tracks Tier-3 / Tier-4 global lookups
  let ambiguousGlobalCount = 0; // v4: tracks how many global matches had >1 file
  let pageContextMatchCount = 0; // v5: tracks Tier-5 page-context body-bg lookups
  let pageContextConflictsCount = 0; // v5: tracks page-context entries with >1 conflicting HTML page
  const globalBody = buildGlobalCascadeColor(cssFiles, vars);
  const globalBodyBg = buildGlobalCascadeBg(cssFiles, vars);
  // v4: cross-file bgRules index. Built once at start; passed to every
  // findOpaqueParentBg call as a Tier-3 / Tier-4 fallback when same-file
  // lookup misses (themed selectors in themes.css whose opaque parent
  // bg lives in console.css or page CSS).
  const globalBgRules = buildGlobalBgRules(cssFiles, vars);
  // v5: page-context body-bg map. Built once at start; per-file lookup
  // provides a Tier-5 fallback that's HTML-page-aware (e.g., tools.css
  // loaded by carrier dashboard knows the carrier portal navy bg).
  const pageBgContext = buildPageBgContext(htmlFiles, cssFiles, vars);

  for (const file of cssFiles) {
    const content = readFile(file);
    const { rules, skippedMediaCount } = parseCssRules(content);
    skippedMedia += skippedMediaCount;
    // Per-file cascade lookup: prefer file-local body/html/:root color
    // over the global fallback.
    const localBody = findCascadeColor(rules, vars);
    const inferredBody = localBody ?? globalBody;
    const localBodyBg = findCascadeBg(rules, vars);
    // v5: per-file page-context body bg lookup. If this CSS file is
    // loaded by an HTML page that resolves a body bg from a different
    // CSS file (e.g., carrier-portal tools.css alongside carrier-
    // console.css's navy body), use that as Tier-5 fallback.
    const pageContextBg = pageBgContext.get(file);

    // Build per-file selector → bg map. v2: track alpha alongside hex.
    const bgRules: BgRuleEntry[] = [];
    for (const r of rules) {
      if (!r.background) continue;
      const res = resolveColor(r.background, vars);
      if (res.hex && res.hex !== "TRANSPARENT") {
        bgRules.push({
          selector: r.selector,
          bgHex: res.hex,
          bgAlpha: res.alpha,
          raw: r.background,
        });
        resolved++;
      } else if (res.unresolved && res.hex !== "TRANSPARENT") {
        unresolved.push({
          file, selector: r.selector, property: "background",
          value: r.background,
          reason: `cannot resolve to hex (var ${res.unresolved} undefined or composite value)`,
        });
      }
    }

    // For each child rule with `color`, find a parent bg rule and compute
    // contrast. v2: when parent bg has alpha < 1, composite over the
    // nearest opaque ancestor (or per-file/global body bg fallback)
    // before the contrast math runs.
    for (const r of rules) {
      if (!r.color) continue;
      const fgRes = resolveColor(r.color, vars);
      if (!fgRes.hex || fgRes.hex === "TRANSPARENT") {
        if (fgRes.unresolved) {
          unresolved.push({
            file, selector: r.selector, property: "color",
            value: r.color,
            reason: `cannot resolve to hex (var ${fgRes.unresolved} undefined or composite value)`,
          });
        }
        continue;
      }

      // Find parent bg — prefer most-specific match.
      let parent: BgRuleEntry | null = null;
      for (const b of bgRules) {
        if (b.selector === r.selector || isDescendantSelector(b.selector, r.selector)) {
          if (!parent || b.selector.length > parent.selector.length) {
            parent = b;
          }
        }
      }

      if (!parent) continue;

      // v2 — Composite alpha overlays. If the parent bg is non-opaque,
      // composite it over the nearest opaque ancestor (excluding the
      // parent itself, since we're trying to figure out what IT sits on).
      // v3 — findOpaqueParentBg now returns source metadata; threaded
      // into composedFromOverlay for finding-output trail.
      let effectiveBg = parent.bgHex;
      let composedFromOverlay: { overlay: string; parentBg: string; alpha: number; source: string; viaSelector?: string; viaFile?: string; ambiguousMatches?: number; pageContextConflicts?: number } | null = null;
      if (parent.bgAlpha !== undefined && parent.bgAlpha < 1) {
        const opaqueResult = findOpaqueParentBg(parent.selector, bgRules, localBodyBg, globalBodyBg, globalBgRules, pageContextBg);
        effectiveBg = compositeAlpha(parent.bgHex, parent.bgAlpha, opaqueResult.hex);
        composedFromOverlay = {
          overlay: parent.bgHex,
          parentBg: opaqueResult.hex,
          alpha: parent.bgAlpha,
          source: opaqueResult.source,
          viaSelector: opaqueResult.viaSelector,
          viaFile: opaqueResult.viaFile,
          ambiguousMatches: opaqueResult.ambiguousMatches,
          pageContextConflicts: opaqueResult.pageContextConflicts,
        };
        compositedCount++;
        if (opaqueResult.source === "global-css-descent" || opaqueResult.source === "global-html-hint") {
          globalMatchCount++;
          if (opaqueResult.ambiguousMatches) ambiguousGlobalCount++;
        }
        if (opaqueResult.source === "page-context-body") {
          pageContextMatchCount++;
          if (opaqueResult.pageContextConflicts) pageContextConflictsCount++;
        }
      }

      // v2 — If the foreground itself has alpha (rare: rgba color or
      // #RRGGBBAA), composite it over the effective bg before measuring.
      let effectiveFg = fgRes.hex;
      let fgAlphaTrail: { fgOverlay: string; alpha: number } | null = null;
      if (fgRes.alpha !== undefined && fgRes.alpha < 1) {
        effectiveFg = compositeAlpha(fgRes.hex, fgRes.alpha, effectiveBg);
        fgAlphaTrail = { fgOverlay: fgRes.hex, alpha: fgRes.alpha };
      }

      const ratio = contrastRatio(effectiveBg, effectiveFg);
      if (ratio === null) continue;
      const sev = contrastSeverity(ratio);
      if (sev) {
        const noteParts: string[] = [
          parent.selector === r.selector
            ? "self-element contrast (same selector sets bg + color)"
            : "ancestor-bg vs descendant-color contrast",
        ];
        if (composedFromOverlay) {
          const ambig = composedFromOverlay.ambiguousMatches ? ` [ambiguousMatches=${composedFromOverlay.ambiguousMatches}]` : "";
          const fileSuffix = composedFromOverlay.viaFile ? ` in ${composedFromOverlay.viaFile.replace(/^.*\/frontend\//, "frontend/")}` : "";
          const conflicts = composedFromOverlay.pageContextConflicts ? ` [conflicts=${composedFromOverlay.pageContextConflicts}]` : "";
          const sourceTrail =
            composedFromOverlay.source === "html-hint" && composedFromOverlay.viaSelector
              ? ` (parent bg from HTML hint → ${composedFromOverlay.viaSelector})`
              : composedFromOverlay.source === "css-descent" && composedFromOverlay.viaSelector
              ? ` (parent bg from CSS ancestor ${composedFromOverlay.viaSelector})`
              : composedFromOverlay.source === "global-css-descent" && composedFromOverlay.viaSelector
              ? ` (parent bg from global CSS ancestor ${composedFromOverlay.viaSelector}${fileSuffix}${ambig})`
              : composedFromOverlay.source === "global-html-hint" && composedFromOverlay.viaSelector
              ? ` (parent bg from global HTML hint → ${composedFromOverlay.viaSelector}${fileSuffix}${ambig})`
              : composedFromOverlay.source === "page-context-body"
              ? ` (parent bg from page-context body via${fileSuffix}${conflicts})`
              : composedFromOverlay.source === "file-body" || composedFromOverlay.source === "global-body" || composedFromOverlay.source === "default-white"
              ? ` (parent bg from ${composedFromOverlay.source} fallback)`
              : "";
          noteParts.push(
            `composited overlay ${composedFromOverlay.overlay} α=${composedFromOverlay.alpha.toFixed(2)} over ${composedFromOverlay.parentBg} → ${effectiveBg}${sourceTrail}`
          );
        }
        if (fgAlphaTrail) {
          noteParts.push(`fg overlay ${fgAlphaTrail.fgOverlay} α=${fgAlphaTrail.alpha.toFixed(2)} → ${effectiveFg}`);
        }
        findings.push({
          file,
          selector: `${parent.selector} → ${r.selector}`,
          background: composedFromOverlay ? `${effectiveBg} (from ${composedFromOverlay.overlay} α=${composedFromOverlay.alpha.toFixed(2)})` : effectiveBg,
          foreground: fgAlphaTrail ? `${effectiveFg} (from ${fgAlphaTrail.fgOverlay} α=${fgAlphaTrail.alpha.toFixed(2)})` : effectiveFg,
          ratio: Math.round(ratio * 100) / 100,
          severity: sev,
          note: noteParts.join(" · "),
        });
      }
    }

    // Walking-the-cascade case: dark bg with no explicit color rule.
    // Per directive Step 5: walk up the cascade where possible. We use
    // the global inferred body/html color as the cascade fallback. When
    // it resolves, we compute the actual contrast ratio. When it doesn't,
    // we emit a "needs DOM inspection" finding (not a confirmed P0).
    // v2 — composite alpha bg over its opaque ancestor before the dark-
    // surface luminance check, so e.g. rgba(239,68,68,0.10) over white
    // (effective ≈ pale pink, lum > 0.18) doesn't trigger as "dark bg".
    for (const b of bgRules) {
      if (!b.bgHex) continue;
      let effectiveBg = b.bgHex;
      let composeTrail: { overlay: string; parentBg: string; alpha: number; source: string; viaSelector?: string; viaFile?: string; ambiguousMatches?: number; pageContextConflicts?: number } | null = null;
      if (b.bgAlpha !== undefined && b.bgAlpha < 1) {
        const opaqueResult = findOpaqueParentBg(b.selector, bgRules, localBodyBg, globalBodyBg, globalBgRules, pageContextBg);
        effectiveBg = compositeAlpha(b.bgHex, b.bgAlpha, opaqueResult.hex);
        composeTrail = {
          overlay: b.bgHex,
          parentBg: opaqueResult.hex,
          alpha: b.bgAlpha,
          source: opaqueResult.source,
          viaSelector: opaqueResult.viaSelector,
          viaFile: opaqueResult.viaFile,
          ambiguousMatches: opaqueResult.ambiguousMatches,
          pageContextConflicts: opaqueResult.pageContextConflicts,
        };
        if (opaqueResult.source === "global-css-descent" || opaqueResult.source === "global-html-hint") {
          globalMatchCount++;
          if (opaqueResult.ambiguousMatches) ambiguousGlobalCount++;
        }
        if (opaqueResult.source === "page-context-body") {
          pageContextMatchCount++;
          if (opaqueResult.pageContextConflicts) pageContextConflictsCount++;
        }
      }
      const rgb = hexToRgb(effectiveBg);
      if (!rgb) continue;
      const lum = relativeLuminance(rgb);
      if (lum > 0.18) continue; // not a dark surface

      // v3 — Fix 1: pseudo-class rule cascading. If b.selector is a
      // pseudo-class rule (e.g., `.btn-navy:hover`), look up base
      // selectors (`.btn-navy`) for explicit color. Browser cascade
      // applies the base rule's color to the pseudo state when the
      // pseudo rule doesn't override it. Treat finding base color as
      // equivalent to having explicit color → skip cascade-inherit
      // emission (the real fg is the base color, not body inherited).
      const baseSelectors = getAllBaseSelectors(b.selector);
      const baseHasColor = baseSelectors.some((base) =>
        rules.some(
          (r) => r.color && (r.selector === base || isDescendantSelector(base, r.selector))
        )
      );

      const hasExplicitColor = rules.some(
        (r) => r.color && (r.selector === b.selector || isDescendantSelector(b.selector, r.selector))
      );
      if (hasExplicitColor || baseHasColor) continue;

      if (composeTrail) compositedCount++;

      if (inferredBody) {
        // v2: contrast against the composited (effective) bg, not the
        // raw overlay hex.
        const ratio = contrastRatio(effectiveBg, inferredBody);
        if (ratio === null) continue;
        const sev = contrastSeverity(ratio);
        if (sev) {
          const noteBase =
            "dark bg with no explicit `color:` — cascade resolves to body/html color. Set explicit `color: var(--fg-on-navy)` or equivalent.";
          let note = noteBase;
          if (composeTrail) {
            const ambig = composeTrail.ambiguousMatches ? ` [ambiguousMatches=${composeTrail.ambiguousMatches}]` : "";
            const conflicts = composeTrail.pageContextConflicts ? ` [conflicts=${composeTrail.pageContextConflicts}]` : "";
            const fileSuffix = composeTrail.viaFile ? ` in ${composeTrail.viaFile.replace(/^.*\/frontend\//, "frontend/")}` : "";
            const sourceTrail =
              composeTrail.source === "html-hint" && composeTrail.viaSelector
                ? ` (parent bg from HTML hint → ${composeTrail.viaSelector})`
                : composeTrail.source === "css-descent" && composeTrail.viaSelector
                ? ` (parent bg from CSS ancestor ${composeTrail.viaSelector})`
                : composeTrail.source === "global-css-descent" && composeTrail.viaSelector
                ? ` (parent bg from global CSS ancestor ${composeTrail.viaSelector}${fileSuffix}${ambig})`
                : composeTrail.source === "global-html-hint" && composeTrail.viaSelector
                ? ` (parent bg from global HTML hint → ${composeTrail.viaSelector}${fileSuffix}${ambig})`
                : composeTrail.source === "page-context-body"
                ? ` (parent bg from page-context body via${fileSuffix}${conflicts})`
                : ` (parent bg from ${composeTrail.source} fallback)`;
            note = `${noteBase} · composited overlay ${composeTrail.overlay} α=${composeTrail.alpha.toFixed(2)} over ${composeTrail.parentBg} → ${effectiveBg}${sourceTrail}`;
          }
          findings.push({
            file,
            selector: `${b.selector} (cascade-inherited fg)`,
            background: composeTrail
              ? `${effectiveBg} (from ${composeTrail.overlay} α=${composeTrail.alpha.toFixed(2)})`
              : effectiveBg,
            foreground: `${inferredBody} (inferred from body/html cascade)`,
            ratio: Math.round(ratio * 100) / 100,
            severity: sev,
            note,
          });
        }
      } else {
        // Cascade unresolvable — emit advisory P1 ("needs DOM inspection")
        // rather than a confirmed P0 readability failure.
        findings.push({
          file,
          selector: `${b.selector} (no explicit color, cascade unresolvable)`,
          background: composeTrail
            ? `${effectiveBg} (from ${composeTrail.overlay} α=${composeTrail.alpha.toFixed(2)})`
            : effectiveBg,
          foreground: "(unresolved cascade)",
          ratio: 0,
          severity: "P1",
          note: "dark bg with no explicit color and no resolvable body/html cascade — needs DOM inspection. Confirm child text contrast against this background.",
        });
      }
    }
  }

  return { findings, unresolved, resolved, skippedMedia, inferredBody: globalBody, compositedCount, globalMatchCount, ambiguousGlobalCount, pageContextMatchCount, pageContextConflictsCount };
}

// v5 — Tailwind contrast pass on .tsx React components. Extracts
// className expressions from each .tsx file, tokenizes, finds text-* +
// bg-* pairs on the SAME className string (= same JSX element per v5
// simplification — parent-child JSX walking is v6), resolves each via
// TAILWIND_PALETTES / TAILWIND_SPECIAL / arbitrary-value bracket
// syntax, computes contrast.
//
// Per Sprint 9 directive confirmation #2: parses `hover:` and `focus:`
// pseudo-variant prefixes and emits separate state-pair findings (so a
// className containing both `bg-white hover:bg-slate-100` and
// `text-slate-700` produces two pairs: base and hover).
//
// Per directive confirmation #3: skips whole className when `${...}`
// template interpolation is detected; logs once per file in
// `dynamicSkippedFiles` for human triage.
//
// v6 candidates deferred: parent-child JSX tree walking (when parent
// element sets bg, child sets text), `sm:` / `md:` / `lg:` / `dark:`
// responsive variants, React state-driven className via cn() / clsx()
// helpers, CSS-in-JS dynamic styles.

// v6 — JSX element stack entry. Built per .tsx file by
// buildJsxElementStack(). Each entry represents a JSX opening tag; the
// stack is iterated to find Tailwind classNames per element, and the
// `parentIndex` chain enables ancestor bg resolution for alpha
// compositing and orphan-text contrast pairing.
interface JsxStackEntry {
  tag: string;          // e.g., "div", "Modal", "button"
  classNames: string;   // raw className string-literal value (or "" if dynamic / missing)
  parentIndex: number;  // -1 for root; else index into elements[]
  line: number;
  isComponent: boolean; // capitalized first letter = React component (cross-file boundary)
}

// v6 — Stack-based JSX walker. Heuristic, not a full AST parser. Per
// Sprint 11 directive confirmation #1, capitalized-tag (React
// component) ancestors are walked PAST when their className doesn't
// supply a bg-* — `crossFileBoundaryCount` is incremented for
// transparency.
//
// Scope per directive confirmations:
//   #2 — closest LEXICAL ancestor wins; map() body is a nested scope
//        sharing the parent. Walker doesn't try to detect map at all;
//        naive walking gives this behavior for free.
//   #3 — conditional rendering branches (`cond ? <A> : <B>`) become
//        sequential same-position siblings sharing parentIndex.
//        Self-closed branches push + immediately pop.
//   #4 — clsx/cn helper string-literal arguments extracted; variables
//        skipped.
//
// The walker handles:
//   - <Tag attr1="x" attr2={...}>...</Tag>  (full element)
//   - <Tag />                                (self-closed, pushed + popped)
//   - <></>  / <Fragment>...</Fragment>      (transparent — not pushed)
//   - className="literal", className='literal', className={`backtick`},
//     className={clsx("a", "b", var)}, className={cn("a", "b")}
//
// Skipped:
//   - className with ${...} template interpolation → empty classNames
//   - Comparison operators `a < b` (next-char must be A-Za-z or `/`)
//   - JSX inside string literals or comments (handled approximately by
//     the inString tracker)
function buildJsxElementStack(content: string): { elements: JsxStackEntry[]; crossFileBoundaryCount: number } {
  const elements: JsxStackEntry[] = [];
  const stack: number[] = []; // indices into elements[]
  let crossFileBoundaryCount = 0;
  let i = 0;
  const n = content.length;

  // Helper: extract className value from a tag's attribute body.
  // Returns the merged literal string; "" if dynamic-only or absent.
  const extractClassNames = (attrBody: string): string => {
    // Try simple literal forms first.
    const literalMatch = attrBody.match(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`$]*)`\})/);
    if (literalMatch) {
      const v = literalMatch[1] ?? literalMatch[2] ?? literalMatch[3] ?? "";
      return v;
    }
    // Try clsx / cn / classnames helper invocation.
    const helperMatch = attrBody.match(/className\s*=\s*\{\s*(?:clsx|cn|classnames|cva|twMerge)\s*\(([\s\S]+?)\)\s*\}/);
    if (helperMatch) {
      const args = helperMatch[1];
      const literals: string[] = [];
      const litRe = /["']([^"']+)["']/g;
      let lm: RegExpExecArray | null;
      while ((lm = litRe.exec(args)) !== null) {
        if (!/\$\{/.test(lm[1])) literals.push(lm[1]);
      }
      return literals.join(" ");
    }
    // Try simple `{"literal"}` wrapping.
    const braceLiteralMatch = attrBody.match(/className\s*=\s*\{\s*["']([^"']+)["']\s*\}/);
    if (braceLiteralMatch) return braceLiteralMatch[1];
    return "";
  };

  // Find tag end — first '>' not inside attribute braces or strings.
  const findTagEnd = (start: number): number => {
    let depth = 0;
    let inString: string | null = null;
    let p = start;
    while (p < n) {
      const c = content[p];
      if (inString !== null) {
        if (c === inString && content[p - 1] !== "\\") inString = null;
      } else if (c === '"' || c === "'" || c === "`") {
        inString = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
      } else if (c === ">" && depth === 0) {
        return p;
      }
      p++;
    }
    return -1;
  };

  while (i < n) {
    const ch = content[i];
    if (ch !== "<") { i++; continue; }
    const next = content[i + 1];
    if (!next) break;

    // Closing tag </Tag>
    if (next === "/") {
      const closeMatch = content.slice(i).match(/^<\/([A-Za-z][A-Za-z0-9_.\-]*|)\s*>/);
      if (closeMatch) {
        const tag = closeMatch[1];
        if (tag !== "") {
          // Pop stack to matching opener.
          for (let s = stack.length - 1; s >= 0; s--) {
            if (elements[stack[s]].tag === tag) {
              stack.length = s;
              break;
            }
          }
        }
        i += closeMatch[0].length;
        continue;
      }
      i++; continue;
    }

    // Fragment opener <>
    if (next === ">") { i += 2; continue; }

    // Must be A-Z or a-z to be an opening tag
    if (!/[A-Za-z]/.test(next)) { i++; continue; }

    // Read tag name
    let j = i + 1;
    while (j < n && /[A-Za-z0-9_.\-]/.test(content[j])) j++;
    const tag = content.slice(i + 1, j);
    if (tag.length === 0) { i++; continue; }

    // Find tag end
    const tagEnd = findTagEnd(j);
    if (tagEnd === -1) break;
    const attrBody = content.slice(j, tagEnd);
    const isSelfClosed = attrBody.trimEnd().endsWith("/");
    const classNames = /\$\{/.test(attrBody) && !/className\s*=\s*\{\s*(?:clsx|cn|classnames|cva|twMerge)\s*\(/.test(attrBody)
      ? "" // contains ${} interpolation outside helper — skip
      : extractClassNames(attrBody);

    const isComponent = /^[A-Z]/.test(tag);
    const lineIdx = content.slice(0, i).split("\n").length;
    const parentIndex = stack.length > 0 ? stack[stack.length - 1] : -1;

    elements.push({ tag, classNames, parentIndex, line: lineIdx, isComponent });
    if (!isSelfClosed) stack.push(elements.length - 1);

    i = tagEnd + 1;
  }
  return { elements, crossFileBoundaryCount };
}

// v6 — Walk JSX ancestor chain to find first ancestor with a bg-*
// className. Used by pass3Tailwind to:
//   (a) supply the opaque ancestor bg for alpha compositing when the
//       same-element bg has α<1 (e.g., `bg-white/5` overlay over a
//       dark navy parent renders as lifted-navy, NOT white)
//   (b) supply the bg for orphan text-* elements (no same-element bg-*)
//
// v7 — Recurses through translucent ancestors. When the first bg-*
// ancestor has α<1, walks further up to find what it's composited
// against. Builds a stack of overlays and resolves the final opaque
// hex via successive compositing (innermost → outermost). Always
// returns an opaque hex (alpha collapsed); both callers can drop
// the alpha conditional.
//
// MAX_DEPTH = 5 (defensive — real JSX rarely exceeds 2-3 levels of
// nested translucency). When cap hit OR no opaque ancestor found,
// falls back to #FFFFFF (Tailwind path has no equivalent of v5's
// page-context body bg — that's a v8 candidate alongside cross-file
// component composition).
//
// Returns null only when no bg-* ancestor exists at all in the
// lexical chain. Increments crossFileBoundaryCount when walking past
// a React component (capitalized tag) without finding bg-*.
type AncestorBgResult = {
  hex: string;                    // final composited opaque hex
  viaTag: string;                 // outermost ancestor's tag
  viaLine: number;                // outermost ancestor's line
  stack?: Array<{                 // overlays from outermost (closest to viewer) to base; populated only when ≥1 translucent layer
    hex: string;
    alpha: number;
    viaTag: string;
    viaLine: number;
  }>;
  baseHex?: string;               // the opaque value the stack composited against (only set when stack present)
  fellThroughToBody?: boolean;    // base was #FFFFFF default fallback (no opaque ancestor in chain AND no layout fallback either)
  depthExceeded?: boolean;        // recursion cap hit
  layoutFallbackUsed?: boolean;   // v8: stack ended in layout.tsx-resolved bg (longest-prefix match)
  layoutFallbackEntry?: LayoutBgContextEntry; // v8: the layout that supplied the base
};

const MAX_ANCESTOR_BG_DEPTH = 5;

function findAncestorBg(
  elementIndex: number,
  elements: JsxStackEntry[],
  counter: { crossFileBoundaryCount: number; depthExceededCount: number },
  layoutFallback: LayoutBgContextEntry | null = null,
  depth: number = 0
): AncestorBgResult | null {
  if (depth >= MAX_ANCESTOR_BG_DEPTH) {
    counter.depthExceededCount++;
    return null;
  }

  let parentIdx = elements[elementIndex].parentIndex;
  while (parentIdx >= 0) {
    const ancestor = elements[parentIdx];
    if (ancestor.classNames) {
      const tokens = ancestor.classNames.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        const variantStripped = token.replace(/^(hover|focus|active|disabled):/, "");
        if (/^(dark|sm|md|lg|xl|2xl):/.test(variantStripped)) continue;
        const resolved = resolveTailwindClass(variantStripped);
        if (!resolved || resolved.kind !== "bg") continue;

        // First bg-* match wins.
        if (resolved.alpha === undefined || resolved.alpha >= 1) {
          // Opaque — return directly, recursion terminates here.
          return {
            hex: resolved.hex,
            viaTag: ancestor.tag,
            viaLine: ancestor.line,
          };
        }

        // Translucent — recurse to find the bg this composites against.
        const inner = findAncestorBg(parentIdx, elements, counter, layoutFallback, depth + 1);

        let baseHex: string;
        let fellThrough = false;
        let priorStack: AncestorBgResult["stack"] = undefined;
        let depthExceededFromInner = false;
        let layoutUsed = false;
        let layoutEntry: LayoutBgContextEntry | undefined;

        if (inner) {
          baseHex = inner.hex;
          priorStack = inner.stack;
          fellThrough = inner.fellThroughToBody ?? false;
          depthExceededFromInner = inner.depthExceeded ?? false;
          layoutUsed = inner.layoutFallbackUsed ?? false;
          layoutEntry = inner.layoutFallbackEntry;
        } else if (layoutFallback) {
          // v8 — No opaque ancestor in lexical chain, but we have a
          // layout.tsx-derived bg from the route cascade. Use it.
          baseHex = layoutFallback.resolvedHex;
          layoutUsed = true;
          layoutEntry = layoutFallback;
        } else {
          // No opaque ancestor found AND no layout fallback — final
          // resort to #FFFFFF default.
          baseHex = "#FFFFFF";
          fellThrough = true;
        }

        // Composite this overlay against the resolved base.
        const composited = compositeAlpha(resolved.hex, resolved.alpha, baseHex);

        // Stack ordering: outermost (closest to viewer) first. The
        // current ancestor is OUTERmost relative to recursion deeper
        // ancestors — so it goes to the FRONT of the stack.
        const stack: NonNullable<AncestorBgResult["stack"]> = [
          { hex: resolved.hex, alpha: resolved.alpha, viaTag: ancestor.tag, viaLine: ancestor.line },
          ...(priorStack ?? []),
        ];

        return {
          hex: composited,
          viaTag: ancestor.tag,
          viaLine: ancestor.line,
          stack,
          baseHex,
          fellThroughToBody: fellThrough,
          depthExceeded: depthExceededFromInner,
          layoutFallbackUsed: layoutUsed,
          layoutFallbackEntry: layoutEntry,
        };
      }
    }
    if (ancestor.isComponent) counter.crossFileBoundaryCount++;
    parentIdx = ancestor.parentIndex;
  }

  // v8 — Walked all ancestors with NO bg-* match. If a layout fallback
  // is available, return it as a synthetic ancestor result so that
  // Case 2 orphan-text findings can pair against the route's layout bg
  // instead of skipping (the v7 `if (!anc) continue;` path).
  if (layoutFallback && depth === 0) {
    return {
      hex: layoutFallback.resolvedHex,
      viaTag: "<layout>",
      viaLine: 0,
      layoutFallbackUsed: true,
      layoutFallbackEntry: layoutFallback,
    };
  }
  return null;
}

// v8 — Layout bg context. Walks frontend/src/app/**/layout.tsx files
// at scanner startup, resolves the outermost wrapper's bg (either via
// Tailwind className or inline `style={{ background: ... }}`), and
// builds a Map<routePrefix, LayoutBgContextEntry> for route-aware
// fallback during pass3Tailwind contrast resolution.
//
// The map is consulted by findAncestorBg (via layoutFallbackHex
// parameter) when JSX recursion finds no opaque ancestor in the
// .tsx file's lexical chain — instead of falling through to #FFFFFF
// default, scanner resolves the page's actual layout cascade bg.
//
// Layout cascade: child layouts override parent layouts. Longest-
// prefix-wins on lookup (e.g. /dashboard/loads → /dashboard layout
// wins over / layout).
type LayoutBgContextEntry = {
  layoutFile: string;
  routePrefix: string;
  rawBg: string;                         // verbatim source (e.g. "var(--srl-bg-base)" or "bg-[#F7F8FA]")
  resolvedHex: string;                   // final resolved opaque hex
  source:
    | "tailwind-class"
    | "inline-style-literal"
    | "inline-style-var";
  unresolvedReason?: string;             // when resolution failed
  conditionalLayout?: boolean;           // first-branch wins on conditionals
};

// Convert a layout.tsx file path to its Next.js app-router route prefix.
//   frontend/src/app/layout.tsx              → /
//   frontend/src/app/dashboard/layout.tsx    → /dashboard
//   frontend/src/app/shipper/dashboard/...   → /shipper/dashboard
function deriveRoutePrefix(layoutFile: string): string {
  const appRoot = path.join(REPO_ROOT, "frontend/src/app");
  const rel = path.relative(appRoot, layoutFile).replace(/\\/g, "/");
  const dir = path.posix.dirname(rel);
  return dir === "." ? "/" : "/" + dir;
}

// Resolve an inline `style={{ background: '...' }}` value to an opaque
// hex. Reuses Pass 3 var resolution for var(--name) lookups.
function resolveStyleBgValue(
  raw: string,
  vars: VarMap
): { hex: string | null; alpha?: number; source: "literal" | "var"; unresolvedReason?: string } {
  const v = raw.trim();

  // var(--name) — defer to existing resolveColor for var resolution.
  if (/^var\(/i.test(v)) {
    const resolved = resolveColor(v, vars);
    if (resolved.hex) {
      return { hex: resolved.hex, alpha: resolved.alpha, source: "var" };
    }
    return { hex: null, source: "var", unresolvedReason: resolved.unresolved ?? "var-unresolvable" };
  }

  // Direct literal — hex, rgb(a), hsl(a). Defer to resolveColor.
  const resolved = resolveColor(v, vars);
  if (resolved.hex) {
    return { hex: resolved.hex, alpha: resolved.alpha, source: "literal" };
  }
  return { hex: null, source: "literal", unresolvedReason: resolved.unresolved ?? "non-color-value" };
}

// Build the layoutBgContext map from layout.tsx files.
// Walks each layout file:
//   1. First-pass: regex-match `style={{ background: '...' }}` on outer wrapper
//   2. Second-pass: walk JSX, find first element with bg-* className token
// First match wins. Files with no resolvable bg are simply absent from
// the map (longest-prefix lookup falls through to next-shorter prefix).
function buildLayoutBgContext(
  tsxFiles: string[],
  vars: VarMap
): Map<string, LayoutBgContextEntry> {
  const map = new Map<string, LayoutBgContextEntry>();
  const appRoot = path.join(REPO_ROOT, "frontend/src/app");

  // Filter to layout.tsx files under app/ only.
  const layoutFiles = tsxFiles.filter((f) => {
    const norm = f.replace(/\\/g, "/");
    if (!norm.startsWith(appRoot.replace(/\\/g, "/"))) return false;
    return path.basename(norm) === "layout.tsx";
  });

  for (const file of layoutFiles) {
    const content = readFile(file);
    const routePrefix = deriveRoutePrefix(file);

    // 1) Inline style={{ background: '...' }} — match first occurrence.
    //    Allow other style props before/after `background:`.
    const styleBgRe = /style\s*=\s*\{\{[^}]*background\s*:\s*(['"`])([^'"`]+)\1[^}]*\}\}/;
    const styleMatch = styleBgRe.exec(content);
    if (styleMatch) {
      const raw = styleMatch[2];
      const resolved = resolveStyleBgValue(raw, vars);
      if (resolved.hex) {
        // Layouts with translucent outermost bg are rare; treat as
        // composited-against-#FFFFFF here (consistent with rest of
        // scanner; v9 candidate to recurse).
        const finalHex = resolved.alpha !== undefined && resolved.alpha < 1
          ? compositeAlpha(resolved.hex, resolved.alpha, "#FFFFFF")
          : resolved.hex;
        map.set(routePrefix, {
          layoutFile: file,
          routePrefix,
          rawBg: raw,
          resolvedHex: finalHex,
          source: resolved.source === "var" ? "inline-style-var" : "inline-style-literal",
        });
        continue;
      }
      // Inline style with unresolvable value — record as unresolved
      // for trail visibility, then continue to JSX walk.
      map.set(routePrefix, {
        layoutFile: file,
        routePrefix,
        rawBg: raw,
        resolvedHex: "#FFFFFF", // best-effort fallback
        source: resolved.source === "var" ? "inline-style-var" : "inline-style-literal",
        unresolvedReason: resolved.unresolvedReason,
      });
      continue;
    }

    // 2) JSX walk — restrict to the rendered tree of the LAST root JSX
    //    expression in the file. A layout file may have helper JSX
    //    blocks defined as variables earlier in source (e.g. accounting
    //    layout's `sidebarContent` const); those are NOT the rendered
    //    outermost wrapper. The function's return JSX appears LAST in
    //    source, so its root element is the final parentIndex===-1
    //    element in the buildJsxElementStack sequence; descendants of
    //    that root are the actual render-tree.
    const { elements } = buildJsxElementStack(content);
    let lastRootIdx = -1;
    for (let i = elements.length - 1; i >= 0; i--) {
      if (elements[i].parentIndex === -1) {
        lastRootIdx = i;
        break;
      }
    }
    if (lastRootIdx === -1) continue;

    // Collect the last-root subtree by index. Walk forward from
    // lastRootIdx, including only elements whose parentIndex chain
    // resolves back to lastRootIdx.
    const inSubtree = new Set<number>([lastRootIdx]);
    for (let i = lastRootIdx + 1; i < elements.length; i++) {
      const e = elements[i];
      if (e.parentIndex >= 0 && inSubtree.has(e.parentIndex)) {
        inSubtree.add(i);
      }
    }

    let found = false;
    for (const idx of Array.from(inSubtree).sort((a, b) => a - b)) {
      const elem = elements[idx];
      if (!elem.classNames) continue;
      const tokens = elem.classNames.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        const stripped = token.replace(/^(hover|focus|active|disabled):/, "");
        if (/^(dark|sm|md|lg|xl|2xl):/.test(stripped)) continue;
        const resolved = resolveTailwindClass(stripped);
        if (!resolved || resolved.kind !== "bg") continue;

        const finalHex = resolved.alpha === undefined || resolved.alpha >= 1
          ? resolved.hex
          : compositeAlpha(resolved.hex, resolved.alpha, "#FFFFFF");

        map.set(routePrefix, {
          layoutFile: file,
          routePrefix,
          rawBg: token,
          resolvedHex: finalHex,
          source: "tailwind-class",
        });
        found = true;
        break;
      }
      if (found) break;
    }
  }
  return map;
}

// Find the most-specific layout bg for a given page file via longest-
// prefix match against the layoutBgContext map. Returns null when no
// layout in the chain has a resolvable bg (caller falls back to
// #FFFFFF default).
function findLayoutBgForPage(
  pageFile: string,
  layoutBgContext: Map<string, LayoutBgContextEntry>
): LayoutBgContextEntry | null {
  const appRoot = path.join(REPO_ROOT, "frontend/src/app").replace(/\\/g, "/");
  const norm = pageFile.replace(/\\/g, "/");
  if (!norm.startsWith(appRoot)) return null;

  const rel = path.posix.relative(appRoot, norm);
  const dir = path.posix.dirname(rel);
  const pageRoute = dir === "." ? "/" : "/" + dir;

  let bestMatch: LayoutBgContextEntry | null = null;
  let bestLen = -1;
  for (const [prefix, entry] of Array.from(layoutBgContext.entries())) {
    const matches =
      prefix === "/" ||
      pageRoute === prefix ||
      pageRoute.startsWith(prefix + "/");
    if (matches && prefix.length > bestLen) {
      bestMatch = entry;
      bestLen = prefix.length;
    }
  }
  return bestMatch;
}

function pass3Tailwind(
  tsxFiles: string[],
  layoutBgContext: Map<string, LayoutBgContextEntry>
): {
  findings: ContrastFinding[];
  scanned: number;
  pairsEvaluated: number;
  dynamicSkippedFiles: number;
  ancestorBgFiringCount: number;
  orphanTextFiringCount: number;
  crossFileBoundaryCount: number;
  recursionFiringCount: number;
  recursionDepthHistogram: Record<number, number>;
  depthExceededCount: number;
  fellThroughToBodyCount: number;
  layoutFallbackFiringCount: number;
  layoutPrefixHistogram: Record<string, number>;
  layoutNotFoundCount: number;
} {
  const findings: ContrastFinding[] = [];
  let pairsEvaluated = 0;
  let dynamicSkippedFiles = 0;
  let ancestorBgFiringCount = 0;     // v6: same-element pair used ancestor for alpha compositing
  let orphanTextFiringCount = 0;     // v6: text-only element resolved bg via ancestor walking
  let recursionFiringCount = 0;      // v7: ancestor result included a translucent stack (≥1 overlay)
  let fellThroughToBodyCount = 0;    // v7: stack base was #FFFFFF default (no opaque ancestor in chain)
  let layoutFallbackFiringCount = 0; // v8: ancestor result used a layout.tsx-resolved bg (longest-prefix match)
  let layoutNotFoundCount = 0;       // v8: file outside app-router OR no matching layout — falls to #FFFFFF
  const recursionDepthHistogram: Record<number, number> = {}; // v7: stack-depth distribution
  const layoutPrefixHistogram: Record<string, number> = {};   // v8: which layout prefix supplied the fallback most often
  const counter = { crossFileBoundaryCount: 0, depthExceededCount: 0 }; // v6/v7
  const dynamicLogged = new Set<string>();
  const dynamicRe = /className\s*=\s*\{[^}]*`[^`]*\$\{/;

  // Skip layout.tsx files themselves from the contrast scan — they're
  // structural wrappers, not content surfaces. Their bg is consumed
  // via layoutBgContext as a FALLBACK for child page.tsx files; double-
  // counting them as their own targets would inflate findings without
  // surfacing real readability issues.
  const layoutFilesSet = new Set(
    Array.from(layoutBgContext.values()).map((e) => e.layoutFile)
  );

  for (const file of tsxFiles) {
    if (layoutFilesSet.has(file)) continue;
    const content = readFile(file);

    if (dynamicRe.test(content) && !dynamicLogged.has(file)) {
      dynamicLogged.add(file);
      dynamicSkippedFiles++;
    }

    // v8 — Resolve layout fallback bg for this file's route ONCE per
    // file. Used by findAncestorBg as the final fallback when no
    // opaque JSX ancestor is found in the lexical chain.
    const layoutFallback = findLayoutBgForPage(file, layoutBgContext);
    if (!layoutFallback) layoutNotFoundCount++;

    // v6 — Build JSX element stack for this file ONCE, then walk it
    // for each element's classNames. Replaces v5's regex-only pass
    // that lacked ancestor context.
    const { elements } = buildJsxElementStack(content);

    for (let elemIdx = 0; elemIdx < elements.length; elemIdx++) {
      const elem = elements[elemIdx];
      if (!elem.classNames || /\$\{/.test(elem.classNames)) continue;

      // Tokenize + group by pseudo-variant (existing v5 logic).
      const tokens = elem.classNames.split(/\s+/).filter(Boolean);
      const groups = new Map<
        string,
        { bg?: { hex: string; alpha?: number; raw: string }; text?: { hex: string; alpha?: number; raw: string } }
      >();
      for (const token of tokens) {
        const variantMatch = token.match(/^(hover|focus|active|disabled):(.+)$/);
        const variant = variantMatch ? variantMatch[1] : "base";
        const cls = variantMatch ? variantMatch[2] : token;
        if (/^(dark|sm|md|lg|xl|2xl):/.test(cls)) continue;
        const resolved = resolveTailwindClass(cls);
        if (!resolved) continue;
        const group = groups.get(variant) ?? {};
        if (resolved.kind === "bg") {
          group.bg = { hex: resolved.hex, alpha: resolved.alpha, raw: resolved.raw };
        } else {
          group.text = { hex: resolved.hex, alpha: resolved.alpha, raw: resolved.raw };
        }
        groups.set(variant, group);
      }

      // Lazy ancestor lookup — call only when needed, reuse result
      // across variants for this same element. v8 — passes
      // layoutFallback so findAncestorBg can substitute layout.tsx-
      // resolved bg in place of #FFFFFF when no opaque JSX ancestor
      // is found in the lexical chain.
      let ancestorBg: ReturnType<typeof findAncestorBg> = undefined as any;
      const getAncestor = () => {
        if (ancestorBg === undefined) {
          ancestorBg = findAncestorBg(elemIdx, elements, counter, layoutFallback);
        }
        return ancestorBg;
      };

      // v7/v8 — Format the recursion stack as a human-readable composition
      // trail for finding-output transparency.
      // Format: "ancestor stack: <tag> α=X.XX <hex> → <tag> α=X.XX <hex> → <baseHex> composited: <finalHex> (depth=N)"
      // Outermost layer first (closest to viewer), base last. v8 adds
      // "layout: <route-prefix> (<source>) bg-<raw>" suffix when the
      // base resolved via layout.tsx fallback.
      const formatAncestorStack = (anc: NonNullable<ReturnType<typeof findAncestorBg>>): string => {
        const layoutSuffix = anc.layoutFallbackUsed && anc.layoutFallbackEntry
          ? ` · layout: ${anc.layoutFallbackEntry.routePrefix} (${anc.layoutFallbackEntry.source}) bg=${anc.layoutFallbackEntry.rawBg}→${anc.layoutFallbackEntry.resolvedHex}`
          : "";

        if (!anc.stack || anc.stack.length === 0) {
          // Either bare opaque ancestor (v6) OR v8 synthetic
          // layout-fallback ancestor (no JSX ancestor existed at all).
          if (anc.layoutFallbackUsed && anc.layoutFallbackEntry) {
            return ` · ancestor <layout> bg=${anc.hex}${layoutSuffix}`;
          }
          return ` · ancestor <${anc.viaTag}> bg=${anc.hex} (line ${anc.viaLine})`;
        }
        const layerStr = anc.stack
          .map((l) => `<${l.viaTag}> α=${l.alpha.toFixed(2)} ${l.hex}`)
          .join(" → ");
        let baseStr: string;
        if (anc.layoutFallbackUsed) {
          baseStr = `${anc.baseHex} (layout fallback)`;
        } else if (anc.fellThroughToBody) {
          baseStr = `${anc.baseHex} (default fallback)`;
        } else {
          baseStr = `${anc.baseHex}`;
        }
        const depthFlag = anc.depthExceeded ? " [depth-cap-hit]" : "";
        return ` · ancestor stack: ${layerStr} → ${baseStr} composited: ${anc.hex} (depth=${anc.stack.length})${depthFlag}${layoutSuffix}`;
      };

      // v7/v8 — Track recursion firing + depth + body fall-through +
      // layout fallback usage. Idempotent within a single ancestor
      // result (Case 1 + Case 2 both call this; the result is
      // memoized via getAncestor()).
      let accountedFor = false;
      const accountForRecursion = (anc: NonNullable<ReturnType<typeof findAncestorBg>>) => {
        if (accountedFor) return;
        accountedFor = true;
        if (anc.stack && anc.stack.length > 0) {
          recursionFiringCount++;
          recursionDepthHistogram[anc.stack.length] = (recursionDepthHistogram[anc.stack.length] ?? 0) + 1;
          if (anc.fellThroughToBody) fellThroughToBodyCount++;
        }
        if (anc.layoutFallbackUsed && anc.layoutFallbackEntry) {
          layoutFallbackFiringCount++;
          const prefix = anc.layoutFallbackEntry.routePrefix;
          layoutPrefixHistogram[prefix] = (layoutPrefixHistogram[prefix] ?? 0) + 1;
        }
      };

      for (const [variant, group] of Array.from(groups.entries())) {
        // Case 1: same-element bg + text pair (v5 behavior).
        if (group.bg && group.text) {
          pairsEvaluated++;

          // v6/v7 — When same-element bg has α<1, composite against the
          // JSX ancestor's opaque bg (resolved via v7 recursion) instead
          // of #FFFFFF default. Closes the bg-white/5 + text-white false-
          // positive class where the overlay actually sits on a dark
          // navy ancestor (possibly through nested translucent layers).
          let parentBgHex = "#FFFFFF";
          let usedAncestor: ReturnType<typeof findAncestorBg> = null;
          if (group.bg.alpha !== undefined && group.bg.alpha < 1) {
            const anc = getAncestor();
            if (anc) {
              parentBgHex = anc.hex; // v7: hex is always opaque (recursion collapsed any stack)
              usedAncestor = anc;
              ancestorBgFiringCount++;
              accountForRecursion(anc);
            }
          }

          let bg = group.bg.hex;
          if (group.bg.alpha !== undefined && group.bg.alpha < 1) {
            bg = compositeAlpha(group.bg.hex, group.bg.alpha, parentBgHex);
          }
          let fg = group.text.hex;
          if (group.text.alpha !== undefined && group.text.alpha < 1) {
            fg = compositeAlpha(group.text.hex, group.text.alpha, bg);
          }

          const ratio = contrastRatio(bg, fg);
          if (ratio === null) continue;
          const sev = contrastSeverity(ratio);
          if (sev) {
            const variantLabel = variant === "base" ? "" : `${variant}:`;
            const ancTrail = usedAncestor ? formatAncestorStack(usedAncestor) : "";
            findings.push({
              file,
              selector: `Tailwind <${elem.tag}> ${variantLabel}${group.bg.raw} + ${variantLabel}${group.text.raw}`,
              background: bg,
              foreground: fg,
              ratio: Math.round(ratio * 100) / 100,
              severity: sev,
              note: `tailwind ${variant}: bg=${group.bg.raw}→${bg} text=${group.text.raw}→${fg} (line ${elem.line})${ancTrail}`,
            });
          }
          continue;
        }

        // Case 2: orphan text-* on element with no same-element bg-*
        // (v6 — added, v7 — recursion, v8 — layout fallback). Walk JSX
        // ancestors to find bg context; pair text against that.
        if (group.text && !group.bg) {
          const anc = getAncestor();
          // v8 — `anc` is null only when there's neither a JSX bg ancestor
          // nor a layout.tsx-resolved fallback (file outside app-router OR
          // no matching layout in the route cascade). Skip in that case.
          if (!anc) continue;
          orphanTextFiringCount++;
          pairsEvaluated++;
          accountForRecursion(anc);

          // v7 — anc.hex is always opaque (recursion collapsed any stack);
          // the v6 "if anc.alpha < 1, composite against #FFFFFF"
          // simplification is gone.
          let bg = anc.hex;
          let fg = group.text.hex;
          if (group.text.alpha !== undefined && group.text.alpha < 1) {
            fg = compositeAlpha(group.text.hex, group.text.alpha, bg);
          }

          const ratio = contrastRatio(bg, fg);
          if (ratio === null) continue;
          const sev = contrastSeverity(ratio);
          if (sev) {
            const variantLabel = variant === "base" ? "" : `${variant}:`;
            findings.push({
              file,
              selector: `Tailwind <${elem.tag}> ${variantLabel}${group.text.raw} (orphan-text, ancestor bg)`,
              background: bg,
              foreground: fg,
              ratio: Math.round(ratio * 100) / 100,
              severity: sev,
              note: `tailwind ${variant} (orphan-text): text=${group.text.raw}→${fg} (text line ${elem.line})${formatAncestorStack(anc)}`,
            });
          }
        }
      }
    }
  }

  return {
    findings,
    scanned: tsxFiles.length,
    pairsEvaluated,
    dynamicSkippedFiles,
    ancestorBgFiringCount,
    orphanTextFiringCount,
    crossFileBoundaryCount: counter.crossFileBoundaryCount,
    recursionFiringCount,
    recursionDepthHistogram,
    depthExceededCount: counter.depthExceededCount,
    fellThroughToBodyCount,
    layoutFallbackFiringCount,
    layoutPrefixHistogram,
    layoutNotFoundCount,
  };
}

// ─── Output formatter ───────────────────────────────────────────────────

function buildReport(
  scopeCounts: { html: number; css: number; tsx: number; ts: number },
  pass1: ColorFinding[],
  pass2: FontFinding[],
  pass3: { findings: ContrastFinding[]; unresolved: UnresolvedFinding[]; resolved: number; skippedMedia: number; inferredBody: string | null; compositedCount: number; globalMatchCount: number; ambiguousGlobalCount: number; pageContextMatchCount: number; pageContextConflictsCount: number; tailwindFindingsCount: number; tailwindPairsEvaluated: number; tailwindDynamicSkippedFiles: number; tailwindAncestorBgFiringCount: number; tailwindOrphanTextFiringCount: number; tailwindCrossFileBoundaryCount: number; tailwindRecursionFiringCount: number; tailwindRecursionDepthHistogram: Record<number, number>; tailwindDepthExceededCount: number; tailwindFellThroughToBodyCount: number; tailwindLayoutFallbackFiringCount: number; tailwindLayoutPrefixHistogram: Record<string, number>; tailwindLayoutNotFoundCount: number; layoutBgContextSize: number; layoutBgContextEntries: LayoutBgContextEntry[] }
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  const allFindings = [
    ...pass1.map((f) => ({ ...f, pass: 1 as const })),
    ...pass2.map((f) => ({ ...f, pass: 2 as const })),
    ...pass3.findings.map((f) => ({ ...f, pass: 3 as const })),
  ];
  const counts = (sev: Severity) => allFindings.filter((f) => f.severity === sev).length;
  const passCounts = (n: 1 | 2 | 3, sev: Severity) =>
    allFindings.filter((f) => f.pass === n && f.severity === sev).length;

  lines.push(`# SRL Brand Conformance Audit — Run ${now}`);
  lines.push("");
  lines.push(`Tool: \`backend/scripts/audit-brand-conformance.ts\` v8 (alpha-overlay + pseudo-class cascade + multi-mode tokens + HTML hints + cross-file bgRules + page-context body-bg + Tailwind .tsx contrast + JSX tree walking + translucent-ancestor recursion + app-router layout.tsx body-bg)`);
  lines.push("");
  lines.push(`## Scope`);
  lines.push("");
  lines.push(`| Category | Files |`);
  lines.push(`|---|---:|`);
  lines.push(`| frontend/public/**/*.html | ${scopeCounts.html} |`);
  lines.push(`| frontend/public/**/*.css | ${scopeCounts.css} |`);
  lines.push(`| frontend/src/**/*.tsx | ${scopeCounts.tsx} |`);
  lines.push(`| frontend/src/**/*.ts | ${scopeCounts.ts} |`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Pass | Total scanned | P0 | P1 | P2 |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  lines.push(`| 1 — Color literals | ${pass1.length} | ${passCounts(1, "P0")} | ${passCounts(1, "P1")} | ${passCounts(1, "P2")} |`);
  lines.push(`| 2 — Font families | ${pass2.length} | ${passCounts(2, "P0")} | ${passCounts(2, "P1")} | ${passCounts(2, "P2")} |`);
  lines.push(`| 3 — Surface contrast | ${pass3.findings.length} | ${passCounts(3, "P0")} | ${passCounts(3, "P1")} | ${passCounts(3, "P2")} |`);
  lines.push(`| **Totals** | **${pass1.length + pass2.length + pass3.findings.length}** | **${counts("P0")}** | **${counts("P1")}** | **${counts("P2")}** |`);
  lines.push("");
  lines.push(`**Pass 3 variable resolution**: ${pass3.resolved} resolved · ${pass3.unresolved.length} unresolved · ${pass3.skippedMedia} \`@media\` blocks skipped (v2 candidate).`);
  lines.push("");
  lines.push(`**Pass 3 inferred cascade body color**: ${pass3.inferredBody ? `\`${pass3.inferredBody}\` (resolved from body/html/:root color rule)` : "**unresolved** — cascade-inheritance findings degraded to P1 advisory"}.`);
  lines.push("");
  lines.push(`**Pass 3 alpha-overlay compositing (v2)**: ${pass3.compositedCount} finding(s) used alpha compositing — overlay rgba/hex composited over nearest opaque ancestor before contrast math, eliminating the alpha-stripping false-positive class from v1.`);
  lines.push("");
  lines.push(`**Pass 3 cross-file bgRules merging (v4)**: ${pass3.globalMatchCount} finding(s) resolved their opaque parent bg via the global cross-file index (Tier 3 / Tier 4 fallback) — themed selectors in themes.css whose parent rule lives in console.css or page CSS. ${pass3.ambiguousGlobalCount} of those had ambiguous matches (multiple files defined the same selector); first-match-wins per directive, ambiguity count surfaced in finding-output trail for triage.`);
  lines.push("");
  lines.push(`**Pass 3 page-context body-bg (v5)**: ${pass3.pageContextMatchCount} finding(s) resolved their parent bg via the per-page HTML-aware Tier-5 fallback — closes the carrier-portal pattern where tools.css widgets composite over the carrier portal's navy body bg (set by carrier-console.css) rather than the AE Console marketing-page white default. ${pass3.pageContextConflictsCount} of those had conflicting matches across multiple HTML pages (first-match-wins per directive, conflicts count surfaced in trail).`);
  lines.push("");
  lines.push(`**Pass 3 Tailwind contrast on .tsx (v5+v6)**: ${pass3.tailwindFindingsCount} finding(s) from ${pass3.tailwindPairsEvaluated} text+bg pairs evaluated across React .tsx components. ${pass3.tailwindDynamicSkippedFiles} file(s) had dynamic className interpolation skipped.`);
  lines.push("");
  lines.push(`**Pass 3 v6 JSX tree walking**: ${pass3.tailwindAncestorBgFiringCount} ancestor-bg lookups (same-element pairs with translucent bg → composited against opaque ancestor instead of #FFFFFF default). ${pass3.tailwindOrphanTextFiringCount} orphan-text findings (text-* element with no same-element bg-* — paired against ancestor bg). ${pass3.tailwindCrossFileBoundaryCount} React component boundaries walked past (capitalized-tag ancestors without bg-*; can't resolve into the component's own className from here per v8 cross-file deferral).`);
  lines.push("");
  const histogramStr = Object.keys(pass3.tailwindRecursionDepthHistogram)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b)
    .map((d) => `depth=${d}: ${pass3.tailwindRecursionDepthHistogram[d]}`)
    .join(", ") || "(no recursion fired)";
  lines.push(`**Pass 3 v7 translucent-ancestor recursion**: ${pass3.tailwindRecursionFiringCount} ancestor lookups built a translucent stack (≥1 overlay layer composited through to an opaque base). Stack depth distribution: ${histogramStr}. ${pass3.tailwindFellThroughToBodyCount} of those fell through to #FFFFFF default base (no opaque ancestor in lexical chain AND no layout.tsx fallback — v8 candidate when route is outside app/). ${pass3.tailwindDepthExceededCount} recursion(s) hit MAX_DEPTH=5 cap (defensive — real JSX rarely exceeds 2-3 levels). v6's "composite translucent ancestor against #FFFFFF" simplification retired; ancestor hex is always opaque after v7.`);
  lines.push("");

  // v8 — Layout bg context summary.
  const layoutPrefixStr = Object.keys(pass3.tailwindLayoutPrefixHistogram)
    .map((p) => ({ p, n: pass3.tailwindLayoutPrefixHistogram[p] }))
    .sort((a, b) => b.n - a.n)
    .map((e) => `${e.p}=${e.n}`)
    .join(", ") || "(no firings)";
  const layoutEntriesSummary = pass3.layoutBgContextEntries
    .map((e) => `${e.routePrefix}→${e.resolvedHex} (${e.source})`)
    .join("; ");
  lines.push(`**Pass 3 v8 app-router layout.tsx body-bg**: ${pass3.layoutBgContextSize} layout file(s) registered with resolvable bg (${layoutEntriesSummary}). ${pass3.tailwindLayoutFallbackFiringCount} ancestor lookups used the layout-fallback (longest-prefix-wins) — closes the v7 fall-through class for pages whose actual bg comes from app-router layout cascade rather than inline className. Top route prefixes by firings: ${layoutPrefixStr}. ${pass3.tailwindLayoutNotFoundCount} file(s) had no layout match in the route cascade (file outside app/ OR page in route segment with no layout.tsx — falls to #FFFFFF default).`);
  lines.push("");

  // ── P0 section
  lines.push(`## P0 — Readability Failures (fix immediately)`);
  lines.push("");
  const p0 = allFindings.filter((f) => f.severity === "P0");
  if (p0.length === 0) {
    lines.push(`✅ No P0 findings.`);
  } else {
    lines.push(`Pass 3 contrast violations <3:1 + Pass 2 critical font fallbacks. Group by file below.`);
    lines.push("");
    const byFile = groupByFile(p0);
    for (const file of Object.keys(byFile).sort()) {
      lines.push(`### \`${relPath(file)}\``);
      lines.push("");
      for (const f of byFile[file]) {
        if ((f as any).pass === 3) {
          const cf = f as ContrastFinding & { pass: 3 };
          lines.push(`- **${cf.selector}** — bg \`${cf.background}\` · fg \`${cf.foreground}\` · ratio **${cf.ratio.toFixed(2)}:1**. ${cf.note}`);
        } else {
          const cf = f as (ColorFinding | FontFinding) & { pass: 1 | 2 };
          const lineRef = "line" in cf ? cf.line : 0;
          lines.push(`- L${lineRef} — \`${escapeMd(cf.match || "")}\` — ${cf.reason}`);
        }
      }
      lines.push("");
    }
  }

  // ── P1 section
  lines.push(`## P1 — Token Drift (fix in next sprint)`);
  lines.push("");
  const p1 = allFindings.filter((f) => f.severity === "P1");
  if (p1.length === 0) {
    lines.push(`✅ No P1 findings.`);
  } else {
    lines.push(`Pass 1 non-canonical hex/rgba/Tailwind palette + Pass 2 non-canonical fonts + Pass 3 borderline contrast (3:1 to 4.5:1). Sorted by frequency to surface root-cause candidates first.`);
    lines.push("");
    const groupedByMatch = groupByMatch(p1);
    const top = Object.entries(groupedByMatch).sort((a, b) => b[1].length - a[1].length).slice(0, 30);
    lines.push(`| Token / Pattern | Count | Example file:line |`);
    lines.push(`|---|---:|---|`);
    for (const [match, items] of top) {
      const ex = items[0];
      const lineRef = "line" in (ex as any) ? (ex as any).line : "—";
      lines.push(`| \`${escapeMd(match)}\` | ${items.length} | \`${relPath(ex.file)}:${lineRef}\` |`);
    }
    lines.push("");
    lines.push(`*Top 30 by occurrence shown. Cross-check against \`frontend/src/lib/site-chrome.json\` and \`frontend/public/shared/css/themes.css\` — one source-of-truth edit may resolve dozens of downstream findings.*`);
  }
  lines.push("");

  // ── P2 section
  lines.push(`## P2 — Informational`);
  lines.push("");
  const p2 = allFindings.filter((f) => f.severity === "P2");
  lines.push(`${p2.length} findings: comment-block hex values, canonical-hex literals (token-discipline drift — use \`var(--token)\` instead), and deferred edge cases.`);
  if (p2.length > 0) {
    const groupedByMatch = groupByMatch(p2);
    const top = Object.entries(groupedByMatch).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
    lines.push("");
    lines.push(`| Token / Pattern | Count | Reason class |`);
    lines.push(`|---|---:|---|`);
    for (const [match, items] of top) {
      lines.push(`| \`${escapeMd(match)}\` | ${items.length} | ${(items[0].reason || items[0].note || "").slice(0, 60)} |`);
    }
  }
  lines.push("");

  // ── Pass 3 unresolved variables
  if (pass3.unresolved.length > 0) {
    lines.push(`## Pass 3 — Unresolved variables (manual review needed)`);
    lines.push("");
    lines.push(`Variables that could not be resolved to a concrete hex during scanning. Cross-file cascade resolution is a v2 candidate. v1 surfaces these so the count signals whether v2 is necessary.`);
    lines.push("");
    lines.push(`| File | Selector | Property | Value | Reason |`);
    lines.push(`|---|---|---|---|---|`);
    for (const u of pass3.unresolved.slice(0, 50)) {
      lines.push(`| \`${relPath(u.file)}\` | \`${escapeMd(u.selector.slice(0, 40))}\` | ${u.property} | \`${escapeMd(u.value.slice(0, 30))}\` | ${u.reason.slice(0, 50)} |`);
    }
    if (pass3.unresolved.length > 50) {
      lines.push("");
      lines.push(`*${pass3.unresolved.length - 50} more truncated. See raw output.*`);
    }
    lines.push("");
  }

  // ── Notes
  lines.push(`## Notes for human triage`);
  lines.push("");
  lines.push(`- All findings are **CANDIDATES** — manual review required before fixing. Scanner is heuristic, not AST-aware.`);
  lines.push(`- Pass 3 unresolved-variable findings need DOM inspection or v2 cascade resolution; do not assume they are violations.`);
  lines.push(`- LEGACY-ALLOWED hex set (per CLAUDE.md §2.1) is suppressed from P1: \`#0D1B2A\`, \`#854F0B\`, \`#0F1117\`, \`#1A1A2E\`, \`#0A1220\`, \`#FAF9F7\`, plus doc-header gradient stop \`#1A2D45\` and assorted legacy gold values. Migration tracked under Phase 6 — Theme System Cleanup.`);
  lines.push(`- PDF templates at \`backend/src/services/pdfService.ts\` carry their own hardcoded PDFKit colors and are **out of frontend scope** per Sprint 2 directive. Separate PDF-conformance pass needed if/when PDFKit color migration is scheduled.`);
  lines.push(`- Pass 3 specifically catches: (a) the /about footer pattern — navy bg with no explicit \`color:\` declaration, child text inheriting --fg-1 navy → navy-on-navy; (b) the /track navy-on-navy class — same shape on portal canvas.`);
  lines.push(`- Pass 2 \`@import\` Google Fonts findings are root causes; one CSS file edit can eliminate downstream font-family violations on the same page.`);
  lines.push("");

  return lines.join("\n");
}

function groupByFile<T extends { file: string }>(items: T[]): { [file: string]: T[] } {
  const out: { [file: string]: T[] } = {};
  for (const it of items) {
    if (!out[it.file]) out[it.file] = [];
    out[it.file].push(it);
  }
  return out;
}

interface GroupItem {
  match?: string;
  selector?: string;
  reason?: string;
  note?: string;
  file: string;
  line?: number;
}

function groupByMatch(items: GroupItem[]): { [key: string]: GroupItem[] } {
  const out: { [key: string]: GroupItem[] } = {};
  for (const it of items) {
    const key =
      it.match ||
      it.selector ||
      (it.reason && it.reason.slice(0, 30)) ||
      (it.note && it.note.slice(0, 30)) ||
      "(unknown)";
    if (!out[key]) out[key] = [];
    out[key].push(it);
  }
  return out;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/`/g, "\\`");
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  console.error("[brand-audit] Walking frontend scope...");
  const htmlFiles = walkFiles(FRONTEND_PUBLIC, [".html"]);
  const cssFiles = walkFiles(FRONTEND_PUBLIC, [".css"]);
  const tsxFiles = walkFiles(FRONTEND_SRC, [".tsx"]);
  const tsFiles = walkFiles(FRONTEND_SRC, [".ts"]).filter((f) => !f.endsWith(".d.ts"));

  console.error(
    `[brand-audit] Scope: html=${htmlFiles.length} css=${cssFiles.length} tsx=${tsxFiles.length} ts=${tsFiles.length}`
  );

  const allFiles = [...htmlFiles, ...cssFiles, ...tsxFiles, ...tsFiles];
  if (fs.existsSync(SITE_CHROME_JSON)) allFiles.push(SITE_CHROME_JSON);

  console.error("[brand-audit] Pass 1 — color literals...");
  const pass1 = pass1Color(allFiles);
  console.error(`[brand-audit] Pass 1: ${pass1.length} findings.`);

  console.error("[brand-audit] Pass 2 — font families...");
  const pass2 = pass2Fonts([...htmlFiles, ...cssFiles, ...tsxFiles, ...tsFiles]);
  console.error(`[brand-audit] Pass 2: ${pass2.length} findings.`);

  console.error("[brand-audit] Pass 3 — surface contrast...");
  // v8 — Include globals.css from app-router for layout var resolution.
  // Public CSS files don't define `--srl-*` tokens; those live in
  // frontend/src/app/globals.css (loaded via root layout via `import
  // "./globals.css"`). Without this, layout.tsx files using
  // style={{ background: 'var(--srl-bg-base)' }} resolve to "unresolved"
  // and fall back to #FFFFFF instead of the actual cream/navy bg.
  const globalsCss = path.join(FRONTEND_SRC, "app/globals.css");
  const cssFilesForVars = fs.existsSync(globalsCss) ? [...cssFiles, globalsCss] : cssFiles;
  const vars = buildVarMap(cssFilesForVars);
  console.error(`[brand-audit] Pass 3 var map: ${Object.keys(vars).length} CSS variables resolved.`);
  const pass3 = pass3Contrast(cssFiles, vars, htmlFiles);
  console.error(
    `[brand-audit] Pass 3 CSS: ${pass3.findings.length} contrast findings, ${pass3.unresolved.length} unresolved vars, ${pass3.skippedMedia} @media blocks skipped, ${pass3.pageContextMatchCount} page-context body-bg lookups.`
  );

  // v5 — Pass 3 extension: Tailwind contrast pairs on .tsx components.
  // v6 — Now uses JSX tree walker for ancestor-bg resolution.
  // v7 — findAncestorBg recurses through translucent ancestors.
  // v8 — App-router layout.tsx body-bg resolution as final fallback
  //      before #FFFFFF default.
  console.error("[brand-audit] Pass 3 — building layoutBgContext (v8)...");
  const layoutBgContext = buildLayoutBgContext(tsxFiles, vars);
  const layoutEntriesArr = Array.from(layoutBgContext.values());
  const layoutSummary = layoutEntriesArr
    .map((e) => `${e.routePrefix}→${e.resolvedHex}(${e.source})`)
    .join(", ");
  console.error(
    `[brand-audit] layoutBgContext: ${layoutBgContext.size} entries — ${layoutSummary || "(none resolved)"}`
  );

  console.error("[brand-audit] Pass 3 — Tailwind contrast on .tsx...");
  const pass3tw = pass3Tailwind(tsxFiles, layoutBgContext);
  const histStr = Object.keys(pass3tw.recursionDepthHistogram)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b)
    .map((d) => `d${d}=${pass3tw.recursionDepthHistogram[d]}`)
    .join(",") || "none";
  const layoutHistStr = Object.keys(pass3tw.layoutPrefixHistogram)
    .map((p) => `${p}=${pass3tw.layoutPrefixHistogram[p]}`)
    .join(",") || "none";
  console.error(
    `[brand-audit] Pass 3 Tailwind: ${pass3tw.findings.length} findings, ${pass3tw.pairsEvaluated} pairs, ${pass3tw.dynamicSkippedFiles} dynamic-skipped, ${pass3tw.ancestorBgFiringCount} ancestor (v6), ${pass3tw.orphanTextFiringCount} orphan-text (v6), ${pass3tw.crossFileBoundaryCount} component-boundary, ${pass3tw.recursionFiringCount} recursive-stacks (v7) [${histStr}], ${pass3tw.fellThroughToBodyCount} body-fallthrough, ${pass3tw.depthExceededCount} depth-cap, ${pass3tw.layoutFallbackFiringCount} layout-fallback (v8) [${layoutHistStr}], ${pass3tw.layoutNotFoundCount} no-layout-match.`
  );

  // Merge Tailwind findings into pass3 for unified P0/P1/P2 reporting.
  const pass3Combined = {
    ...pass3,
    findings: [...pass3.findings, ...pass3tw.findings],
    tailwindFindingsCount: pass3tw.findings.length,
    tailwindPairsEvaluated: pass3tw.pairsEvaluated,
    tailwindDynamicSkippedFiles: pass3tw.dynamicSkippedFiles,
    tailwindAncestorBgFiringCount: pass3tw.ancestorBgFiringCount,
    tailwindOrphanTextFiringCount: pass3tw.orphanTextFiringCount,
    tailwindCrossFileBoundaryCount: pass3tw.crossFileBoundaryCount,
    tailwindRecursionFiringCount: pass3tw.recursionFiringCount,
    tailwindRecursionDepthHistogram: pass3tw.recursionDepthHistogram,
    tailwindDepthExceededCount: pass3tw.depthExceededCount,
    tailwindFellThroughToBodyCount: pass3tw.fellThroughToBodyCount,
    tailwindLayoutFallbackFiringCount: pass3tw.layoutFallbackFiringCount,
    tailwindLayoutPrefixHistogram: pass3tw.layoutPrefixHistogram,
    tailwindLayoutNotFoundCount: pass3tw.layoutNotFoundCount,
    layoutBgContextSize: layoutBgContext.size,
    layoutBgContextEntries: layoutEntriesArr,
  };

  const report = buildReport(
    {
      html: htmlFiles.length,
      css: cssFiles.length,
      tsx: tsxFiles.length,
      ts: tsFiles.length,
    },
    pass1,
    pass2,
    pass3Combined
  );

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const reportPath = path.join(REPORT_DIR, `brand-conformance-${stamp}.md`);
  fs.writeFileSync(reportPath, report);
  console.error(`\n[brand-audit] Report: ${relPath(reportPath)}`);
  console.error(
    `[brand-audit] Totals: P0=${pass1.filter(f => f.severity === "P0").length + pass2.filter(f => f.severity === "P0").length + pass3Combined.findings.filter(f => f.severity === "P0").length} · P1=${pass1.filter(f => f.severity === "P1").length + pass2.filter(f => f.severity === "P1").length + pass3Combined.findings.filter(f => f.severity === "P1").length} · P2=${pass1.filter(f => f.severity === "P2").length + pass2.filter(f => f.severity === "P2").length + pass3Combined.findings.filter(f => f.severity === "P2").length}`
  );

  process.stdout.write(report);
}

main();
