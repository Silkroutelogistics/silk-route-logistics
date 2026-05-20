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
  // v3.8.agc — `c` field carries icon color category for visual brand
  // rhythm: "warm" = gold-dark stroke (capability/operational/financial
  // facts), "cool" = navy stroke (authority/identity/legal/trust facts).
  var facts = [
    { t: 'Cold-chain capable',        i: 'thermometer-snowflake', c: 'warm' },
    { t: 'Quick Pay, day one',        i: 'banknote',              c: 'warm' },
    { t: '35-point vetting',          i: 'shield-check',          c: 'cool' },
    { t: '48 contiguous states',      i: 'map',                   c: 'warm' },
    { t: 'BMC-84 bonded',             i: 'badge-check',           c: 'cool' },
    { t: 'FMCSA broker',              i: 'scroll-text',           c: 'cool' },
    { t: 'Mobile POD upload',         i: 'smartphone',            c: 'warm' },
    { t: 'No double-brokering',       i: 'lock',                  c: 'cool' },
    { t: 'Net 30 / 21 / 14',          i: 'calendar-clock',        c: 'warm' },
    { t: 'Coast to coast lanes',      i: 'compass',               c: 'warm' },
    { t: 'Reefer capable',            i: 'snowflake',             c: 'warm' },
    { t: 'Marco Polo 24/7',           i: 'bot',                   c: 'warm' },
    { t: 'Tier-graduated FSC',        i: 'trending-up',           c: 'warm' },
    { t: 'Dedicated AE',              i: 'user-check',            c: 'cool' },
    { t: 'USDOT 4526880',             i: 'badge',                 c: 'cool' },
    { t: 'MC 1794414',                i: 'shield',                c: 'cool' },
    { t: 'Branded tracking links',    i: 'link-2',                c: 'warm' },
    { t: '2-hour check calls',        i: 'phone-call',            c: 'warm' },
    { t: 'Carmack-compliant BOL',     i: 'gavel',                 c: 'cool' },
    { t: 'Performance pay',           i: 'trophy',                c: 'warm' },
    { t: 'Itemized rate cons',        i: 'list-checks',           c: 'cool' },
    { t: 'Continuous temp logs',      i: 'thermometer',           c: 'warm' },
    { t: 'Same-day pay',              i: 'wallet',                c: 'warm' },
    { t: 'Caravan partner tiers',     i: 'layers',                c: 'warm' },
    { t: 'Backhaul matched',          i: 'route',                 c: 'warm' },
    { t: 'OTIF / MABD aware',         i: 'warehouse',             c: 'warm' }
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

    // v3.8.agd — switched from window.lucide.createIcons() (broken CDN
    // resolving to archived lucide@1.16.0) to window.paintWallIcons()
    // from /js/wall-icons.js — inline SVG library, no CDN dependency.
    function refreshIcons() {
      if (window.paintWallIcons) {
        window.paintWallIcons(wall);
      }
    }

    function paint(tile, idx) {
      var f = facts[idx];
      tile._c.innerHTML = '<i data-lucide="' + f.i + '"></i><span>' + f.t + '</span>';
      // v3.8.agc — sync the category attribute on the parent tile so
      // the CSS [data-cat="cool"] selector picks up the new icon color.
      tile.setAttribute('data-cat', f.c || 'warm');
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

  // v3.8.agc — switched DOMContentLoaded → window.load. defer scripts
  // execute right before DOMContentLoaded; if Lucide CDN happens to load
  // a tick later than capabilities-wall.js in this order, calling
  // createIcons() at DOMContentLoaded silently misses every tile.
  // window.load fires only after all defer scripts (including Lucide)
  // are fully executed, so window.lucide.createIcons is guaranteed.
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
