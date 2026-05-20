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

  var facts = [
    { t: 'Cold-chain capable',        i: 'thermometer-snowflake' },
    { t: 'Quick Pay, day one',        i: 'banknote' },
    { t: '35-point vetting',          i: 'shield-check' },
    { t: '48 contiguous states',      i: 'map' },
    { t: 'BMC-84 bonded',             i: 'badge-check' },
    { t: 'FMCSA broker',              i: 'scroll-text' },
    { t: 'POD within 24h',            i: 'package-check' },
    { t: 'No double-brokering',       i: 'lock' },
    { t: 'Net 30 / 21 / 14',          i: 'calendar-clock' },
    { t: 'Cross-border lanes',        i: 'globe' },
    { t: 'Reefer capable',            i: 'snowflake' },
    { t: 'Marco Polo 24/7',           i: 'bot' },
    { t: 'FSC pass-through',          i: 'receipt' },
    { t: 'Dedicated AE',              i: 'user-check' },
    { t: 'USDOT 4526880',             i: 'badge' },
    { t: 'MC 1794414',                i: 'shield' },
    { t: '15-minute quotes',          i: 'zap' },
    { t: '2-hour check calls',        i: 'phone-call' },
    { t: 'USMCA documents',           i: 'file-text' },
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
          }, 560);
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
