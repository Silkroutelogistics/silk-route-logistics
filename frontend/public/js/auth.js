/**
 * SRL Auth Utility — Shared across AE + Carrier consoles
 * Auth tokens are managed via httpOnly cookies (set by backend).
 * This utility handles auth state checking and redirects only.
 */
var SRLAuth = (function () {
  "use strict";

  /**
   * Check if user is logged in by calling the profile endpoint.
   * Since tokens are in httpOnly cookies, we can't check localStorage.
   * For quick checks, we use a cached flag in sessionStorage.
   */
  function isLoggedIn() {
    return sessionStorage.getItem("srl_authenticated") === "true";
  }

  /**
   * Mark as authenticated (called after successful login API response)
   */
  function setAuthenticated() {
    sessionStorage.setItem("srl_authenticated", "true");
  }

  /**
   * Clear auth state
   */
  function clearAuth() {
    sessionStorage.removeItem("srl_authenticated");
  }

  /**
   * Redirect to login if not authenticated
   * @param {string} loginUrl - Login page URL
   */
  function requireAuth(loginUrl) {
    loginUrl = loginUrl || "/auth/login";
    if (!isLoggedIn()) {
      window.location.href = loginUrl;
      return false;
    }
    return true;
  }

  /**
   * Clear auth and redirect to login
   * @param {string} loginUrl - Login page URL
   */
  function logout(loginUrl) {
    loginUrl = loginUrl || "/auth/login";
    clearAuth();
    // Call backend to clear httpOnly cookie
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(function(){});
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

  function wasRemembered(prefix) {
    prefix = prefix || "srl";
    return !!localStorage.getItem(prefix + "_remembered_email");
  }

  // Legacy compatibility stubs (no-ops — tokens are in httpOnly cookies now)
  function getToken() { return null; }
  function setToken() {}
  function removeToken() { clearAuth(); }

  return {
    getToken: getToken,
    setToken: setToken,
    removeToken: removeToken,
    isLoggedIn: isLoggedIn,
    setAuthenticated: setAuthenticated,
    clearAuth: clearAuth,
    requireAuth: requireAuth,
    logout: logout,
    setRememberedEmail: setRememberedEmail,
    getRememberedEmail: getRememberedEmail,
    wasRemembered: wasRemembered
  };
})();

/* Inactivity timer moved to /js/session-timeout.js — supports role-based timeouts and warning modal */
