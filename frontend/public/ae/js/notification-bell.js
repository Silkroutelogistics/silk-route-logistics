/**
 * SRL Notification Bell Component
 * Drop-in notification bell with unread count badge and dropdown.
 * Auto-injects into .main-header or .page-header on DOMContentLoaded.
 */
(function () {
  "use strict";

  const API = window.SRL_API_BASE || (window.SRL && SRL.base) || "https://api.silkroutelogistics.ai/api";

  function getToken() {
    return sessionStorage.getItem("token") || localStorage.getItem("srl_token") || localStorage.getItem("token") || "";
  }

  async function apiFetch(path) {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function apiPatch(path) {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API}${path}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Render Bell ──
  function createBellHTML() {
    return `
      <div class="notif-bell-wrapper" id="notif-bell-wrapper">
        <button class="notif-bell-btn" id="notif-bell-btn" title="Notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span class="notif-badge" id="notif-badge" style="display:none">0</span>
        </button>
        <div class="notif-dropdown" id="notif-dropdown" style="display:none">
          <div class="notif-dropdown-header">
            <span>Notifications</span>
            <button class="notif-mark-all" id="notif-mark-all" title="Mark all as read">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              Mark all read
            </button>
          </div>
          <div class="notif-list" id="notif-list">
            <div class="notif-empty">Loading...</div>
          </div>
          <div class="notif-dropdown-footer">
            <a href="/admin/monitoring" class="notif-see-all">View All Activity</a>
          </div>
        </div>
      </div>
    `;
  }

  // ── Styles ──
  function injectStyles() {
    if (document.getElementById("notif-bell-styles")) return;
    const style = document.createElement("style");
    style.id = "notif-bell-styles";
    style.textContent = `
      .notif-bell-wrapper { position: relative; display: inline-flex; align-items: center; margin-left: auto; }
      .notif-bell-btn {
        background: var(--theme-bell-bg, rgba(255,255,255,0.08)); border: 1px solid var(--theme-bell-border, rgba(255,255,255,0.12)); border-radius: 8px;
        color: var(--theme-text-muted, #94a3b8); cursor: pointer; padding: 8px 10px; display: flex; align-items: center; gap: 4px;
        transition: all 0.2s;
      }
      .notif-bell-btn:hover { background: var(--theme-primary-dim, rgba(200,150,62,0.15)); color: var(--theme-primary, #c8963e); border-color: var(--theme-primary, #c8963e); }
      .notif-badge {
        position: absolute; top: -4px; right: -4px; background: var(--theme-danger, #ef4444); color: #fff; font-size: 10px;
        font-weight: 700; min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center;
        justify-content: center; padding: 0 4px; border: 2px solid var(--theme-bell-badge-border, #0f172a); line-height: 1;
      }
      .notif-dropdown {
        position: absolute; top: 100%; right: 0; margin-top: 8px; width: 380px; max-height: 480px;
        background: var(--theme-dropdown-bg, #1e293b); border: 1px solid var(--theme-dropdown-border, rgba(255,255,255,0.1)); border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5); z-index: 9999; overflow: hidden;
      }
      .notif-dropdown-header {
        display: flex; justify-content: space-between; align-items: center; padding: 14px 16px;
        border-bottom: 1px solid var(--theme-border-light, rgba(255,255,255,0.08)); font-size: 14px; font-weight: 600; color: var(--theme-text-heading, #f1f5f9);
      }
      .notif-mark-all {
        background: none; border: none; color: var(--theme-primary, #c8963e); cursor: pointer; font-size: 11px;
        display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px;
      }
      .notif-mark-all:hover { background: var(--theme-primary-dim, rgba(200,150,62,0.15)); }
      .notif-list { max-height: 360px; overflow-y: auto; }
      .notif-item {
        padding: 12px 16px; border-bottom: 1px solid var(--theme-border-light, rgba(255,255,255,0.05)); cursor: pointer;
        transition: background 0.15s; display: flex; gap: 10px;
      }
      .notif-item:hover { background: var(--theme-sidebar-hover-bg, rgba(255,255,255,0.05)); }
      .notif-item.unread { background: var(--theme-primary-dim, rgba(200,150,62,0.06)); border-left: 3px solid var(--theme-primary, #c8963e); }
      .notif-item.unread .notif-title { color: var(--theme-text-heading, #f1f5f9); }
      .notif-icon {
        width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; font-size: 14px;
      }
      .notif-icon.load { background: var(--theme-info-bg, rgba(59,130,246,0.15)); color: var(--theme-info, #3b82f6); }
      .notif-icon.payment { background: var(--theme-success-bg, rgba(34,197,94,0.15)); color: var(--theme-success, #22c55e); }
      .notif-icon.alert { background: var(--theme-danger-bg, rgba(239,68,68,0.15)); color: var(--theme-danger, #ef4444); }
      .notif-icon.general { background: var(--theme-primary-dim, rgba(200,150,62,0.15)); color: var(--theme-primary, #c8963e); }
      .notif-content { flex: 1; min-width: 0; }
      .notif-title { font-size: 13px; font-weight: 500; color: var(--theme-text-muted, #94a3b8); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .notif-msg { font-size: 12px; color: var(--theme-text-secondary, #64748b); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .notif-time { font-size: 10px; color: var(--theme-text-secondary, #475569); margin-top: 4px; }
      .notif-empty { padding: 40px 16px; text-align: center; color: var(--theme-text-secondary, #64748b); font-size: 13px; }
      .notif-dropdown-footer {
        padding: 10px 16px; border-top: 1px solid var(--theme-border-light, rgba(255,255,255,0.08)); text-align: center;
      }
      .notif-see-all { color: var(--theme-primary, #c8963e); text-decoration: none; font-size: 12px; font-weight: 500; }
      .notif-see-all:hover { text-decoration: underline; }
      @media (max-width: 640px) { .notif-dropdown { width: calc(100vw - 32px); right: -60px; } }
    `;
    document.head.appendChild(style);
  }

  // ── Notification type → icon mapping ──
  function getIconClass(type) {
    if (type.includes("LOAD") || type.includes("CHECK") || type.includes("POD")) return "load";
    if (type.includes("PAYMENT") || type.includes("INVOICE") || type.includes("FUND")) return "payment";
    if (type.includes("ERROR") || type.includes("ALERT") || type.includes("CREDIT") || type.includes("DISPUTE")) return "alert";
    return "general";
  }

  function getIconEmoji(type) {
    if (type.includes("LOAD")) return "🚛";
    if (type.includes("PAYMENT") || type.includes("INVOICE")) return "💰";
    if (type.includes("ERROR") || type.includes("SYSTEM")) return "⚠️";
    if (type.includes("CREDIT")) return "💳";
    if (type.includes("CPP")) return "⭐";
    if (type.includes("POD")) return "📋";
    if (type.includes("FUND")) return "🏦";
    return "🔔";
  }

  function timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  // ── State ──
  let notifications = [];
  let unreadCount = 0;
  let isOpen = false;
  let pollInterval = null;

  async function fetchNotifications() {
    const data = await apiFetch("/notifications");
    if (!data) return;
    notifications = Array.isArray(data) ? data : data.notifications || [];

    const countData = await apiFetch("/notifications/unread-count");
    unreadCount = countData?.count ?? notifications.filter((n) => !n.read && !n.readAt).length;

    renderBadge();
    if (isOpen) renderList();
  }

  function renderBadge() {
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    if (unreadCount > 0) {
      badge.style.display = "flex";
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    } else {
      badge.style.display = "none";
    }
  }

  function renderList() {
    const list = document.getElementById("notif-list");
    if (!list) return;

    if (notifications.length === 0) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }

    list.innerHTML = notifications.slice(0, 20).map((n) => {
      const isUnread = !n.read && !n.readAt;
      const iconClass = getIconClass(n.type || "");
      const emoji = getIconEmoji(n.type || "");
      return `
        <div class="notif-item ${isUnread ? "unread" : ""}" data-id="${n.id}" data-url="${n.actionUrl || n.link || ""}">
          <div class="notif-icon ${iconClass}">${emoji}</div>
          <div class="notif-content">
            <div class="notif-title">${escapeHtml(n.title || "Notification")}</div>
            <div class="notif-msg">${escapeHtml(n.message || "")}</div>
            <div class="notif-time">${timeAgo(n.createdAt)}</div>
          </div>
        </div>
      `;
    }).join("");

    // Click handlers
    list.querySelectorAll(".notif-item").forEach((el) => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        const url = el.getAttribute("data-url");
        if (id) {
          await apiPatch(`/notifications/${id}/read`);
          el.classList.remove("unread");
          unreadCount = Math.max(0, unreadCount - 1);
          renderBadge();
        }
        if (url) window.location.href = url;
      });
    });
  }

  async function markAllRead() {
    await apiPatch("/notifications/read-all");
    unreadCount = 0;
    notifications.forEach((n) => { n.read = true; n.readAt = new Date().toISOString(); });
    renderBadge();
    renderList();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──
  function init() {
    if (!getToken()) return; // Not logged in
    injectStyles();

    // Find header to inject into
    const header = document.querySelector(".main-header") || document.querySelector(".page-header");
    if (!header) return;

    // Make header flex if not already
    const headerStyle = window.getComputedStyle(header);
    if (headerStyle.display !== "flex") {
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.flexWrap = "wrap";
    }

    // Inject bell
    const bellContainer = document.createElement("div");
    bellContainer.innerHTML = createBellHTML();
    header.appendChild(bellContainer.firstElementChild);

    // Toggle dropdown
    document.getElementById("notif-bell-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      document.getElementById("notif-dropdown").style.display = isOpen ? "block" : "none";
      if (isOpen) renderList();
    });

    // Mark all read
    document.getElementById("notif-mark-all").addEventListener("click", (e) => {
      e.stopPropagation();
      markAllRead();
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      const wrapper = document.getElementById("notif-bell-wrapper");
      if (wrapper && !wrapper.contains(e.target)) {
        isOpen = false;
        document.getElementById("notif-dropdown").style.display = "none";
      }
    });

    // Initial fetch + poll every 60s
    fetchNotifications();
    pollInterval = setInterval(fetchNotifications, 60000);
  }

  // Auto-init on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
