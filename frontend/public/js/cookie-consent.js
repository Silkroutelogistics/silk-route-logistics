/**
 * SRL Cookie Consent Banner
 * Lightweight, non-intrusive cookie consent that complies with GDPR/CCPA.
 * Shows once per browser — stores consent in localStorage.
 */
(function() {
  var CONSENT_KEY = "srl_cookie_consent";

  // Already accepted
  if (localStorage.getItem(CONSENT_KEY)) return;

  // Build banner
  var banner = document.createElement("div");
  banner.id = "srl-cookie-banner";
  banner.setAttribute("role", "alert");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">' +
      '<p style="margin:0;font-size:13px;color:#c8d4de;line-height:1.6;flex:1;min-width:200px">' +
        'We use essential cookies to keep you logged in and ensure our platform works properly. ' +
        '<a href="/privacy.html" style="color:#c8a951;text-decoration:underline">Privacy Policy</a>' +
      '</p>' +
      '<div style="display:flex;gap:8px;flex-shrink:0">' +
        '<button id="srl-cookie-accept" style="padding:8px 20px;font-size:12px;font-weight:600;background:linear-gradient(135deg,#c8a951,#b8963e);color:#0D1B2A;border:none;border-radius:6px;cursor:pointer;font-family:inherit;transition:opacity .2s">Accept</button>' +
        '<button id="srl-cookie-dismiss" style="padding:8px 16px;font-size:12px;font-weight:500;background:transparent;color:#6a8090;border:1px solid #243447;border-radius:6px;cursor:pointer;font-family:inherit;transition:opacity .2s">Dismiss</button>' +
      '</div>' +
    '</div>';

  // Style the banner
  var s = banner.style;
  s.position = "fixed";
  s.bottom = "0";
  s.left = "0";
  s.right = "0";
  s.zIndex = "99998";
  s.padding = "16px 24px";
  s.background = "rgba(10,22,40,0.97)";
  s.borderTop = "1px solid rgba(200,150,62,0.15)";
  s.backdropFilter = "blur(10px)";
  s.fontFamily = "'Inter','Plus Jakarta Sans',system-ui,sans-serif";
  s.transform = "translateY(100%)";
  s.transition = "transform 0.4s ease";

  document.body.appendChild(banner);

  // Animate in after short delay
  setTimeout(function() { banner.style.transform = "translateY(0)"; }, 800);

  function dismiss(accepted) {
    localStorage.setItem(CONSENT_KEY, accepted ? "accepted" : "dismissed");
    banner.style.transform = "translateY(100%)";
    setTimeout(function() { banner.remove(); }, 500);
  }

  document.getElementById("srl-cookie-accept").onclick = function() { dismiss(true); };
  document.getElementById("srl-cookie-dismiss").onclick = function() { dismiss(false); };
})();
