/**
 * SRL Auth Utility — Shared across AE + Carrier consoles
 * Handles dual-storage (localStorage for Remember Me, sessionStorage for session-only)
 */
var SRLAuth = (function () {
  "use strict";

  /**
   * Get token from either storage (sessionStorage takes priority)
   * @param {string} key - Storage key (default: "token")
   */
  function getToken(key) {
    key = key || "token";
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  }

  /**
   * Store token based on Remember Me preference
   * @param {string} key - Storage key
   * @param {string} value - Token value
   * @param {boolean} remember - Use localStorage if true, sessionStorage if false
   */
  function setToken(key, value, remember) {
    if (remember) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  }

  /**
   * Remove token from both storages
   * @param {string} key - Storage key (default: "token")
   */
  function removeToken(key) {
    key = key || "token";
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  /**
   * Check if user is logged in
   * @param {string} key - Token key (default: "token")
   */
  function isLoggedIn(key) {
    return !!getToken(key);
  }

  /**
   * Redirect to login if not authenticated
   * @param {string} key - Token key
   * @param {string} loginUrl - Login page URL
   */
  function requireAuth(key, loginUrl) {
    key = key || "token";
    loginUrl = loginUrl || "/auth/login";
    if (!getToken(key)) {
      window.location.href = loginUrl;
      return false;
    }
    return true;
  }

  /**
   * Clear auth and redirect to login
   * @param {string} key - Token key
   * @param {string} loginUrl - Login page URL
   */
  function logout(key, loginUrl) {
    key = key || "token";
    loginUrl = loginUrl || "/auth/login";
    removeToken(key);
    window.location.href = loginUrl;
  }

  /**
   * Save email for auto-fill on Remember Me
   */
  function setRememberedEmail(email, prefix) {
    prefix = prefix || "srl";
    if (email) {
      localStorage.setItem(prefix + "_remembered_email", email);
    } else {
      localStorage.removeItem(prefix + "_remembered_email");
    }
  }

  function getRememberedEmail(prefix) {
    prefix = prefix || "srl";
    return localStorage.getItem(prefix + "_remembered_email") || "";
  }

  /**
   * Check if Remember Me was previously selected
   */
  function wasRemembered(prefix) {
    prefix = prefix || "srl";
    return !!localStorage.getItem(prefix + "_remembered_email");
  }

  return {
    getToken: getToken,
    setToken: setToken,
    removeToken: removeToken,
    isLoggedIn: isLoggedIn,
    requireAuth: requireAuth,
    logout: logout,
    setRememberedEmail: setRememberedEmail,
    getRememberedEmail: getRememberedEmail,
    wasRemembered: wasRemembered
  };
})();

/**
 * Auto-logout after 15 minutes of inactivity
 * Runs on all /ae/ and /carrier/ console pages
 * Uses localStorage so it persists across tabs and tab restores
 */
(function initInactivityTimer() {
  var isConsole = window.location.pathname.startsWith("/ae") || window.location.pathname.startsWith("/carrier");
  if (!isConsole) return;
  if (window.location.pathname.indexOf("login") !== -1) return;
  if (window.location.pathname.indexOf("register") !== -1) return;

  var IDLE_LIMIT = 15 * 60 * 1000; // 15 minutes
  var idleTimer;

  function resetIdle() {
    clearTimeout(idleTimer);
    localStorage.setItem("srl_last_activity", Date.now().toString());
    idleTimer = setTimeout(forceLogout, IDLE_LIMIT);
  }

  function forceLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("carrier_token");
    localStorage.removeItem("user");
    localStorage.removeItem("carrier_user");
    localStorage.removeItem("srl_last_activity");
    var isCarrier = window.location.pathname.startsWith("/carrier");
    window.location.href = isCarrier ? "/carrier/login.html" : "/auth/login.html";
  }

  // Check if already expired on page load
  var lastActivity = localStorage.getItem("srl_last_activity");
  if (lastActivity && (Date.now() - parseInt(lastActivity, 10)) > IDLE_LIMIT) {
    forceLogout();
    return;
  }

  // Track all user activity
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach(function (evt) {
    document.addEventListener(evt, resetIdle, { passive: true });
  });

  // Start the timer
  resetIdle();

  // Check every 30 seconds in case tab was backgrounded
  setInterval(function () {
    var last = localStorage.getItem("srl_last_activity");
    if (last && (Date.now() - parseInt(last, 10)) > IDLE_LIMIT) {
      forceLogout();
    }
  }, 30000);
})();
