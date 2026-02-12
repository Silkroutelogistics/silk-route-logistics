/**
 * SRL API Client — AE Command Center
 * Vanilla JS module exposing SRL namespace
 */
var SRL = (function () {
  "use strict";

  // --- Config ---
  var BASE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:4000"
      : "https://api.silkroutelogistics.ai";

  var REFRESH_INTERVAL = 120000; // 2 minutes
  var _timer = null;
  var _onRefresh = null;

  // --- Core Fetch Wrapper ---
  function request(path, opts) {
    opts = opts || {};
    var url = BASE + path;
    var token = localStorage.getItem("token");

    var headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    return fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      credentials: "include",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/auth/login";
        return Promise.reject(new Error("Unauthorized"));
      }
      if (res.status === 403) {
        return Promise.reject(new Error("Forbidden"));
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

  // --- Data Fetching ---
  function getMe() {
    return request("/api/auth/me");
  }

  function getLoads(params) {
    var qs = buildQuery(params);
    return request("/api/loads" + qs);
  }

  function getCarriers(params) {
    var qs = buildQuery(params);
    return request("/api/carriers" + qs);
  }

  function getAllInvoices(params) {
    var qs = buildQuery(params);
    return request("/api/invoices/all" + qs);
  }

  function getInvoiceStats() {
    return request("/api/invoices/stats");
  }

  function getRecentCheckCalls(limit) {
    return request("/api/check-calls/recent?limit=" + (limit || 100));
  }

  function getComplianceStats() {
    return request("/api/compliance/stats");
  }

  function getNotifications() {
    return request("/api/notifications");
  }

  // --- Dashboard Aggregate ---
  function fetchDashboardData() {
    return Promise.allSettled([
      getMe(),                                          // 0
      getLoads({ status: "POSTED", limit: 100 }),       // 1 - unassigned
      getLoads({ activeOnly: true, limit: 100 }),       // 2 - active
      getLoads({ status: "DELIVERED", limit: 100 }),    // 3 - delivered
      getCarriers({ status: "NEW" }),                   // 4 - pending carriers
      getInvoiceStats(),                                // 5
      getAllInvoices({ status: "SUBMITTED" }),           // 6 - open invoices
      getRecentCheckCalls(100),                         // 7
      getComplianceStats(),                             // 8
      getNotifications(),                               // 9
    ]).then(function (results) {
      return {
        user: unwrap(results[0]),
        postedLoads: unwrap(results[1]),
        activeLoads: unwrap(results[2]),
        deliveredLoads: unwrap(results[3]),
        pendingCarriers: unwrap(results[4]),
        invoiceStats: unwrap(results[5]),
        openInvoices: unwrap(results[6]),
        checkCalls: unwrap(results[7]),
        complianceStats: unwrap(results[8]),
        notifications: unwrap(results[9]),
      };
    });
  }

  // --- Alert Computation ---
  function computeAlerts(data) {
    var alerts = [];

    // Red: Overdue check calls (active loads with no check call in >4 hours)
    if (data.activeLoads && data.checkCalls) {
      var activeLoadsList = data.activeLoads.loads || [];
      var checkCallsList = Array.isArray(data.checkCalls) ? data.checkCalls : [];
      var fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;

      // Build map: loadId -> most recent check call timestamp
      var lastCallMap = {};
      checkCallsList.forEach(function (cc) {
        var t = new Date(cc.createdAt).getTime();
        if (!lastCallMap[cc.loadId] || t > lastCallMap[cc.loadId]) {
          lastCallMap[cc.loadId] = t;
        }
      });

      var overdueLoads = activeLoadsList.filter(function (load) {
        var inTransitStatuses = ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"];
        if (inTransitStatuses.indexOf(load.status) === -1) return false;
        var lastCall = lastCallMap[load.id];
        return !lastCall || lastCall < fourHoursAgo;
      });

      if (overdueLoads.length > 0) {
        alerts.push({
          level: "red",
          message: overdueLoads.length + " load(s) overdue for check call (>4 hrs)",
        });
      }
    }

    // Red: Critical compliance issues
    if (data.complianceStats && data.complianceStats.severity) {
      var critical = data.complianceStats.severity.critical || 0;
      if (critical > 0) {
        alerts.push({
          level: "red",
          message: critical + " critical compliance alert(s)",
        });
      }
    }

    // Amber: Stale posted loads (>24 hours old)
    if (data.postedLoads) {
      var postedList = data.postedLoads.loads || [];
      var twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      var stalePosted = postedList.filter(function (load) {
        return new Date(load.createdAt).getTime() < twentyFourHoursAgo;
      });
      if (stalePosted.length > 0) {
        alerts.push({
          level: "amber",
          message: stalePosted.length + " posted load(s) uncovered for 24+ hrs",
        });
      }
    }

    // Amber: Aging invoices > 30 days
    if (data.invoiceStats && data.invoiceStats.aging) {
      var aging = data.invoiceStats.aging;
      var agingCount =
        (aging.over30 ? aging.over30.count : 0) +
        (aging.over60 ? aging.over60.count : 0) +
        (aging.over90 ? aging.over90.count : 0);
      if (agingCount > 0) {
        alerts.push({
          level: "amber",
          message: agingCount + " invoice(s) aging beyond 30 days",
        });
      }
    }

    // Amber: Compliance warnings
    if (data.complianceStats && data.complianceStats.severity) {
      var warnings = data.complianceStats.severity.warning || 0;
      if (warnings > 0) {
        alerts.push({
          level: "amber",
          message: warnings + " compliance warning(s)",
        });
      }
    }

    return alerts;
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

  function stopAutoRefresh() {
    clearInterval(_timer);
    _timer = null;
    _onRefresh = null;
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

  // --- Caravan / Carrier Match ---
  function getCaravanCarriers(params) {
    var qs = buildQuery(params);
    return request("/api/carriers" + qs);
  }

  function matchCarriersForLoad(loadId) {
    return request("/api/carrier-match/" + loadId);
  }

  function importFromDAT(data) {
    return request("/api/carrier-match/import-from-dat", { method: "POST", body: data });
  }

  function emergencyApproveCarrier(carrierId, reason) {
    return request("/api/carrier-match/" + carrierId + "/emergency-approve", { method: "POST", body: { reason: reason } });
  }

  function promoteToBronze(carrierId) {
    return request("/api/carrier-match/" + carrierId + "/promote-to-bronze", { method: "POST" });
  }

  // --- DAT Integration ---
  function postToDAT(loadId) {
    return request("/api/dat/post-load", { method: "POST", body: { loadId: loadId } });
  }

  function postToDATAdvanced(data) {
    return request("/api/dat/post-load-advanced", { method: "POST", body: data });
  }

  function removeFromDAT(datPostId) {
    return request("/api/dat/remove-post/" + datPostId, { method: "DELETE" });
  }

  function getDATResponses(loadId) {
    return request("/api/dat/responses/" + loadId);
  }

  // --- SRCPP ---
  function getSRCPPLeaderboard() {
    return request("/api/srcpp/leaderboard");
  }

  // --- Phase C: Automation ---

  function smartMatchCarriers(loadId) {
    return request("/api/automation/match-carriers/" + loadId, { method: "POST" });
  }

  function assignMatchedCarrier(loadId, userId) {
    return request("/api/automation/assign-match/" + loadId, {
      method: "POST",
      body: JSON.stringify({ userId: userId }),
    });
  }

  function getCheckCallSchedule(loadId) {
    return request("/api/automation/check-call-schedule/" + loadId);
  }

  function createCheckCallSchedule(loadId) {
    return request("/api/automation/check-call-schedule/" + loadId, { method: "POST" });
  }

  function getRiskScore(loadId) {
    return request("/api/automation/risk-score/" + loadId);
  }

  function triggerFallOffRecovery(loadId, reason) {
    return request("/api/automation/fall-off-recovery/" + loadId, {
      method: "POST",
      body: JSON.stringify({ reason: reason }),
    });
  }

  function acceptFallOff(loadId, carrierUserId) {
    return request("/api/automation/fall-off-accept/" + loadId, {
      method: "POST",
      body: JSON.stringify({ carrierUserId: carrierUserId }),
    });
  }

  function getFallOffEvents(status) {
    var q = status ? "?status=" + status : "";
    return request("/api/automation/fall-off-events" + q);
  }

  function startEmailSequence(prospectId) {
    return request("/api/automation/sequences/start", {
      method: "POST",
      body: JSON.stringify({ prospectId: prospectId }),
    });
  }

  function stopEmailSequence(sequenceId, reason) {
    return request("/api/automation/sequences/" + sequenceId, {
      method: "DELETE",
      body: JSON.stringify({ reason: reason || "MANUAL" }),
    });
  }

  function getActiveSequences() {
    return request("/api/automation/sequences/active");
  }

  function getAutomationSummary() {
    return request("/api/automation/summary");
  }

  // --- Rate Confirmation / Tender ---
  function createRateConfirmation(data) {
    return request("/api/rate-confirmations", { method: "POST", body: data });
  }

  function updateRateConfirmation(id, data) {
    return request("/api/rate-confirmations/" + id, { method: "PUT", body: data });
  }

  function getRateConfirmation(id) {
    return request("/api/rate-confirmations/" + id);
  }

  function getRateConfirmationsByLoad(loadId) {
    return request("/api/rate-confirmations/load/" + loadId);
  }

  function sendRateConfirmationToCarrier(id, data) {
    return request("/api/rate-confirmations/" + id + "/send", { method: "POST", body: data });
  }

  function sendRateConfirmationToShipper(id, data) {
    return request("/api/rate-confirmations/" + id + "/send-shipper", { method: "POST", body: data });
  }

  function signRateConfirmation(id, data) {
    return request("/api/rate-confirmations/" + id + "/sign", { method: "POST", body: data });
  }

  function finalizeRateConfirmation(id) {
    return request("/api/rate-confirmations/" + id + "/finalize", { method: "POST", body: {} });
  }

  function getRateConfirmationPdfUrl(id) {
    return BASE + "/api/rate-confirmations/" + id + "/pdf";
  }

  function getLoadById(loadId) {
    return request("/api/loads/" + loadId);
  }

  function getCustomers(params) {
    var qs = buildQuery(params);
    return request("/api/customers" + qs);
  }

  // --- Claims ---
  function getClaims(params) {
    var qs = buildQuery(params);
    return request("/api/claims" + qs);
  }

  function getClaimById(id) {
    return request("/api/claims/" + id);
  }

  function createClaim(data) {
    return request("/api/claims", { method: "POST", body: data });
  }

  function updateClaim(id, data) {
    return request("/api/claims/" + id, { method: "PATCH", body: data });
  }

  // --- Invoices (D.2) ---
  function generateInvoice(loadId) {
    return request("/api/invoices/generate/" + loadId, { method: "POST" });
  }

  function markInvoicePaid(id, data) {
    return request("/api/invoices/" + id + "/mark-paid", { method: "PATCH", body: data || {} });
  }

  function getInvoiceAging() {
    return request("/api/invoices/aging");
  }

  // --- Financials (D.5) ---
  function getFinancialSummary(period) {
    return request("/api/financials/summary?period=" + (period || "month"));
  }

  // --- Accounting Console ---
  function acctDashboard() { return request("/api/accounting/dashboard/enhanced"); }
  function acctInvoices(params) { return request("/api/accounting/invoices?" + new URLSearchParams(params || {}).toString()); }
  function acctInvoiceById(id) { return request("/api/accounting/invoices/" + id); }
  function acctCreateInvoice(data) { return request("/api/accounting/invoices", { method: "POST", body: data }); }
  function acctSendInvoice(id) { return request("/api/accounting/invoices/" + id + "/send", { method: "POST" }); }
  function acctMarkInvoicePaid(id, data) { return request("/api/accounting/invoices/" + id + "/mark-paid", { method: "PUT", body: data }); }
  function acctVoidInvoice(id, data) { return request("/api/accounting/invoices/" + id + "/void", { method: "POST", body: data }); }
  function acctInvoiceAging() { return request("/api/accounting/invoices/aging"); }
  function acctPayments(params) { return request("/api/accounting/payments?" + new URLSearchParams(params || {}).toString()); }
  function acctPaymentById(id) { return request("/api/accounting/payments/" + id); }
  function acctPreparePayment(data) { return request("/api/accounting/payments/prepare", { method: "POST", body: data }); }
  function acctUpdatePayment(id, data) { return request("/api/accounting/payments/" + id, { method: "PUT", body: data }); }
  function acctSubmitPayment(id) { return request("/api/accounting/payments/" + id + "/submit", { method: "POST" }); }
  function acctApprovePayment(id) { return request("/api/accounting/payments/" + id + "/approve", { method: "POST" }); }
  function acctRejectPayment(id, data) { return request("/api/accounting/payments/" + id + "/reject", { method: "POST", body: data }); }
  function acctHoldPayment(id, data) { return request("/api/accounting/payments/" + id + "/hold", { method: "POST", body: data }); }
  function acctMarkPaymentPaid(id, data) { return request("/api/accounting/payments/" + id + "/mark-paid", { method: "POST", body: data }); }
  function acctBulkApprove(ids) { return request("/api/accounting/payments/bulk-approve", { method: "POST", body: { paymentIds: ids } }); }
  function acctPaymentQueue(params) { return request("/api/accounting/payments/queue?" + new URLSearchParams(params || {}).toString()); }
  function acctAPAging() { return request("/api/accounting/payments/aging"); }
  function acctSRCPPTiers() { return request("/api/accounting/payments/srcpp-tiers"); }
  function acctDisputes(params) { return request("/api/accounting/disputes?" + new URLSearchParams(params || {}).toString()); }
  function acctDisputeById(id) { return request("/api/accounting/disputes/" + id); }
  function acctFileDispute(data) { return request("/api/accounting/disputes", { method: "POST", body: data }); }
  function acctCredit(params) { return request("/api/accounting/credit?" + new URLSearchParams(params || {}).toString()); }
  function acctCreditById(id) { return request("/api/accounting/credit/" + id); }
  function acctUpdateCredit(id, data) { return request("/api/accounting/credit/" + id, { method: "PUT", body: data }); }
  function acctCreditAlerts() { return request("/api/accounting/credit/alerts"); }
  function acctFundBalance() { return request("/api/accounting/fund/balance"); }
  function acctFundHealth() { return request("/api/accounting/fund/health"); }
  function acctFundTransactions(params) { return request("/api/accounting/fund/transactions?" + new URLSearchParams(params || {}).toString()); }
  function acctFundPerformance() { return request("/api/accounting/fund/performance"); }
  function acctFundAdjustment(data) { return request("/api/accounting/fund/adjustment", { method: "POST", body: data }); }
  function acctApprovals(params) { return request("/api/accounting/approvals?" + new URLSearchParams(params || {}).toString()); }
  function acctApprovalById(id) { return request("/api/accounting/approvals/" + id); }
  function acctReviewApproval(id, data) { return request("/api/accounting/approvals/" + id + "/review", { method: "POST", body: data }); }
  function acctPnlLoads(params) { return request("/api/accounting/pnl/loads?" + new URLSearchParams(params || {}).toString()); }
  function acctLaneProfitability(params) { return request("/api/accounting/pnl/lanes?" + new URLSearchParams(params || {}).toString()); }
  function acctCarrierProfitability(params) { return request("/api/accounting/pnl/carriers?" + new URLSearchParams(params || {}).toString()); }
  function acctShipperProfitability(params) { return request("/api/accounting/pnl/shippers?" + new URLSearchParams(params || {}).toString()); }
  function acctWeeklyReport() { return request("/api/accounting/reports/weekly"); }
  function acctMonthlyReport(params) { return request("/api/accounting/reports/monthly?" + new URLSearchParams(params || {}).toString()); }
  function acctStoredReports(params) { return request("/api/accounting/reports/stored?" + new URLSearchParams(params || {}).toString()); }
  function acctGenerateReport(data) { return request("/api/accounting/reports/generate", { method: "POST", body: data }); }
  function acctDeleteReport(id) { return request("/api/accounting/reports/" + id, { method: "DELETE" }); }
  function acctExport(data) { return request("/api/accounting/export", { method: "POST", body: data }); }

  // --- Public API ---
  return {
    BASE: BASE,
    request: request,
    getMe: getMe,
    getLoads: getLoads,
    getCarriers: getCarriers,
    getAllInvoices: getAllInvoices,
    getInvoiceStats: getInvoiceStats,
    getRecentCheckCalls: getRecentCheckCalls,
    getComplianceStats: getComplianceStats,
    getNotifications: getNotifications,
    fetchDashboardData: fetchDashboardData,
    computeAlerts: computeAlerts,
    startAutoRefresh: startAutoRefresh,
    stopAutoRefresh: stopAutoRefresh,
    getCaravanCarriers: getCaravanCarriers,
    matchCarriersForLoad: matchCarriersForLoad,
    importFromDAT: importFromDAT,
    emergencyApproveCarrier: emergencyApproveCarrier,
    promoteToBronze: promoteToBronze,
    postToDAT: postToDAT,
    postToDATAdvanced: postToDATAdvanced,
    removeFromDAT: removeFromDAT,
    getDATResponses: getDATResponses,
    getSRCPPLeaderboard: getSRCPPLeaderboard,
    smartMatchCarriers: smartMatchCarriers,
    assignMatchedCarrier: assignMatchedCarrier,
    getCheckCallSchedule: getCheckCallSchedule,
    createCheckCallSchedule: createCheckCallSchedule,
    getRiskScore: getRiskScore,
    triggerFallOffRecovery: triggerFallOffRecovery,
    acceptFallOff: acceptFallOff,
    getFallOffEvents: getFallOffEvents,
    startEmailSequence: startEmailSequence,
    stopEmailSequence: stopEmailSequence,
    getActiveSequences: getActiveSequences,
    getAutomationSummary: getAutomationSummary,
    createRateConfirmation: createRateConfirmation,
    updateRateConfirmation: updateRateConfirmation,
    getRateConfirmation: getRateConfirmation,
    getRateConfirmationsByLoad: getRateConfirmationsByLoad,
    sendRateConfirmationToCarrier: sendRateConfirmationToCarrier,
    sendRateConfirmationToShipper: sendRateConfirmationToShipper,
    signRateConfirmation: signRateConfirmation,
    finalizeRateConfirmation: finalizeRateConfirmation,
    getRateConfirmationPdfUrl: getRateConfirmationPdfUrl,
    getLoadById: getLoadById,
    getCustomers: getCustomers,
    getClaims: getClaims,
    getClaimById: getClaimById,
    createClaim: createClaim,
    updateClaim: updateClaim,
    generateInvoice: generateInvoice,
    markInvoicePaid: markInvoicePaid,
    getInvoiceAging: getInvoiceAging,
    getFinancialSummary: getFinancialSummary,
    acctDashboard: acctDashboard,
    acctInvoices: acctInvoices,
    acctInvoiceById: acctInvoiceById,
    acctCreateInvoice: acctCreateInvoice,
    acctSendInvoice: acctSendInvoice,
    acctMarkInvoicePaid: acctMarkInvoicePaid,
    acctVoidInvoice: acctVoidInvoice,
    acctInvoiceAging: acctInvoiceAging,
    acctPayments: acctPayments,
    acctPaymentById: acctPaymentById,
    acctPreparePayment: acctPreparePayment,
    acctUpdatePayment: acctUpdatePayment,
    acctSubmitPayment: acctSubmitPayment,
    acctApprovePayment: acctApprovePayment,
    acctRejectPayment: acctRejectPayment,
    acctHoldPayment: acctHoldPayment,
    acctMarkPaymentPaid: acctMarkPaymentPaid,
    acctBulkApprove: acctBulkApprove,
    acctPaymentQueue: acctPaymentQueue,
    acctAPAging: acctAPAging,
    acctSRCPPTiers: acctSRCPPTiers,
    acctDisputes: acctDisputes,
    acctDisputeById: acctDisputeById,
    acctFileDispute: acctFileDispute,
    acctCredit: acctCredit,
    acctCreditById: acctCreditById,
    acctUpdateCredit: acctUpdateCredit,
    acctCreditAlerts: acctCreditAlerts,
    acctFundBalance: acctFundBalance,
    acctFundHealth: acctFundHealth,
    acctFundTransactions: acctFundTransactions,
    acctFundPerformance: acctFundPerformance,
    acctFundAdjustment: acctFundAdjustment,
    acctApprovals: acctApprovals,
    acctApprovalById: acctApprovalById,
    acctReviewApproval: acctReviewApproval,
    acctPnlLoads: acctPnlLoads,
    acctLaneProfitability: acctLaneProfitability,
    acctCarrierProfitability: acctCarrierProfitability,
    acctShipperProfitability: acctShipperProfitability,
    acctWeeklyReport: acctWeeklyReport,
    acctMonthlyReport: acctMonthlyReport,
    acctStoredReports: acctStoredReports,
    acctGenerateReport: acctGenerateReport,
    acctDeleteReport: acctDeleteReport,
    acctExport: acctExport,
  };
})();
