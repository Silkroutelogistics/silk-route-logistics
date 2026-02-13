/* ================================================================
   Marco Polo -- SRL AI Chat Widget
   Self-contained IIFE exposing window.MarcoPolo
   Works on console pages (authenticated) and public website
   ================================================================ */
var MarcoPolo = (function () {
  "use strict";

  /* ─── State ───────────────────────────────────────────────── */
  var _state = {
    open: false,
    loaded: false,
    sending: false,
    messages: [],
    conversationId: null,
    console: "public",
    unreadCount: 0,
    proactiveShown: false,
    lastRetryText: ""
  };

  var _els = {};

  /* ─── SVG Icons ───────────────────────────────────────────── */
  var ICONS = {
    compass:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="12" cy="12" r="10"/>' +
        '<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>' +
      '</svg>',
    compassSmall:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="12" cy="12" r="10"/>' +
        '<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>' +
      '</svg>',
    send:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="22" y1="2" x2="11" y2="13"/>' +
        '<polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
      '</svg>',
    plus:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="12" y1="5" x2="12" y2="19"/>' +
        '<line x1="5" y1="12" x2="19" y2="12"/>' +
      '</svg>',
    minus:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="5" y1="12" x2="19" y2="12"/>' +
      '</svg>',
    close:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="18" y1="6" x2="6" y2="18"/>' +
        '<line x1="6" y1="6" x2="18" y2="18"/>' +
      '</svg>',
    chat:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor"/>' +
      '</svg>'
  };

  /* ─── Welcome Messages ────────────────────────────────────── */
  var _welcomeMessages = {
    ae: function (name) {
      var n = name ? "Hi " + escapeHtml(name) + "!" : "Hi there!";
      return n + " I'm Marco Polo, your SRL assistant. I can help with loads, carriers, analytics, compliance \u2014 just ask! What can I help you with?";
    },
    carrier: function (name) {
      var n = name ? "Welcome back, " + escapeHtml(name) + "!" : "Welcome back!";
      return n + " I'm Marco Polo. I can help you find loads, check payments, review your SRCPP score, and navigate the carrier portal. What do you need?";
    },
    accounting: function (name) {
      var n = name ? "Good day, " + escapeHtml(name) + "!" : "Good day!";
      return n + " I'm Marco Polo, your accounting assistant. I can pull up financial reports, check AR/AP status, review fund balances, and help with accounting operations. How can I assist?";
    },
    public: function () {
      return "Welcome to Silk Route Logistics! I'm Marco Polo. I can help you learn about our services, get a freight quote, or guide you through carrier registration. How can I help?";
    }
  };

  /* ─── Proactive Messages ──────────────────────────────────── */
  var _proactiveMessages = {
    ae: function () {
      var hour = new Date().getHours();
      var greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      return greeting + "! I can help you manage your loads today.";
    },
    carrier: function () {
      return "Welcome back! Check your loads and payments.";
    },
    accounting: function () {
      var hour = new Date().getHours();
      var greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      return greeting + "! Need a fund status overview or payment review?";
    },
    public: function () {
      return "Need a freight quote or want to learn about our services?";
    }
  };

  /* ─── Configuration Detection ─────────────────────────────── */
  function detectConsole() {
    var path = window.location.pathname;
    if (path.indexOf("/carrier/") !== -1) return "carrier";
    if (path.indexOf("/ae/accounting/") !== -1) return "accounting";
    if (path.indexOf("/ae/") !== -1) return "ae";
    return "public";
  }

  function getApiBase() {
    if (window.SRL && window.SRL.BASE) return window.SRL.BASE;
    if (window.CARRIER && window.CARRIER.BASE) return window.CARRIER.BASE;
    return (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:4000"
      : "https://silk-route-logistics.onrender.com";
  }

  function getToken() {
    return localStorage.getItem("srl_token")
      || localStorage.getItem("carrier_token")
      || localStorage.getItem("token")
      || "";
  }

  function getUserRole() {
    try {
      var token = getToken();
      if (!token) return "public";
      var payload = JSON.parse(atob(token.split(".")[1]));
      return payload.role || "public";
    } catch (e) {
      return "public";
    }
  }

  function getUserId() {
    try {
      var token = getToken();
      if (!token) return "";
      var payload = JSON.parse(atob(token.split(".")[1]));
      return payload.userId || payload.id || "";
    } catch (e) {
      return "";
    }
  }

  function getUserName() {
    try {
      var token = getToken();
      if (!token) return "";
      var payload = JSON.parse(atob(token.split(".")[1]));
      return payload.name || payload.firstName || "";
    } catch (e) {
      return "";
    }
  }

  /* ─── Utilities ───────────────────────────────────────────── */
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function storageKey() {
    return "mp_chat_" + _state.console + "_history";
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    var mStr = m < 10 ? "0" + m : "" + m;
    var time = h + ":" + mStr + " " + ampm;

    // Same day
    if (d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()) {
      return time;
    }

    // Yesterday
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear()) {
      return "Yesterday " + time;
    }

    // Older
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + time;
  }

  function formatAssistantText(text) {
    // Bold: **text** -> <strong>
    var formatted = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic: *text* (not preceded/followed by another *)
    formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    // Inline code: `text` -> <code>
    formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Convert bullet lists (lines starting with - or bullet char)
    var lines = formatted.split("\n");
    var result = [];
    var inList = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var bulletMatch = line.match(/^\s*[-\u2022]\s+(.*)$/);
      if (bulletMatch) {
        if (!inList) {
          result.push("<ul>");
          inList = true;
        }
        result.push("<li>" + bulletMatch[1] + "</li>");
      } else {
        if (inList) {
          result.push("</ul>");
          inList = false;
        }
        if (line.trim()) {
          result.push(line);
        } else {
          result.push("<br>");
        }
      }
    }
    if (inList) result.push("</ul>");
    return result.join("\n");
  }

  /* ─── Storage ─────────────────────────────────────────────── */
  function saveMessages() {
    try {
      var toSave = _state.messages.slice(-100);
      localStorage.setItem(storageKey(), JSON.stringify(toSave));
    } catch (e) {
      // localStorage full or unavailable
    }
  }

  function loadMessages() {
    try {
      var raw = localStorage.getItem(storageKey());
      if (raw) {
        _state.messages = JSON.parse(raw);
        return true;
      }
    } catch (e) {
      // Corrupt data
    }
    _state.messages = [];
    return false;
  }

  function getRecentHistory(n) {
    var msgs = [];
    var start = Math.max(0, _state.messages.length - n);
    for (var i = start; i < _state.messages.length; i++) {
      msgs.push({
        role: _state.messages[i].role,
        content: _state.messages[i].content
      });
    }
    return msgs;
  }

  /* ─── DOM Creation ────────────────────────────────────────── */
  function injectHTML() {
    // Floating bubble
    var bubble = document.createElement("div");
    bubble.id = "mp-bubble";
    bubble.className = "mp-bubble";
    bubble.setAttribute("aria-label", "Open Marco Polo chat");
    bubble.setAttribute("role", "button");
    bubble.setAttribute("tabindex", "0");
    bubble.innerHTML =
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" fill="currentColor"/>' +
        '<path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" fill="currentColor"/>' +
      '</svg>' +
      '<span id="mp-badge" class="mp-badge" style="display:none">0</span>';
    document.body.appendChild(bubble);

    // Proactive tooltip
    var proactive = document.createElement("div");
    proactive.id = "mp-proactive";
    proactive.className = "mp-proactive";
    proactive.innerHTML =
      '<span id="mp-proactive-text"></span>' +
      '<button class="mp-proactive-close" aria-label="Dismiss">\u00d7</button>';
    document.body.appendChild(proactive);

    // Chat panel
    var panel = document.createElement("div");
    panel.id = "mp-panel";
    panel.className = "mp-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Marco Polo AI Assistant");
    panel.innerHTML =
      // Header
      '<div class="mp-header">' +
        '<div class="mp-header-left">' +
          '<span class="mp-header-icon">' + ICONS.compass + '</span>' +
          '<div>' +
            '<div class="mp-header-title">Marco Polo</div>' +
            '<div class="mp-header-status">SRL AI Assistant</div>' +
          '</div>' +
        '</div>' +
        '<div class="mp-header-actions">' +
          '<button id="mp-new-btn" class="mp-header-btn" title="New conversation">' + ICONS.plus + '</button>' +
          '<button id="mp-min-btn" class="mp-header-btn" title="Minimize">' + ICONS.minus + '</button>' +
          '<button id="mp-close-btn" class="mp-header-btn" title="Close">' + ICONS.close + '</button>' +
        '</div>' +
      '</div>' +
      // Messages area
      '<div id="mp-messages" class="mp-messages"></div>' +
      // Input area
      '<div class="mp-input-area">' +
        '<textarea id="mp-input" class="mp-input" placeholder="Ask Marco Polo..." rows="1"></textarea>' +
        '<button id="mp-send-btn" class="mp-send-btn" disabled aria-label="Send message">' + ICONS.send + '</button>' +
      '</div>';
    document.body.appendChild(panel);

    // Cache DOM refs
    _els.bubble = document.getElementById("mp-bubble");
    _els.badge = document.getElementById("mp-badge");
    _els.panel = document.getElementById("mp-panel");
    _els.messages = document.getElementById("mp-messages");
    _els.input = document.getElementById("mp-input");
    _els.sendBtn = document.getElementById("mp-send-btn");
    _els.closeBtn = document.getElementById("mp-close-btn");
    _els.minBtn = document.getElementById("mp-min-btn");
    _els.newBtn = document.getElementById("mp-new-btn");
    _els.proactive = document.getElementById("mp-proactive");
    _els.proactiveText = document.getElementById("mp-proactive-text");
    _els.proactiveClose = proactive.querySelector(".mp-proactive-close");
  }

  /* ─── Event Binding ───────────────────────────────────────── */
  function bindEvents() {
    // Bubble click
    _els.bubble.addEventListener("click", function () {
      open();
    });
    _els.bubble.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    // Header buttons
    _els.closeBtn.addEventListener("click", function () { close(); });
    _els.minBtn.addEventListener("click", function () { minimize(); });
    _els.newBtn.addEventListener("click", function () { newConversation(); });

    // Send button
    _els.sendBtn.addEventListener("click", function () { trySend(); });

    // Input: enable/disable send + auto-resize
    _els.input.addEventListener("input", function () {
      _els.sendBtn.disabled = !_els.input.value.trim();
      autoResizeInput();
    });

    // Keyboard: Enter to send, Shift+Enter for newline, Escape to minimize
    _els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        trySend();
      }
      if (e.key === "Escape") {
        minimize();
      }
    });

    // Global Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && _state.open) {
        minimize();
      }
    });

    // Proactive: click opens chat, close button dismisses
    _els.proactiveClose.addEventListener("click", function (e) {
      e.stopPropagation();
      hideProactive();
    });

    _els.proactive.addEventListener("click", function () {
      var msg = _els.proactiveText.textContent || "";
      hideProactive();
      open();
      if (msg) {
        _els.input.value = msg;
        _els.sendBtn.disabled = false;
        autoResizeInput();
      }
    });
  }

  /* ─── Auto-resize Textarea ────────────────────────────────── */
  function autoResizeInput() {
    _els.input.style.height = "auto";
    var scrollH = _els.input.scrollHeight;
    _els.input.style.height = Math.min(scrollH, 80) + "px";
  }

  /* ─── Scroll to Bottom ────────────────────────────────────── */
  function scrollToBottom() {
    if (_els.messages) {
      setTimeout(function () {
        _els.messages.scrollTop = _els.messages.scrollHeight;
      }, 50);
    }
  }

  /* ─── Badge Management ────────────────────────────────────── */
  function updateBadge() {
    if (_state.unreadCount > 0 && !_state.open) {
      _els.badge.textContent = _state.unreadCount > 99 ? "99+" : _state.unreadCount;
      _els.badge.style.display = "";
      _els.bubble.classList.add("mp-pulse");
    } else {
      _els.badge.style.display = "none";
      _els.badge.textContent = "0";
      _els.bubble.classList.remove("mp-pulse");
    }
  }

  /* ─── Open Panel ──────────────────────────────────────────── */
  function open() {
    _state.open = true;
    _els.panel.classList.add("mp-open");
    _els.bubble.classList.add("mp-hidden");
    hideProactive();

    // Clear unread
    _state.unreadCount = 0;
    updateBadge();

    // Load history on first open
    if (!_state.loaded) {
      _state.loaded = true;
      loadHistory();
    }

    // Focus input after transition
    setTimeout(function () {
      _els.input.focus();
    }, 350);

    scrollToBottom();
  }

  /* ─── Close Panel (full close) ────────────────────────────── */
  function close() {
    _state.open = false;
    _els.panel.classList.remove("mp-open");
    _els.bubble.classList.remove("mp-hidden");
    updateBadge();
  }

  /* ─── Minimize (same as close, bubble stays) ──────────────── */
  function minimize() {
    close();
  }

  /* ─── Load History ────────────────────────────────────────── */
  function loadHistory() {
    // Load from localStorage as instant cache
    var hasLocal = loadMessages();
    _els.messages.innerHTML = "";

    if (hasLocal && _state.messages.length > 0) {
      renderAllMessages();
    } else {
      renderWelcome();
    }

    // If authenticated, also fetch from server
    var token = getToken();
    var con = _state.console;
    if (token && con !== "public") {
      fetch(getApiBase() + "/api/chat/history", {
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        }
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data.messages && data.messages.length > 0) {
            _state.messages = data.messages;
            if (data.conversationId) {
              _state.conversationId = data.conversationId;
            }
            saveMessages();
            _els.messages.innerHTML = "";
            renderAllMessages();
          }
        })
        .catch(function () {
          // Silently use local cache
        });
    }
  }

  /* ─── Render All Messages ─────────────────────────────────── */
  function renderAllMessages() {
    for (var i = 0; i < _state.messages.length; i++) {
      renderMessageDOM(_state.messages[i], false);
    }
    scrollToBottom();
  }

  /* ─── Render Welcome ──────────────────────────────────────── */
  function renderWelcome() {
    var name = getUserName();
    var con = _state.console;
    var fn = _welcomeMessages[con] || _welcomeMessages.ae;
    var welcomeText = fn(name);

    // Welcome card
    var welcome = document.createElement("div");
    welcome.className = "mp-welcome";
    welcome.innerHTML =
      '<div class="mp-welcome-icon">' + ICONS.compass + '</div>' +
      '<div class="mp-welcome-title">Marco Polo</div>' +
      '<div class="mp-welcome-text">' + welcomeText + '</div>';
    _els.messages.appendChild(welcome);
    scrollToBottom();
  }

  /* ─── Render Single Message (DOM only) ────────────────────── */
  function renderMessageDOM(msg, animate) {
    var wrap = document.createElement("div");
    wrap.className = "mp-msg mp-msg-" + msg.role;

    if (msg.role === "user") {
      wrap.innerHTML =
        '<div class="mp-bubble-text">' + escapeHtml(msg.content) + '</div>' +
        '<div class="mp-msg-time">' + formatTime(msg.timestamp) + '</div>';
    } else {
      wrap.innerHTML =
        '<div class="mp-msg-row">' +
          '<div class="mp-msg-avatar">' + ICONS.compassSmall + '</div>' +
          '<div class="mp-bubble-text">' + formatAssistantText(msg.content) + '</div>' +
        '</div>' +
        '<div class="mp-msg-time">' + formatTime(msg.timestamp) + '</div>';
    }

    _els.messages.appendChild(wrap);

    // Render quick actions if present
    if (msg.actions && msg.actions.length > 0) {
      renderActionsDOM(msg.actions);
    }

    if (animate !== false) {
      scrollToBottom();
    }

    return wrap;
  }

  /* ─── Add Messages (with state tracking) ──────────────────── */
  function addUserMessage(text) {
    var msg = { role: "user", content: text, timestamp: Date.now(), actions: null };
    _state.messages.push(msg);
    saveMessages();
    renderMessageDOM(msg, true);
  }

  function addAssistantMessage(text, actions) {
    var msg = { role: "assistant", content: text, timestamp: Date.now(), actions: actions || null };
    _state.messages.push(msg);
    saveMessages();
    renderMessageDOM(msg, true);
    return msg;
  }

  /* ─── Render Quick Actions ────────────────────────────────── */
  function renderActionsDOM(actions) {
    var container = document.createElement("div");
    container.className = "mp-actions";

    for (var i = 0; i < actions.length; i++) {
      (function (action) {
        var btn = document.createElement("button");
        btn.className = "mp-action-btn";
        btn.textContent = action.label;
        btn.addEventListener("click", function () {
          handleAction(action);
          // Remove action buttons after click
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
        });
        container.appendChild(btn);
      })(actions[i]);
    }

    _els.messages.appendChild(container);
    scrollToBottom();
  }

  function renderActions(actions) {
    if (actions && actions.length > 0) {
      renderActionsDOM(actions);
    }
  }

  function handleAction(action) {
    if (!action) return;
    switch (action.type) {
      case "navigate":
        if (action.url) window.location.href = action.url;
        break;
      case "api":
        if (action.action) sendMessage(action.action);
        break;
      case "export":
        if (window.SRLAnalytics && typeof window.SRLAnalytics.exportCSV === "function") {
          window.SRLAnalytics.exportCSV();
        }
        break;
      default:
        // Legacy: url-only or action-only
        if (action.url) {
          window.location.href = action.url;
        } else if (action.action) {
          _els.input.value = action.action;
          trySend();
        }
    }
  }

  /* ─── Typing Indicator ────────────────────────────────────── */
  function showTyping() {
    removeTyping();
    var wrap = document.createElement("div");
    wrap.className = "mp-msg mp-msg-assistant";
    wrap.id = "mp-typing";
    wrap.innerHTML =
      '<div class="mp-typing-wrap">' +
        '<div class="mp-msg-avatar">' + ICONS.compassSmall + '</div>' +
        '<div class="mp-typing-dots">' +
          '<span class="mp-typing-dot"></span>' +
          '<span class="mp-typing-dot"></span>' +
          '<span class="mp-typing-dot"></span>' +
        '</div>' +
      '</div>';
    _els.messages.appendChild(wrap);
    scrollToBottom();
  }

  function removeTyping() {
    var el = document.getElementById("mp-typing");
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  /* ─── Send Message ────────────────────────────────────────── */
  function trySend() {
    var text = (_els.input.value || "").trim();
    if (!text || _state.sending) return;
    sendMessage(text);
  }

  function sendMessage(text) {
    _state.sending = true;
    _els.sendBtn.disabled = true;
    _els.input.value = "";
    _els.input.style.height = "auto";
    _state.lastRetryText = text;

    // Render user message immediately
    addUserMessage(text);
    showTyping();

    // Build request
    var token = getToken();
    var isPublic = !token || _state.console === "public";
    var base = getApiBase();
    var url = isPublic ? base + "/api/chat/public" : base + "/api/chat";

    var body = {
      message: text,
      context: {
        console: _state.console,
        current_page: window.location.pathname,
        user_role: getUserRole(),
        user_id: getUserId()
      },
      history: getRecentHistory(10)
    };

    if (_state.conversationId) {
      body.conversationId = _state.conversationId;
    }

    var headers = { "Content-Type": "application/json" };
    if (!isPublic) {
      headers["Authorization"] = "Bearer " + token;
    }

    fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        removeTyping();
        var reply = data.message || data.reply || data.response || "I received your message.";
        var actions = data.actions || null;

        addAssistantMessage(reply, actions);

        if (data.conversationId) {
          _state.conversationId = data.conversationId;
        }

        _state.sending = false;
        _els.sendBtn.disabled = !_els.input.value.trim();
        _els.input.focus();

        // Increment unread if panel is not open
        if (!_state.open) {
          _state.unreadCount++;
          updateBadge();
        }
      })
      .catch(function (err) {
        removeTyping();
        showError(err);
        _state.sending = false;
        _els.sendBtn.disabled = !_els.input.value.trim();
        _els.input.focus();
      });
  }

  /* ─── Error Display ───────────────────────────────────────── */
  function showError(err) {
    var errMsg = (err && err.message && err.message.indexOf("HTTP") !== -1)
      ? "I'm having trouble connecting right now. Please try again in a moment."
      : "Marco Polo is being configured. Please check back soon!";

    var wrap = document.createElement("div");
    wrap.className = "mp-msg mp-msg-assistant";
    wrap.innerHTML =
      '<div class="mp-msg-row">' +
        '<div class="mp-msg-avatar">' + ICONS.compassSmall + '</div>' +
        '<div class="mp-bubble-text">' +
          '<div class="mp-error-wrap">' +
            '<div class="mp-error-text">' + escapeHtml(errMsg) + '</div>' +
            '<button class="mp-retry-btn">Retry</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    _els.messages.appendChild(wrap);
    scrollToBottom();

    var retryBtn = wrap.querySelector(".mp-retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        if (_state.lastRetryText) {
          sendMessage(_state.lastRetryText);
        }
      });
    }

    if (typeof console !== "undefined" && console.error) {
      console.error("[MarcoPolo] Error:", err);
    }
  }

  /* ─── New Conversation ────────────────────────────────────── */
  function newConversation() {
    _state.messages = [];
    _state.conversationId = null;
    _state.lastRetryText = "";
    saveMessages();
    _els.messages.innerHTML = "";
    renderWelcome();

    // Notify backend
    var token = getToken();
    if (token && _state.console !== "public") {
      fetch(getApiBase() + "/api/chat/new-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ console: _state.console })
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data.conversationId) {
            _state.conversationId = data.conversationId;
          }
        })
        .catch(function () {
          // Non-critical, new conversation is local-first
        });
    }
  }

  /* ─── Proactive Suggestions ───────────────────────────────── */
  function triggerProactive() {
    var sessionKey = "mp_proactive_shown_" + _state.console;
    if (sessionStorage.getItem(sessionKey)) return;
    if (_state.proactiveShown) return;

    sessionStorage.setItem(sessionKey, "1");
    _state.proactiveShown = true;

    var fn = _proactiveMessages[_state.console] || _proactiveMessages.public;
    var message = fn();

    setTimeout(function () {
      if (!_state.open) {
        showProactiveSuggestion(message);
      }
    }, 3000);
  }

  function showProactiveSuggestion(message) {
    // Show badge
    _state.unreadCount = 1;
    updateBadge();

    // Show tooltip
    _els.proactiveText.textContent = message;
    _els.proactive.classList.add("mp-show");

    // Auto-dismiss after 8 seconds
    setTimeout(function () {
      hideProactive();
    }, 8000);
  }

  function hideProactive() {
    _els.proactive.classList.remove("mp-show");
  }

  /* ─── Init ────────────────────────────────────────────────── */
  function init(config) {
    // Auto-detect console
    _state.console = detectConsole();

    // Allow manual config override
    if (config) {
      if (config.console) _state.console = config.console;
    }

    // Wait for DOM ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        bootstrap();
      });
    } else {
      bootstrap();
    }
  }

  function bootstrap() {
    injectHTML();
    bindEvents();
    triggerProactive();
  }

  /* ─── Public API ──────────────────────────────────────────── */
  return {
    init: init,
    open: open,
    close: close,
    minimize: minimize,
    sendMessage: sendMessage,
    loadHistory: loadHistory,
    newConversation: newConversation,
    renderActions: renderActions,
    showProactiveSuggestion: showProactiveSuggestion
  };

})();

// Auto-initialize on load
MarcoPolo.init();
