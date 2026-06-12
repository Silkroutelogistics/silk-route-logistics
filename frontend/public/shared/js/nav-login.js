/* Sign In dropdown wiring — shipped by the chrome injector on every
 * marketing page (v3.8.amy). Canonical behavior lifted from the only page
 * that had working wiring (index.html): click toggle + aria-expanded sync
 * + outside-click close, extended with Escape close per the 2026-06 audit.
 * CSS open states live in shared/css/utilities.css
 * (.nav-login-wrap:hover / .active / :focus-within).
 *
 * Double-bind guard: pages historically shipped their own wiring; if any
 * page-local script binds #loginBtn again, the data flag keeps this one
 * from stacking a second toggle (two toggles = visual no-op).
 */
(function () {
  var wrap = document.getElementById('loginWrap');
  var btn = document.getElementById('loginBtn');
  if (!wrap || !btn) return;
  if (wrap.dataset.srlLoginWired === '1') return;
  wrap.dataset.srlLoginWired = '1';

  function close() {
    wrap.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isActive = wrap.classList.toggle('active');
    btn.setAttribute('aria-expanded', String(isActive));
  });

  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && wrap.classList.contains('active')) {
      close();
      btn.focus();
    }
  });
})();
