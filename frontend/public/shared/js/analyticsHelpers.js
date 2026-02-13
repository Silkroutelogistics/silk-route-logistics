/**
 * SRL Analytics Helpers — Shared across AE, Carrier, Accounting consoles.
 * Provides: date picker, chart theme colors, API fetch, export, tab management.
 */
var SRLAnalytics = (function () {
  "use strict";

  // ── API Base ──
  function getBase() {
    if (window.SRL && window.SRL.BASE) return window.SRL.BASE;
    if (window.CARRIER && window.CARRIER.BASE) return window.CARRIER.BASE;
    return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:4000" : "https://api.silkroutelogistics.ai";
  }

  function getToken() {
    return localStorage.getItem("srl_token") || localStorage.getItem("carrier_token") || localStorage.getItem("token") || "";
  }

  function apiFetch(path) {
    return fetch(getBase() + path, {
      headers: { "Authorization": "Bearer " + getToken(), "Content-Type": "application/json" },
      credentials: "include",
    }).then(function (r) {
      if (r.status === 401) { window.location.href = "/auth/login"; return Promise.reject("Unauthorized"); }
      return r.json();
    });
  }

  function apiPost(path, body) {
    return fetch(getBase() + path, {
      method: "POST",
      headers: { "Authorization": "Bearer " + getToken(), "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }).then(function (r) { return r; });
  }

  // ── Theme-Aware Colors ──
  function getThemeColor(varName, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
  }

  function chartColors() {
    return {
      primary: getThemeColor("--theme-primary", "#c8963e"),
      primaryDim: getThemeColor("--theme-primary-dim", "rgba(200,150,62,0.15)"),
      success: getThemeColor("--theme-success", "#22c55e"),
      danger: getThemeColor("--theme-danger", "#ef4444"),
      warning: getThemeColor("--theme-warning", "#f59e0b"),
      info: getThemeColor("--theme-info", "#3b82f6"),
      text: getThemeColor("--theme-text-primary", "#334155"),
      muted: getThemeColor("--theme-text-muted", "#94a3b8"),
      border: getThemeColor("--theme-border", "#e2e8f0"),
      cardBg: getThemeColor("--theme-card-bg", "#ffffff"),
      bg: getThemeColor("--theme-bg", "#f8fafc"),
    };
  }

  function chartDefaults() {
    var c = chartColors();
    Chart.defaults.color = c.muted;
    Chart.defaults.borderColor = c.border;
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 16;
  }

  var PALETTE = ["#c8963e", "#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#f97316"];

  // ── Date Range ──
  var _dateRange = { start: null, end: null, preset: "30d" };
  var _onDateChange = null;

  function initDatePicker(containerId, onChange) {
    _onDateChange = onChange;
    var now = new Date();
    var d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    _dateRange = { start: d30, end: now, preset: "30d" };

    var el = document.getElementById(containerId);
    if (!el) return;

    var presets = [
      { id: "7d", label: "7 Days" },
      { id: "30d", label: "30 Days" },
      { id: "month", label: "This Month" },
      { id: "lastMonth", label: "Last Month" },
      { id: "quarter", label: "This Quarter" },
      { id: "lastQuarter", label: "Last Quarter" },
      { id: "year", label: "This Year" },
    ];

    el.innerHTML =
      '<div class="date-range-bar">' +
        presets.map(function (p) {
          return '<button class="date-preset' + (p.id === "30d" ? " active" : "") + '" data-preset="' + p.id + '">' + p.label + '</button>';
        }).join("") +
        '<div class="date-custom">' +
          '<input type="date" id="dr-start" value="' + fmtDate(d30) + '">' +
          '<span style="color:var(--theme-text-muted,#94a3b8)">to</span>' +
          '<input type="date" id="dr-end" value="' + fmtDate(now) + '">' +
          '<button class="date-apply-btn" id="dr-apply">Apply</button>' +
        '</div>' +
      '</div>';

    // Preset clicks
    el.querySelectorAll(".date-preset").forEach(function (btn) {
      btn.addEventListener("click", function () {
        el.querySelectorAll(".date-preset").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var r = computePreset(btn.dataset.preset);
        _dateRange = r;
        document.getElementById("dr-start").value = fmtDate(r.start);
        document.getElementById("dr-end").value = fmtDate(r.end);
        if (_onDateChange) _onDateChange(r);
      });
    });

    // Custom apply
    document.getElementById("dr-apply").addEventListener("click", function () {
      el.querySelectorAll(".date-preset").forEach(function (b) { b.classList.remove("active"); });
      _dateRange = {
        start: new Date(document.getElementById("dr-start").value),
        end: new Date(document.getElementById("dr-end").value),
        preset: "custom",
      };
      if (_onDateChange) _onDateChange(_dateRange);
    });

    return _dateRange;
  }

  function computePreset(id) {
    var now = new Date();
    var start, end = now;
    switch (id) {
      case "7d": start = new Date(now.getTime() - 7 * 86400000); break;
      case "30d": start = new Date(now.getTime() - 30 * 86400000); break;
      case "month": start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case "lastMonth": start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break;
      case "quarter": var q = Math.floor(now.getMonth() / 3) * 3; start = new Date(now.getFullYear(), q, 1); break;
      case "lastQuarter": var lq = Math.floor(now.getMonth() / 3) * 3 - 3; start = new Date(now.getFullYear(), lq, 1); end = new Date(now.getFullYear(), lq + 3, 0); break;
      case "year": start = new Date(now.getFullYear(), 0, 1); break;
      default: start = new Date(now.getTime() - 30 * 86400000);
    }
    return { start: start, end: end, preset: id };
  }

  function getDateRange() { return _dateRange; }
  function dateQS() { return "start=" + _dateRange.start.toISOString() + "&end=" + _dateRange.end.toISOString(); }

  // ── Tab Management ──
  function initTabs(tabsContainerId) {
    var container = document.getElementById(tabsContainerId);
    if (!container) return;
    var tabs = container.querySelectorAll(".analytics-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        var targetId = tab.dataset.tab;
        document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
        var target = document.getElementById(targetId);
        if (target) target.classList.add("active");
      });
    });
  }

  // ── Formatters ──
  function fmtDate(d) {
    if (typeof d === "string") d = new Date(d);
    return d.toISOString().split("T")[0];
  }
  function fmtMoney(n) {
    if (n === null || n === undefined) return "$0";
    if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString();
  }
  function fmtNum(n) {
    if (n === null || n === undefined) return "0";
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  function fmtPct(n) { return (n || 0).toFixed(1) + "%"; }
  function pctChange(curr, prev) {
    if (!prev || prev === 0) return { value: 0, direction: "neutral" };
    var change = ((curr - prev) / Math.abs(prev)) * 100;
    return { value: Math.abs(change).toFixed(1), direction: change > 0 ? "up" : change < 0 ? "down" : "neutral" };
  }
  function esc(s) { if (!s) return ""; var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // ── Skeletons ──
  function showSkeleton(id, type) {
    var el = document.getElementById(id);
    if (!el) return;
    if (type === "kpi") el.innerHTML = '<div class="kpi-row">' + repeat('<div class="analytics-skeleton skel-kpi"></div>', 5) + '</div>';
    else if (type === "chart") el.innerHTML = '<div class="analytics-skeleton skel-chart"></div>';
    else if (type === "table") el.innerHTML = '<div class="analytics-skeleton skel-table"></div>';
    else el.innerHTML = '<div class="analytics-skeleton skel-chart"></div>';
  }
  function showEmpty(id, msg) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="analytics-empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg></div><h3>No Data Available</h3><p>' + (msg || "Try adjusting the date range") + '</p></div>';
  }
  function repeat(s, n) { var r = ""; for (var i = 0; i < n; i++) r += s; return r; }

  // ── Chart Helpers ──
  var _charts = {};
  function destroyChart(id) { if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; } }

  function createLineChart(canvasId, labels, datasets, opts) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    var c = chartColors();
    chartDefaults();
    _charts[canvasId] = new Chart(ctx, {
      type: "line",
      data: { labels: labels, datasets: datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { backgroundColor: c.cardBg, titleColor: c.text, bodyColor: c.text, borderColor: c.border, borderWidth: 1 } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: c.border + "40" }, ticks: { callback: function (v) { return opts && opts.money ? fmtMoney(v) : fmtNum(v); } } },
        },
      }, opts || {}),
    });
    return _charts[canvasId];
  }

  function createBarChart(canvasId, labels, datasets, opts) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    var c = chartColors();
    chartDefaults();
    _charts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels: labels, datasets: datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { backgroundColor: c.cardBg, titleColor: c.text, bodyColor: c.text, borderColor: c.border, borderWidth: 1 } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: c.border + "40" }, ticks: { callback: function (v) { return opts && opts.money ? fmtMoney(v) : fmtNum(v); } } },
        },
      }, opts || {}),
    });
    return _charts[canvasId];
  }

  function createDoughnutChart(canvasId, labels, data, colors) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    chartDefaults();
    _charts[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: { labels: labels, datasets: [{ data: data, backgroundColor: colors || PALETTE.slice(0, data.length), borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { position: "bottom" } } },
    });
    return _charts[canvasId];
  }

  function createGaugeChart(canvasId, value, max) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    max = max || 100;
    var pct = Math.min(value / max, 1);
    var color = pct >= 0.95 ? "#22c55e" : pct >= 0.9 ? "#f59e0b" : "#ef4444";

    _charts[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: {
        datasets: [{
          data: [value, Math.max(0, max - value)],
          backgroundColor: [color, getThemeColor("--theme-border-light", "#f1f5f9")],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        circumference: 180, rotation: -90, cutout: "75%",
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return _charts[canvasId];
  }

  // ── Heatmap Color ──
  function heatmapClass(marginPct) {
    if (marginPct >= 20) return "heatmap-dark-green";
    if (marginPct >= 15) return "heatmap-light-green";
    if (marginPct >= 10) return "heatmap-yellow";
    if (marginPct >= 5) return "heatmap-orange";
    return "heatmap-red";
  }

  // ── Export ──
  function exportCSV(reportType) {
    var dr = getDateRange();
    apiPost("/api/analytics/export", { report_type: reportType, date_range: { start: dr.start.toISOString(), end: dr.end.toISOString() }, format: "csv" })
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "srl_" + reportType + "_" + fmtDate(dr.start) + ".csv";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  function exportPDF(reportType) {
    // Client-side: fetch JSON data, show alert for PDF
    var dr = getDateRange();
    apiPost("/api/analytics/export", { report_type: reportType, date_range: { start: dr.start.toISOString(), end: dr.end.toISOString() }, format: "pdf" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // Simple: convert to CSV download for now, PDF requires html2canvas
        alert("PDF export generated. Data downloaded as JSON.");
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "srl_" + reportType + "_" + fmtDate(dr.start) + ".json";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  // ── Public API ──
  return {
    fetch: apiFetch,
    post: apiPost,
    getToken: getToken,
    initDatePicker: initDatePicker,
    initTabs: initTabs,
    getDateRange: getDateRange,
    dateQS: dateQS,
    chartColors: chartColors,
    PALETTE: PALETTE,
    createLineChart: createLineChart,
    createBarChart: createBarChart,
    createDoughnutChart: createDoughnutChart,
    createGaugeChart: createGaugeChart,
    heatmapClass: heatmapClass,
    showSkeleton: showSkeleton,
    showEmpty: showEmpty,
    destroyChart: destroyChart,
    exportCSV: exportCSV,
    exportPDF: exportPDF,
    fmtMoney: fmtMoney,
    fmtNum: fmtNum,
    fmtPct: fmtPct,
    fmtDate: fmtDate,
    pctChange: pctChange,
    esc: esc,
  };
})();
