/**
 * SRL Session Timeout Manager
 * - 30 min inactivity for employees (AE portal)
 * - 60 min inactivity for carriers
 * - 60 min inactivity for shippers
 * - Warning modal 2 minutes before timeout
 * - "Extend Session" button resets the timer
 */
(function initSessionTimeout() {
  "use strict";

  var path = window.location.pathname;

  // Determine portal type
  var isAE = path.startsWith("/ae");
  var isCarrier = path.startsWith("/carrier");
  var isShipper = path.startsWith("/shipper");
  var isConsole = isAE || isCarrier || isShipper;

  // Skip login/register/public pages
  if (!isConsole) return;
  if (path.indexOf("login") !== -1) return;
  if (path.indexOf("register") !== -1) return;
  if (path.indexOf("forgot-password") !== -1) return;

  // Timeouts: employees = 30min, carriers/shippers = 60min
  var IDLE_LIMIT = isAE ? 30 * 60 * 1000 : 60 * 60 * 1000;
  var WARNING_BEFORE = 2 * 60 * 1000; // 2 minutes before
  var WARNING_AT = IDLE_LIMIT - WARNING_BEFORE;

  var idleTimer = null;
  var warningTimer = null;
  var warningVisible = false;
  var modalEl = null;

  function getLoginUrl() {
    if (isCarrier) return "/carrier/login.html?expired=1";
    if (isShipper) return "/shipper/login?expired=1";
    return "/auth/login.html?expired=1";
  }

  function clearTokens() {
    localStorage.removeItem("token");
    localStorage.removeItem("carrier_token");
    localStorage.removeItem("user");
    localStorage.removeItem("carrier_user");
    localStorage.removeItem("srl_last_activity");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("carrier_token");
  }

  function forceLogout() {
    clearTokens();
    window.location.href = getLoginUrl();
  }

  function createWarningModal() {
    if (modalEl) return;
    modalEl = document.createElement("div");
    modalEl.id = "srl-session-warning";
    modalEl.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)">' +
        '<div style="background:#121e30;border:1px solid rgba(200,150,62,0.2);border-radius:16px;padding:36px 40px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)">' +
          '<div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:rgba(202,138,4,0.12);display:flex;align-items:center;justify-content:center">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '</div>' +
          '<h3 style="color:#e8edf2;font-size:18px;margin-bottom:8px;font-family:Inter,system-ui,sans-serif">Session Expiring</h3>' +
          '<p style="color:#7a9ab5;font-size:14px;line-height:1.6;margin-bottom:24px;font-family:Inter,system-ui,sans-serif">Your session is about to expire due to inactivity. You will be logged out in <strong style="color:#ca8a04" id="srl-countdown">2:00</strong>.</p>' +
          '<div style="display:flex;gap:12px;justify-content:center">' +
            '<button id="srl-extend-btn" style="padding:10px 24px;font-size:14px;font-weight:600;background:linear-gradient(135deg,#c8a951,#b8963e);color:#0D1B2A;border:none;border-radius:8px;cursor:pointer;font-family:Inter,system-ui,sans-serif;transition:transform 0.15s">Extend Session</button>' +
            '<button id="srl-logout-btn" style="padding:10px 24px;font-size:14px;font-weight:500;background:transparent;color:#6a8090;border:1px solid #243447;border-radius:8px;cursor:pointer;font-family:Inter,system-ui,sans-serif;transition:all 0.15s">Log Out</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);

    document.getElementById("srl-extend-btn").addEventListener("click", function () {
      hideWarning();
      resetIdle();
    });
    document.getElementById("srl-logout-btn").addEventListener("click", forceLogout);
  }

  function showWarning() {
    if (warningVisible) return;
    warningVisible = true;
    createWarningModal();
    modalEl.style.display = "block";

    // Start countdown
    var remaining = WARNING_BEFORE / 1000;
    var countdownEl = document.getElementById("srl-countdown");
    var countdownInterval = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        forceLogout();
        return;
      }
      var m = Math.floor(remaining / 60);
      var s = remaining % 60;
      countdownEl.textContent = m + ":" + (s < 10 ? "0" : "") + s;
    }, 1000);

    modalEl._countdownInterval = countdownInterval;
  }

  function hideWarning() {
    if (!warningVisible || !modalEl) return;
    warningVisible = false;
    modalEl.style.display = "none";
    if (modalEl._countdownInterval) {
      clearInterval(modalEl._countdownInterval);
    }
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    clearTimeout(warningTimer);
    hideWarning();
    localStorage.setItem("srl_last_activity", Date.now().toString());

    warningTimer = setTimeout(showWarning, WARNING_AT);
    idleTimer = setTimeout(forceLogout, IDLE_LIMIT);
  }

  // Check if already expired on page load
  var lastActivity = localStorage.getItem("srl_last_activity");
  if (lastActivity && (Date.now() - parseInt(lastActivity, 10)) > IDLE_LIMIT) {
    forceLogout();
    return;
  }

  // Track user activity
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach(function (evt) {
    document.addEventListener(evt, function () {
      if (!warningVisible) resetIdle();
    }, { passive: true });
  });

  // Start the timer
  resetIdle();

  // Background tab check every 15 seconds
  setInterval(function () {
    var last = localStorage.getItem("srl_last_activity");
    if (!last) return;
    var elapsed = Date.now() - parseInt(last, 10);
    if (elapsed > IDLE_LIMIT) {
      forceLogout();
    } else if (elapsed > WARNING_AT && !warningVisible) {
      showWarning();
    }
  }, 15000);
})();
