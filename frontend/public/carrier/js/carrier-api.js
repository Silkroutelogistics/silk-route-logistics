/**
 * SRL Carrier API Client — Carrier Console
 * Vanilla JS module exposing CARRIER namespace
 */
var CARRIER = (function () {
  "use strict";

  var BASE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:4000"
      : "https://api.silkroutelogistics.ai";

  var REFRESH_INTERVAL = 120000;
  var _timer = null;
  var _onRefresh = null;

  // --- Core Fetch Wrapper ---
  function request(path, opts) {
    opts = opts || {};
    var url = BASE + path;
    var token = sessionStorage.getItem("carrier_token") || localStorage.getItem("carrier_token");

    var headers = Object.assign({}, opts.headers || {});
    if (!(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    var fetchOpts = {
      method: opts.method || "GET",
      headers: headers,
      credentials: "include",
    };

    if (opts.body) {
      fetchOpts.body = opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body);
    }

    return fetch(url, fetchOpts).then(function (res) {
      if (res.status === 401) {
        localStorage.removeItem("carrier_token");
        localStorage.removeItem("carrier_user");
        sessionStorage.removeItem("carrier_token");
        sessionStorage.removeItem("carrier_user");
        localStorage.removeItem("srl_last_activity");
        window.location.href = "/carrier/login.html";
        return Promise.reject(new Error("Unauthorized"));
      }
      if (res.status === 403) {
        return Promise.reject(new Error("Forbidden"));
      }
      if (res.status === 204) {
        return null;
      }
      if (!res.ok) {
        return res.json().then(function (body) {
          return Promise.reject(new Error(body.error || "Request failed"));
        }).catch(function () {
          return Promise.reject(new Error("Request failed: " + res.status));
        });
      }
      return res.json();
    });
  }

  // --- Auth ---
  function login(email, password, remember) {
    return request("/api/carrier-auth/login", {
      method: "POST",
      body: { email: email, password: password },
    }).then(function (data) {
      var storage = remember ? localStorage : sessionStorage;
      storage.setItem("carrier_token", data.token);
      storage.setItem("carrier_user", JSON.stringify(data.user));
      return data;
    });
  }

  function logout() {
    return request("/api/carrier-auth/logout", { method: "POST" }).finally(function () {
      localStorage.removeItem("carrier_token");
      localStorage.removeItem("carrier_user");
      sessionStorage.removeItem("carrier_token");
      sessionStorage.removeItem("carrier_user");
      window.location.href = "/carrier/login.html";
    });
  }

  function changePassword(currentPassword, newPassword) {
    return request("/api/carrier-auth/change-password", {
      method: "POST",
      body: { currentPassword: currentPassword, newPassword: newPassword },
    }).then(function (data) {
      if (data.token) {
        var storage = sessionStorage.getItem("carrier_token") ? sessionStorage : localStorage;
        storage.setItem("carrier_token", data.token);
      }
      return data;
    });
  }

  function forceChangePassword(newPassword) {
    return request("/api/carrier-auth/force-change-password", {
      method: "POST",
      body: { newPassword: newPassword },
    }).then(function (data) {
      if (data.token) {
        var storage = sessionStorage.getItem("carrier_token") ? sessionStorage : localStorage;
        storage.setItem("carrier_token", data.token);
      }
      return data;
    });
  }

  function getMe() {
    return request("/api/carrier-auth/me");
  }

  function getUser() {
    try {
      var raw = sessionStorage.getItem("carrier_user") || localStorage.getItem("carrier_user");
      return JSON.parse(raw || "null");
    } catch (e) { return null; }
  }

  function isLoggedIn() {
    return !!(sessionStorage.getItem("carrier_token") || localStorage.getItem("carrier_token"));
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = "/carrier/login.html";
      return false;
    }
    return true;
  }

  // --- Dashboard ---
  function getDashboard() {
    return request("/api/carrier/dashboard");
  }

  function getScorecard() {
    return request("/api/carrier/scorecard");
  }

  function getRevenue(period) {
    return request("/api/carrier/revenue?period=" + (period || "monthly"));
  }

  function getBonuses() {
    return request("/api/carrier/bonuses");
  }

  // --- Mileage ---
  function batchMileage(pairs) {
    return request("/api/mileage/batch", { method: "POST", body: { pairs: pairs } });
  }

  // --- Loads ---
  function getAvailableLoads(params) {
    return request("/api/carrier-loads/available" + buildQuery(params));
  }

  function getMyLoads(params) {
    return request("/api/carrier-loads/my-loads" + buildQuery(params));
  }

  function getLoadDetail(id) {
    return request("/api/carrier-loads/" + id);
  }

  function acceptLoad(id, data) {
    return request("/api/carrier-loads/" + id + "/accept", { method: "POST", body: data || {} });
  }

  function declineLoad(id) {
    return request("/api/carrier-loads/" + id + "/decline", { method: "POST" });
  }

  function updateLoadDriver(id, data) {
    return request("/api/carrier-loads/" + id + "/driver", { method: "PATCH", body: data });
  }

  function updateLoadStatus(id, status, note) {
    return request("/api/carrier-loads/" + id + "/status", { method: "POST", body: { status: status, note: note } });
  }

  // --- CPP ---
  function getCppStatus() {
    return request("/api/cpp/my-status");
  }

  // --- Payments ---
  function getPayments(params) {
    return request("/api/carrier-payments" + buildQuery(params));
  }

  function getPaymentSummary() {
    return request("/api/carrier-payments/summary");
  }

  function getPaymentDetail(id) {
    return request("/api/carrier-payments/" + id);
  }

  function requestQuickPay(id) {
    return request("/api/carrier-payments/" + id + "/request-quickpay", { method: "POST" });
  }

  // --- Compliance ---
  function getComplianceOverview() {
    return request("/api/carrier-compliance/overview");
  }

  function getCsaScores() {
    return request("/api/carrier-compliance/csa-scores");
  }

  function getComplianceDocuments() {
    return request("/api/carrier-compliance/documents");
  }

  function getExpirationCalendar() {
    return request("/api/carrier-compliance/expiration-calendar");
  }

  // --- Notifications ---
  function getNotifications() {
    return request("/api/notifications");
  }

  // --- Onboarding ---
  function getOnboardingStatus() {
    return request("/api/carrier/onboarding-status");
  }

  // --- Dashboard Aggregate ---
  function fetchDashboardData() {
    return Promise.allSettled([
      getMe(),                           // 0
      getDashboard(),                    // 1
      getMyLoads({ limit: 5 }),          // 2
      getAvailableLoads({ limit: 5 }),   // 3
      getCppStatus(),                  // 4
      getPaymentSummary(),               // 5
      getComplianceOverview(),           // 6
      getNotifications(),                // 7
    ]).then(function (results) {
      return {
        user: unwrap(results[0]),
        dashboard: unwrap(results[1]),
        myLoads: unwrap(results[2]),
        availableLoads: unwrap(results[3]),
        cpp: unwrap(results[4]),
        payments: unwrap(results[5]),
        compliance: unwrap(results[6]),
        notifications: unwrap(results[7]),
      };
    });
  }

  // --- Auto-Refresh ---
  function startAutoRefresh(callback) {
    _onRefresh = callback;
    _timer = setInterval(function () {
      if (_onRefresh) _onRefresh();
    }, REFRESH_INTERVAL);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        clearInterval(_timer);
        _timer = null;
      } else {
        if (_onRefresh) _onRefresh();
        _timer = setInterval(function () {
          if (_onRefresh) _onRefresh();
        }, REFRESH_INTERVAL);
      }
    });
  }

  // --- Helpers ---
  function buildQuery(params) {
    if (!params) return "";
    var parts = [];
    Object.keys(params).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null) {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function unwrap(result) {
    return result.status === "fulfilled" ? result.value : null;
  }

  // --- Public API ---
  return {
    BASE: BASE,
    request: request,
    login: login,
    logout: logout,
    changePassword: changePassword,
    forceChangePassword: forceChangePassword,
    getMe: getMe,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    requireAuth: requireAuth,
    getDashboard: getDashboard,
    getScorecard: getScorecard,
    getRevenue: getRevenue,
    getBonuses: getBonuses,
    getAvailableLoads: getAvailableLoads,
    getMyLoads: getMyLoads,
    getLoadDetail: getLoadDetail,
    acceptLoad: acceptLoad,
    declineLoad: declineLoad,
    updateLoadDriver: updateLoadDriver,
    updateLoadStatus: updateLoadStatus,
    getCppStatus: getCppStatus,
    getPayments: getPayments,
    getPaymentSummary: getPaymentSummary,
    getPaymentDetail: getPaymentDetail,
    requestQuickPay: requestQuickPay,
    getComplianceOverview: getComplianceOverview,
    getCsaScores: getCsaScores,
    getComplianceDocuments: getComplianceDocuments,
    getExpirationCalendar: getExpirationCalendar,
    getNotifications: getNotifications,
    getOnboardingStatus: getOnboardingStatus,
    fetchDashboardData: fetchDashboardData,
    startAutoRefresh: startAutoRefresh,
    batchMileage: batchMileage,
  };
})();
