# NMFC commodity catalog — Phase B scope

**Date:** 2026-05-05
**Trigger:** v3.8.ww shipped density-based freight-class auto-suggest. Density alone covers ~80% of freight correctly; the remaining ~20% have NMFC commodity-specific class assignments that diverge from raw density (driven by handling, stowability, liability, value-density rather than physical density). This document scopes how SRL acquires and integrates that commodity catalog without committing code yet.
**Status:** Scoping only. No code, no schema, no commitments. Decision deliverable for Wasi.

---

## What "NMFC catalog" actually means

The National Motor Freight Classification (NMFC) is published by the **National Motor Freight Traffic Association (NMFTA)**. It maps every commodity in interstate LTL freight to:

- An **NMFC item number** (e.g. NMFC 100240 = Foodstuffs, NOI)
- A **freight class** (50–500)
- Sub-provisions for sub-categorization (sub-numbers under a parent NMFC, density brackets when the commodity has density-variable class)

The catalog is roughly 50,000+ commodity entries grouped into ~16,000 NMFC item numbers. About 80% of NMFC items have a fixed class; the remaining 20% are **density-variable** (the class shifts with measured density — which is what v3.8.ww already handles via raw formula).

**The 20% of cases where v3.8.ww gets it wrong** are commodities where NMFTA has assigned a class that ignores or overrides density:

- **Hazmat / regulated** — class often higher than density alone would suggest, due to liability and handling
- **High-value / pilferage-prone** — electronics, jewelry, pharma; class bumped up for cargo-insurance reasons
- **Fragile / poor stowability** — glass, ceramics, oddly-shaped freight; class bumped up because trailers can't be loaded efficiently
- **Hazardous-to-handle** — materials requiring placards, special equipment, or trained handlers
- **Specific-item overrides** — even within "Foodstuffs NOI" there are sub-items with assigned classes that don't match raw density (e.g. coffee beans vs canned coffee)

For SRL's actual freight (CPG cold-chain + clean beauty per §18.7), the 20% mostly shows up as:

- **Cold-chain glass containers** (premium beverages in glass, glass-packaged frozen meals) — class often 70–85 regardless of density
- **Clean beauty glass** (perfume bottles, glass jars) — class 100–150 due to fragility + value
- **Aerosols** (hairspray, dry shampoo, mousses) — hazmat class, around 100
- **Lithium-battery-powered beauty devices** (electric brushes, IPL devices) — hazmat class 92.5
- **Refrigerated pharmaceuticals** (some wellness brands carry them) — class 70–85 + cold-chain handling

For dry van CPG (canned goods, dry mixes, cardboard-packed items), density wins ~95% of the time. v3.8.ww is enough.

---

## The three acquisition options

### Option 1 — NMFTA ClassIT subscription (authoritative)

**What it is:** NMFTA's official online lookup tool with API access. Gives the full ~50,000-commodity catalog, kept current with quarterly NMFC supplement releases.

**Cost (publicly listed pricing tiers as of late 2025):**
- ClassIT online lookup (single-user, web UI only): ~$295/yr
- ClassIT Plus (multi-user + downloadable data): ~$595/yr
- ClassIT API (programmatic access): ~$1,200–2,500/yr depending on call volume tier

**Integration effort:** medium. API gives commodity name search + NMFC# + class lookup. Can replace `COMMODITY_CLASS_MAP` with API calls cached server-side. Probably 100-200 lines of integration + a lookup-cache table in Prisma.

**When this makes sense:**
- SRL is brokering across diverse industries where the commodity catalog matters
- Compliance/audit value (the SOT cite is "NMFC item ####" not a hand-coded heuristic)
- AE volume justifies subscription cost

**When it doesn't:**
- Pre-revenue / early-revenue: subscription cost is real cash out the door for a feature that affects ~20% of class accuracy
- Verticals are narrow: a hand-curated 30–50 entry table covers 90%+ of actual loads

### Option 2 — Hand-curated catalog scoped to SRL's verticals (recommended)

**What it is:** a JSON file with ~30–50 NMFC entries covering the commodities SRL actually moves. Each entry has commodity name + NMFC item number + freight class + a "verified-against" source field (rate sheet, prior BOL, broker reference).

