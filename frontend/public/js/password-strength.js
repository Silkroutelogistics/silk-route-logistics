/**
 * SRL Password Strength Meter
 * Client-side password validation matching backend policy
 * Usage: SRLPassword.attachMeter(inputElement, meterContainerElement)
 */
var SRLPassword = (function () {
  "use strict";

  var COMMON = ["password","123456","12345678","qwerty","abc123","letmein","dragon","master",
    "iloveyou","password1","password123","admin","welcome","welcome1","trustno1",
    "sunshine","baseball","football","superman","batman","shadow","123123","654321",
    "qazwsx","passw0rd","1234567890","qwerty123","nothing","changeme","default"];
  var commonSet = {};
  COMMON.forEach(function(p) { commonSet[p.toLowerCase()] = true; });

  function validate(pw) {
    var errors = [];
    if (pw.length < 10) errors.push("At least 10 characters");
    if (!/[A-Z]/.test(pw)) errors.push("One uppercase letter");
    if (!/[a-z]/.test(pw)) errors.push("One lowercase letter");
    if (!/[0-9]/.test(pw)) errors.push("One number");
    if (!/[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]/.test(pw)) errors.push("One special character");
    if (commonSet[pw.toLowerCase()]) errors.push("Password is too common");

    var score = 0;
    if (pw.length >= 10) score++;
    if (pw.length >= 14) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]/.test(pw)) score++;
    if (pw.length >= 18) score++;

    var strength = "weak";
    if (score >= 5) strength = "strong";
    else if (score >= 3) strength = "medium";

    return { valid: errors.length === 0, errors: errors, strength: strength, score: score };
  }

  function createMeterHTML() {
    return '<div class="srl-pw-meter" style="margin-top:8px">' +
      '<div style="display:flex;gap:4px;margin-bottom:4px">' +
        '<div class="srl-pw-bar" style="flex:1;height:3px;border-radius:2px;background:#1f3044;transition:background .3s"></div>' +
        '<div class="srl-pw-bar" style="flex:1;height:3px;border-radius:2px;background:#1f3044;transition:background .3s"></div>' +
        '<div class="srl-pw-bar" style="flex:1;height:3px;border-radius:2px;background:#1f3044;transition:background .3s"></div>' +
      '</div>' +
      '<div class="srl-pw-label" style="font-size:11px;color:#5a7a9a;transition:color .3s"></div>' +
      '<div class="srl-pw-errors" style="font-size:11px;color:#f87171;margin-top:4px;line-height:1.5"></div>' +
    '</div>';
  }

  function attachMeter(input, container) {
    if (!container) {
      container = document.createElement("div");
      input.parentNode.appendChild(container);
    }
    container.innerHTML = createMeterHTML();

    var bars = container.querySelectorAll(".srl-pw-bar");
    var label = container.querySelector(".srl-pw-label");
    var errorsEl = container.querySelector(".srl-pw-errors");

    var colors = { weak: "#ef4444", medium: "#eab308", strong: "#22c55e" };
    var labels = { weak: "Weak", medium: "Medium", strong: "Strong" };

    input.addEventListener("input", function () {
      var pw = input.value;
      if (!pw) {
        bars.forEach(function(b) { b.style.background = "#1f3044"; });
        label.textContent = "";
        errorsEl.textContent = "";
        return;
      }

      var result = validate(pw);
      var color = colors[result.strength];
      var fill = result.strength === "weak" ? 1 : result.strength === "medium" ? 2 : 3;

      bars.forEach(function(b, i) {
        b.style.background = i < fill ? color : "#1f3044";
      });

      label.textContent = labels[result.strength];
      label.style.color = color;
      errorsEl.innerHTML = result.errors.length > 0 && pw.length > 0
        ? "Needs: " + result.errors.join(", ")
        : "";
    });
  }

  return { validate: validate, attachMeter: attachMeter };
})();
