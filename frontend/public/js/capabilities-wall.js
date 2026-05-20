/**
 * capabilities-wall.js — Section 5 capabilities-wall tile-cycle (v3.8.aga)
 *
 * Drives the 16 tiles on the homepage Section 5 capabilities wall.
 * Each tile cross-fades through the 26-fact pool on its own random
 * 3600-5400ms period with a random initial delay, 550ms cross-fade.
 * Honors prefers-reduced-motion (renders static facts, no cycle).
 *
 * Public-disclosure compliance (per CLAUDE.md §4 + §5 + the v3.8.aga
 * directive): only the 26 facts in this pool render. EIN, MI entity
 * ID, bond amount, surety name, insurer name, and all dollar figures
 * are not in the pool by design.
 */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // v3.8.agb — Fact pool audited against CLAUDE.md §1 (authority), §4
  // (honest claims whitelist), §5 (prohibited claims), §8 (Quick Pay
  // structure), §14 (legal). Five facts retired and replaced:
  //   - "Cross-border lanes"  → "Coast to coast lanes"  (US-only authority)
  //   - "USMCA documents"     → "Carmack-compliant BOL" (US-only authority)
  //   - "POD within 24h"      → "Mobile POD upload"     (capability not SLA)
  //   - "FSC pass-through"    → "Tier-graduated FSC"    (§5 retired blanket)
  //   - "15-minute quotes"    → "Branded tracking links" (unpublished SLA)
  var facts = [
    { t: 'Cold-chain capable',        i: 'thermometer-snowflake' },
    { t: 'Quick Pay, day one',        i: 'banknote' },
    { t: '35-point vetting',          i: 'shield-check' },
    { t: '48 contiguous states',      i: 'map' },
    { t: 'BMC-84 bonded',             i: 'badge-check' },
    { t: 'FMCSA broker',              i: 'scroll-text' },
    { t: 'Mobile POD upload',         i: 'smartphone' },
    { t: 'No double-brokering',       i: 'lock' },
    { t: 'Net 30 / 21 / 14',          i: 'calendar-clock' },
    { t: 'Coast to coast lanes',      i: 'compass' },
    { t: 'Reefer capable',            i: 'snowflake' },
    { t: 'Marco Polo 24/7',           i: 'bot' },
    { t: 'Tier-graduated FSC',        i: 'trending-up' },
    { t: 'Dedicated AE',              i: 'user-check' },
    { t: 'USDOT 4526880',             i: 'badge' },
    { t: 'MC 1794414',                i: 'shield' },
    { t: 'Branded tracking links',    i: 'link-2' },
    { t: '2-hour check calls',        i: 'phone-call' },
    { t: 'Carmack-compliant BOL',     i: 'gavel' },
    { t: 'Performance pay',           i: 'trophy' },
    { t: 'Itemized rate cons',        i: 'list-checks' },
    { t: 'Continuous temp logs',      i: 'thermometer' },
    { t: 'Same-day pay',              i: 'wallet' },
    { t: 'Caravan partner tiers',     i: 'layers' },
    { t: 'Backhaul matched',          i: 'route' },
    { t: 'OTIF / MABD aware',         i: 'warehouse' }
  ];

  function init() {
    var wall = document.getElementById('capabilitiesWall');
    if (!wall) return;

    var tiles = [].slice.call(wall.querySelectorAll('.tile'));
    if (!tiles.length) return;

    var byText = {};
    facts.forEach(function (f, idx) { byText[f.t] = idx; });

    var shown = new Set();
    tiles.forEach(function (t) {
      t._c = t.querySelector('.tile-c');
      var sp = t._c && t._c.querySelector('span');
      var key = sp ? byText[sp.textContent.trim()] : undefined;
      if (key === undefined) key = 0;
      t._idx = key;
      shown.add(key);
    });

    function refreshIcons() {
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
      }
    }

    function paint(tile, idx) {
      var f = facts[idx];
      tile._c.innerHTML = '<i data-lucide="' + f.i + '"></i><span>' + f.t + '</span>';
    }

    refreshIcons();

    if (reduce) return;

    function pickNext() {
      var i, tries = 0;
      do {
        i = Math.floor(Math.random() * facts.length);
        tries++;
      } while (shown.has(i) && tries < 60);
      return i;
    }

    // v3.8.agb — cross-fade tightened 560ms → 260ms (CSS transition 0.25s).
    // The prior 1.1s tile-empty window (fade-out + swap + fade-in) made
    // tiles look icon-less mid-cycle. The 260ms swap is short enough that
    // viewers no longer perceive a missing-icon state during the transition.
    tiles.forEach(function (tile) {
      var period = 3600 + Math.random() * 1800;
      setTimeout(function () {
        setInterval(function () {
          tile._c.style.opacity = '0';
          setTimeout(function () {
            shown.delete(tile._idx);
            var nextIdx = pickNext();
            shown.add(nextIdx);
            tile._idx = nextIdx;
            paint(tile, nextIdx);
            refreshIcons();
            tile._c.style.opacity = '1';
          }, 260);
        }, period);
      }, Math.random() * period);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
