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

/* Inactivity timer moved to /js/session-timeout.js — supports role-based timeouts and warning modal */