**Effort:** ~1 day of research per vertical. Output is a single JSON or .ts file checked into the repo. No external integration. Fits inside one focused sprint.

**Coverage estimate:** if scoped well, 90%+ of SRL's actual freight. The long tail (the 5–10% the catalog doesn't cover) falls back to v3.8.ww's density auto-suggest, which is correct for most of that long tail anyway.

**Trade-off:** maintenance overhead — when NMFTA publishes a quarterly supplement, the curated entries can drift. SRL has to either re-verify periodically (quarterly cadence per supplement publication) or accept slow drift.

**Recommended COLDCHAIN coverage (commodity categories, NMFC# to research):**
- Refrigerated foodstuffs NOI (general baseline)
- Frozen prepared meals
- Refrigerated dairy (yogurt, milk-based products)
- Frozen baked goods
- Refrigerated juice / beverages
- Refrigerated baby food (Little Spoon-shaped customers)
- Frozen seafood
- Frozen meat / poultry
- Refrigerated pharmaceutical / OTC
- Glass-packaged premium beverages (kombucha, cold-press juice — often class-bumped for fragility)

**Recommended WELLNESS coverage:**
- Cosmetics, NOI (general baseline)
- Skincare (creams, serums)
- Fragrance / perfume (glass-packed, class-bumped)
- Aerosol personal care (hairspray, dry shampoo, deodorant — hazmat class)
- Hair care (shampoos, conditioners, treatments)
- Color cosmetics (mascara, lipstick, palettes — often glass + small-pack, weird density)
- Supplements (capsules, powders, gummies)
- Personal care devices — non-electric (brushes, mirrors, manual tools)
- Personal care devices — electric, lithium-battery (hazmat class for shipping)
- Clean beauty premium (often glass-packed, class-bumped)
- PR/influencer drops (often signature-required residential — separate handling, but NMFC class still applies)

Total entries: ~22 covering both verticals. Closer to 30 once sub-categorizations and NOI fallbacks are added. Well within the 30–50 target.

**Verification approach for each entry:**

Each entry needs at least 2 corroborating sources before it's trusted in production:
- Source 1: an actual BOL or rate confirmation that used this NMFC# (SRL's own historical loads if any, or a broker-shared example)
- Source 2: a freight rate sheet from an LTL carrier (XPO, ODFL, FedEx Freight, Saia all publish public rate guides that reference NMFC items)
- Optional Source 3: NMFTA ClassIT one-month free trial (single-user web access; researcher manually verifies the 30–50 entries during the trial month, no ongoing subscription needed)

The cleanest research pattern is the "free trial sweep" — use NMFTA ClassIT's free trial to verify all entries in a single concentrated session, document each with the verification timestamp + source, then let the trial lapse. That gets authoritative coverage without ongoing subscription cost.

### Option 3 — Skip the catalog, lean on density-only

**What it is:** v3.8.ww's density auto-suggest is the entire freight-class story. NMFC# stays a free-text input the AE fills when they have it. No commodity catalog.

**Effort:** zero (v3.8.ww shipped already).

**Trade-off:** ~20% of loads will get the wrong class auto-suggested. The AE has to override manually for those cases. Whether this is acceptable depends on:
- How much rework manual overrides cause — usually ~10 seconds per line item
- How often LTL carriers reject the BOL for mis-classed freight — varies by carrier, usually low for FTL (which is most of SRL's freight) but real for LTL
- Whether the wrong class is ever rate-impacting at the broker-shipper layer (usually only if the carrier reclasses on the BOL after pickup, leading to a rate adjustment)

**When this is fine:**
- SRL is mostly FTL (the user has confirmed this is the focus per §18.7's vertical-branched outreach which pitches FTL)
- Carrier reclassing risk is low because SRL is operating FTL where class is less load-bearing than in LTL
- AE volume can absorb manual overrides without it becoming a bottleneck

**Honest assessment:** for a CPG-cold-chain + clean-beauty FTL brokerage in early revenue, **Option 3 might actually be fine for now**. The juice-vs-squeeze on Option 2 is real but the cost is also real (1 day of research + ongoing maintenance). Option 3 defers that work without active risk on the FTL volume that's the actual sprint focus.

---

## Recommendation

**Defer Phase B.** Ship v3.8.ww as the freight-class story for now. Re-evaluate after 30 days of real Apollo-driven outreach and conversion data. Specifically watch for:

1. **AE feedback** — how often does the AE manually override the auto-suggested class on Order Builder? If <5% of line items, density is enough; Phase B is over-engineering. If >15%, schedule Phase B's hand-curation sprint.
2. **Carrier reclass rate** — when carriers receive the BOL, do they reclass the freight? Each reclass is a real $ cost (rate adjustment) and a signal that density alone is wrong for that commodity. Track the first 30 days of carrier reclasses; if any single commodity category recurs, it goes into a hand-curated catalog entry.
3. **NMFC# field utilization on Order Builder** — how often does the AE actually fill the NMFC# input today? If usage is near-zero, the catalog isn't a top pain point. If AEs are looking up NMFC#s manually for every load, the catalog has real workflow value.

If after 30 days the data points toward Phase B being worth it, the recommended path is **Option 2 (hand-curated, NMFTA free-trial-verified)** — small commit, low maintenance burden, fits the vertical scope. Option 1 (full ClassIT subscription) only makes sense if SRL expands into industries with denser long-tail commodities (industrial, hazmat-heavy, agriculture, etc.).

---

## Implementation shape (when Phase B does ship)

For reference if/when this gets greenlit. Not implemented today.

**Data file:** `frontend/src/app/dashboard/orders/nmfcCatalog.ts`
- Exports a `NMFC_CATALOG: NmfcEntry[]` array
- Each entry: `{ commodityKey: string; aliases: string[]; nmfcCode: string; freightClass: string; verifiedAt: string; verifiedAgainst: string[] }`
- ~30–50 entries scoped to COLDCHAIN + WELLNESS

**Lookup function:** extend `getAutoSuggestedClass(item)` in `types.ts` to:
1. First check the catalog by commodityKey/aliases match on description
2. If catalog hits AND the entry has a fixed class, return that (overrides density)
3. If catalog hits AND the entry is density-variable, fall through to density formula (v3.8.ww)
4. If no catalog hit, fall through to keyword match (`COMMODITY_CLASS_MAP`)
5. If no keyword hit, return null

**Schema additions:** none. NMFC code is already on `LoadLineItem.nmfcCode` per the existing model.

**UI change:** when the catalog hit returns an entry with NMFC code, populate `nmfcCode` field too (currently AE types it manually). Add a "✓ NMFC catalog match" pill next to the class to indicate the suggestion came from the catalog vs density vs keyword.

**Effort estimate:** 1 day research (verify 30–50 entries via NMFTA free trial) + ~150 lines of code (catalog file + lookup extension + UI pill) + 1 docs commit logging the verification timestamps.

---

## Cross-references

- [`v3.8.ww`](commit/c84255c) — density auto-suggest shipped, the foundation Phase B builds on
- CLAUDE.md §13.3 Item 18 — original "NMFC catalog + density-based class auto-suggest" entry. v3.8.ww closes the density half. Phase B per this doc closes the catalog half if/when greenlit.
- CLAUDE.md §18.7 — Lead Hunter vertical scope (COLDCHAIN + WELLNESS). Catalog scope follows the same vertical boundaries.
- [`frontend/src/app/dashboard/orders/types.ts`](../../frontend/src/app/dashboard/orders/types.ts) — current `COMMODITY_CLASS_MAP` (26 entries) + `suggestFreightClassByDensity` + `getAutoSuggestedClass`. Phase B extends these.
- [`frontend/src/components/orders/LineItemsSection.tsx`](../../frontend/src/components/orders/LineItemsSection.tsx) — the wiring point for the new catalog if Phase B ships.

---

## Decisions awaiting Wasi

1. **Defer Phase B for 30 days?** Yes/no. If yes, set a calendar reminder to re-evaluate around 2026-06-05.
2. **Track AE override rate + carrier reclass rate now?** If yes, both metrics need a lightweight logging hook. Override rate could be captured by comparing the auto-suggested class (at description+dimensions input time) to the final saved class. Carrier reclass needs a manual ops-side log entry per load. Neither is hard but neither exists today.
3. **NMFTA free trial sweep — yes/no/maybe-later?** A one-month account would let SRL verify 30–50 entries authoritatively if/when Phase B ships. Free; just costs the AE's time during the trial month.

No code changes from this document. v3.8.ww remains the live state.
