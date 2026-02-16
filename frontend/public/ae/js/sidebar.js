/* ========================================
   SRL Sidebar — Collapse / Expand + Tooltips
   ======================================== */
(function () {
  var STORAGE_KEY = "srl_sidebar_collapsed";
  var sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  // Add data-tooltip to all nav links (text content)
  sidebar.querySelectorAll(".sidebar-nav a").forEach(function (a) {
    // Wrap the text node in a <span> if not already wrapped
    var text = a.textContent.trim();
    a.setAttribute("data-tooltip", text);
    // Wrap link text in span for hide/show
    var svg = a.querySelector("svg");
    if (svg && !a.querySelector("span")) {
      var span = document.createElement("span");
      span.textContent = text.replace(svg.textContent, "").trim();
      // Remove text nodes
      Array.from(a.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && n.textContent.trim()) a.removeChild(n);
      });
      a.appendChild(span);
    }
  });

  // Create toggle button
  var toggleBtn = document.createElement("button");
  toggleBtn.className = "sidebar-toggle";
  toggleBtn.id = "sidebar-toggle";
  toggleBtn.title = "Collapse sidebar";
  toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/></svg>';
  toggleBtn.addEventListener("click", function () {
    toggleCollapse();
  });
  sidebar.appendChild(toggleBtn);

  // Restore state
  var saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "1") {
    collapse(false);
  }

  function toggleCollapse() {
    if (sidebar.classList.contains("collapsed")) {
      expand(true);
    } else {
      collapse(true);
    }
  }

  function collapse(animate) {
    sidebar.classList.add("collapsed");
    document.querySelector(".page").classList.add("sidebar-collapsed");
    toggleBtn.title = "Expand sidebar";
    localStorage.setItem(STORAGE_KEY, "1");
  }

  function expand(animate) {
    sidebar.classList.remove("collapsed");
    document.querySelector(".page").classList.remove("sidebar-collapsed");
    toggleBtn.title = "Collapse sidebar";
    localStorage.setItem(STORAGE_KEY, "0");
  }

  // Also handle hamburger toggle for mobile
  window.toggleSidebar = function () {
    sidebar.classList.toggle("open");
    var overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.toggle("open");
  };
})();
