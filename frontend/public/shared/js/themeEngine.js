/**
 * SRL Theme Engine
 * 6 preset themes with dark/light toggle.
 * Persists to localStorage + backend user profile.
 */
(function () {
  "use strict";

  var THEMES = [
    { id: "silk-route-classic", name: "Silk Route Classic", primary: "#C8963E", sidebar: "#0D1B2A", accent: "#D4A64E" },
    { id: "midnight-express", name: "Midnight Express", primary: "#818CF8", sidebar: "#312E81", accent: "#A5B4FC" },
    { id: "desert-route", name: "Desert Route", primary: "#C2703E", sidebar: "#78350F", accent: "#D4843E" },
    { id: "arctic-haul", name: "Arctic Haul", primary: "#0EA5E9", sidebar: "#0C4A6E", accent: "#38BDF8" },
    { id: "highway-green", name: "Highway Green", primary: "#16A34A", sidebar: "#14532D", accent: "#22C55E" },
    { id: "chrome-steel", name: "Chrome Steel", primary: "#71717A", sidebar: "#27272A", accent: "#A1A1AA" }
  ];

  var LS_THEME = "srl_theme";
  var LS_MODE = "srl_mode";
  var panelOpen = false;
  var previewState = null; // { theme, mode } when previewing

  // ── Core Getters/Setters ──

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") || "silk-route-classic";
  }

  function getMode() {
    return document.documentElement.getAttribute("data-mode") || "light";
  }

  function setTheme(name, mode, opts) {
    opts = opts || {};
    var validTheme = THEMES.find(function (t) { return t.id === name; });
    if (!validTheme) name = "silk-route-classic";
    if (mode !== "dark" && mode !== "light") mode = "light";

    document.documentElement.setAttribute("data-theme", name);
    document.documentElement.setAttribute("data-mode", mode);

    if (!opts.preview) {
      localStorage.setItem(LS_THEME, name);
      localStorage.setItem(LS_MODE, mode);
    }

    if (opts.sync) {
      syncToBackend(name, mode);
    }

    // Update panel UI if open
    if (panelOpen) updatePanelSelection();
  }

  // ── Backend Sync (fire-and-forget) ──

  function syncToBackend(theme, mode) {
    var token = localStorage.getItem("srl_token") || localStorage.getItem("carrier_token") || localStorage.getItem("token") || "";
    if (!token) return;

    var base = window.SRL_API_BASE || (window.SRL && window.SRL.BASE) || (window.CARRIER && window.CARRIER.BASE) || "https://api.silkroutelogistics.ai";

    try {
      fetch(base + "/api/auth/preferences", {
        method: "PATCH",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          preferredTheme: theme,
          darkMode: mode === "dark"
        })
      }).catch(function () { /* silent */ });
    } catch (e) { /* silent */ }
  }

  // ── Restore from user profile ──

  function restoreFromUser(user) {
    if (!user) return;
    var theme = user.preferredTheme || "silk-route-classic";
    var mode = user.darkMode ? "dark" : "light";

    // Only override if different from current localStorage (user may have changed on this device)
    var lsTheme = localStorage.getItem(LS_THEME);
    var lsMode = localStorage.getItem(LS_MODE);

    if (!lsTheme && !lsMode) {
      // First visit on this device — use server values
      setTheme(theme, mode);
    }
    // If localStorage is already set, trust it (user changed on this device)
  }

  // ── Panel Injection ──

  function injectPanelStyles() {
    if (document.getElementById("srl-theme-styles")) return;
    var style = document.createElement("style");
    style.id = "srl-theme-styles";
    style.textContent =
      ".srl-theme-gear{background:var(--theme-bell-bg,rgba(255,255,255,0.08));border:1px solid var(--theme-bell-border,rgba(255,255,255,0.12));border-radius:8px;color:var(--theme-text-muted,#94a3b8);cursor:pointer;padding:8px 10px;display:inline-flex;align-items:center;transition:all .2s;margin-left:8px;}" +
      ".srl-theme-gear:hover{background:var(--theme-primary-dim,rgba(200,150,62,0.15));color:var(--theme-primary,#c8963e);border-color:var(--theme-primary,#c8963e);}" +
      ".srl-theme-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;}" +
      ".srl-theme-overlay.open{display:block;}" +
      ".srl-theme-panel{position:fixed;top:0;right:-340px;width:320px;height:100vh;background:var(--theme-panel-bg,#fff);border-left:1px solid var(--theme-border,#e2e8f0);box-shadow:-4px 0 24px rgba(0,0,0,0.15);z-index:10000;transition:right .3s ease;display:flex;flex-direction:column;overflow-y:auto;}" +
      ".srl-theme-panel.open{right:0;}" +
      ".srl-theme-panel-header{display:flex;align-items:center;justify-content:space-between;padding:20px;border-bottom:1px solid var(--theme-border,#e2e8f0);}" +
      ".srl-theme-panel-header h3{font-size:16px;font-weight:700;color:var(--theme-text-heading,#0d1b2a);margin:0;}" +
      ".srl-theme-panel-close{background:none;border:none;color:var(--theme-text-muted,#94a3b8);font-size:22px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;}" +
      ".srl-theme-panel-close:hover{background:var(--theme-danger-bg,rgba(239,68,68,0.1));color:var(--theme-danger,#ef4444);}" +
      ".srl-theme-section{padding:20px;}" +
      ".srl-theme-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--theme-text-muted,#94a3b8);margin-bottom:12px;}" +
      /* Toggle switch */
      ".srl-mode-toggle{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--theme-bg-alt,#f1f5f9);border-radius:10px;margin-bottom:4px;}" +
      ".srl-mode-label{font-size:14px;font-weight:500;color:var(--theme-text-primary,#334155);}" +
      ".srl-mode-switch{position:relative;width:48px;height:26px;cursor:pointer;}" +
      ".srl-mode-switch input{display:none;}" +
      ".srl-mode-track{position:absolute;inset:0;background:var(--theme-border,#e2e8f0);border-radius:13px;transition:background .2s;}" +
      ".srl-mode-switch input:checked+.srl-mode-track{background:var(--theme-primary,#c8963e);}" +
      ".srl-mode-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);}" +
      ".srl-mode-switch input:checked~.srl-mode-knob{transform:translateX(22px);}" +
      /* Theme grid */
      ".srl-theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}" +
      ".srl-theme-card{position:relative;border:2px solid var(--theme-border,#e2e8f0);border-radius:10px;padding:12px;cursor:pointer;transition:all .2s;text-align:center;}" +
      ".srl-theme-card:hover{border-color:var(--theme-primary,#c8963e);transform:translateY(-1px);}" +
      ".srl-theme-card.active{border-color:var(--theme-primary,#c8963e);box-shadow:0 0 0 2px var(--theme-primary-dim,rgba(200,150,62,0.3));}" +
      ".srl-theme-swatch{display:flex;gap:3px;height:24px;border-radius:6px;overflow:hidden;margin-bottom:8px;}" +
      ".srl-theme-swatch span{flex:1;}" +
      ".srl-theme-card-name{font-size:11px;font-weight:600;color:var(--theme-text-primary,#334155);}" +
      ".srl-theme-check{display:none;position:absolute;top:6px;right:6px;width:18px;height:18px;background:var(--theme-primary,#c8963e);border-radius:50%;align-items:center;justify-content:center;}" +
      ".srl-theme-card.active .srl-theme-check{display:flex;}" +
      /* Apply button */
      ".srl-theme-apply{display:block;width:100%;padding:12px;background:var(--theme-primary,#c8963e);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s;margin-top:16px;}" +
      ".srl-theme-apply:hover{opacity:0.9;}" +
      ".srl-theme-apply:disabled{opacity:0.5;cursor:not-allowed;}";
    document.head.appendChild(style);
  }

  function createGearButton() {
    var btn = document.createElement("button");
    btn.className = "srl-theme-gear";
    btn.title = "Theme Settings";
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      togglePanel();
    });
    return btn;
  }

  function createPanel() {
    // Overlay
    var overlay = document.createElement("div");
    overlay.className = "srl-theme-overlay";
    overlay.id = "srl-theme-overlay";
    overlay.addEventListener("click", closePanel);

    // Panel
    var panel = document.createElement("div");
    panel.className = "srl-theme-panel";
    panel.id = "srl-theme-panel";

    var currentTheme = getTheme();
    var currentMode = getMode();

    panel.innerHTML =
      '<div class="srl-theme-panel-header">' +
        '<h3>Theme Settings</h3>' +
        '<button class="srl-theme-panel-close" id="srl-theme-close">&times;</button>' +
      '</div>' +
      '<div class="srl-theme-section">' +
        '<div class="srl-theme-section-title">Appearance</div>' +
        '<div class="srl-mode-toggle">' +
          '<span class="srl-mode-label">Dark Mode</span>' +
          '<label class="srl-mode-switch">' +
            '<input type="checkbox" id="srl-dark-toggle"' + (currentMode === "dark" ? " checked" : "") + '>' +
            '<span class="srl-mode-track"></span>' +
            '<span class="srl-mode-knob"></span>' +
          '</label>' +
        '</div>' +
      '</div>' +
      '<div class="srl-theme-section">' +
        '<div class="srl-theme-section-title">Theme</div>' +
        '<div class="srl-theme-grid" id="srl-theme-grid">' +
          THEMES.map(function (t) {
            var isActive = t.id === currentTheme;
            return '<div class="srl-theme-card' + (isActive ? " active" : "") + '" data-theme="' + t.id + '">' +
              '<div class="srl-theme-swatch">' +
                '<span style="background:' + t.sidebar + '"></span>' +
                '<span style="background:' + t.primary + '"></span>' +
                '<span style="background:' + t.accent + '"></span>' +
              '</div>' +
              '<div class="srl-theme-card-name">' + t.name + '</div>' +
              '<div class="srl-theme-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>' +
            '</div>';
          }).join("") +
        '</div>' +
        '<button class="srl-theme-apply" id="srl-theme-apply">Apply Theme</button>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Event: Close button
    document.getElementById("srl-theme-close").addEventListener("click", closePanel);

    // Event: Dark mode toggle
    document.getElementById("srl-dark-toggle").addEventListener("change", function () {
      var newMode = this.checked ? "dark" : "light";
      setTheme(getTheme(), newMode, { preview: true });
      previewState = { theme: getTheme(), mode: newMode };
    });

    // Event: Theme cards
    var grid = document.getElementById("srl-theme-grid");
    grid.addEventListener("click", function (e) {
      var card = e.target.closest(".srl-theme-card");
      if (!card) return;
      var themeId = card.getAttribute("data-theme");
      var mode = document.getElementById("srl-dark-toggle").checked ? "dark" : "light";
      setTheme(themeId, mode, { preview: true });
      previewState = { theme: themeId, mode: mode };
    });

    // Event: Apply button
    document.getElementById("srl-theme-apply").addEventListener("click", function () {
      var theme = getTheme();
      var mode = getMode();
      setTheme(theme, mode, { sync: true }); // persists to localStorage + backend
      previewState = null;
      closePanel();
    });
  }

  function updatePanelSelection() {
    var currentTheme = getTheme();
    var currentMode = getMode();

    var cards = document.querySelectorAll(".srl-theme-card");
    cards.forEach(function (card) {
      card.classList.toggle("active", card.getAttribute("data-theme") === currentTheme);
    });

    var toggle = document.getElementById("srl-dark-toggle");
    if (toggle) toggle.checked = currentMode === "dark";
  }

  function openPanel() {
    var panel = document.getElementById("srl-theme-panel");
    var overlay = document.getElementById("srl-theme-overlay");
    if (!panel) {
      createPanel();
      panel = document.getElementById("srl-theme-panel");
      overlay = document.getElementById("srl-theme-overlay");
    }

    // Save state before preview
    previewState = null;
    panelOpen = true;
    updatePanelSelection();

    // Small delay for animation
    requestAnimationFrame(function () {
      panel.classList.add("open");
      overlay.classList.add("open");
    });
  }

  function closePanel() {
    var panel = document.getElementById("srl-theme-panel");
    var overlay = document.getElementById("srl-theme-overlay");
    if (!panel) return;

    panelOpen = false;
    panel.classList.remove("open");
    overlay.classList.remove("open");

    // If preview was active but not applied, revert to localStorage
    if (previewState) {
      var savedTheme = localStorage.getItem(LS_THEME) || "silk-route-classic";
      var savedMode = localStorage.getItem(LS_MODE) || "light";
      setTheme(savedTheme, savedMode);
      previewState = null;
    }
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  // ── Init ──

  function init() {
    injectPanelStyles();

    // Find header to inject gear icon
    var header = document.querySelector(".main-header") || document.querySelector(".page-header");
    if (!header) return;

    // Make header flex if not already
    var headerStyle = window.getComputedStyle(header);
    if (headerStyle.display !== "flex") {
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.flexWrap = "wrap";
    }

    // Find the notification bell wrapper or create a toolbar area
    var bellWrapper = header.querySelector(".notif-bell-wrapper");
    var gear = createGearButton();

    if (bellWrapper) {
      // Insert gear next to bell
      bellWrapper.parentNode.insertBefore(gear, bellWrapper);
    } else {
      // No bell yet — append to header
      header.appendChild(gear);
    }
  }

  // ── Auto-init ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ── Public API ──
  window.SRLTheme = {
    setTheme: setTheme,
    getTheme: getTheme,
    getMode: getMode,
    restoreFromUser: restoreFromUser,
    openPanel: openPanel,
    closePanel: closePanel,
    togglePanel: togglePanel,
    themes: THEMES
  };
})();
