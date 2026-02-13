(function () {
  "use strict";

  /* ================================================================
     SRL Network Map — HTML5 Canvas animated coverage map
     Day/night cycle, traveling light routes, particle atmosphere
     ================================================================ */

  var canvas, ctx, W, H, dpr, offCanvas, offCtx;
  var animId = null;
  var lastFrame = 0;
  var FRAME_INTERVAL = 1000 / 30; // 30fps cap

  /* ─── Time of Day ──────────────────────────────────────────── */
  var TIME_DAWN = 0, TIME_DAY = 1, TIME_DUSK = 2, TIME_NIGHT = 3;
  var currentPeriod = TIME_DAY;
  var colorState = {};
  var colorTarget = {};
  var colorLerp = 1;

  function getTimePeriod() {
    var h = new Date().getHours();
    if (h >= 6 && h < 8) return TIME_DAWN;
    if (h >= 8 && h < 17) return TIME_DAY;
    if (h >= 17 && h < 20) return TIME_DUSK;
    return TIME_NIGHT;
  }

  var PALETTES = {};
  PALETTES[TIME_DAWN] = {
    bgTop: { r: 10, g: 22, b: 40 }, bgBot: { r: 26, g: 39, b: 68 },
    horizonGlow: { r: 80, g: 50, b: 30, a: 0.08 },
    landFill: 0.04, landStroke: 0.08,
    dotGlowMul: 1.0, routeOpMul: 1.0, particleOp: 0.1
  };
  PALETTES[TIME_DAY] = {
    bgTop: { r: 13, g: 27, b: 42 }, bgBot: { r: 27, g: 40, b: 56 },
    horizonGlow: { r: 40, g: 60, b: 90, a: 0.04 },
    landFill: 0.05, landStroke: 0.09,
    dotGlowMul: 0.85, routeOpMul: 0.9, particleOp: 0.07
  };
  PALETTES[TIME_DUSK] = {
    bgTop: { r: 13, g: 27, b: 42 }, bgBot: { r: 26, g: 22, b: 53 },
    horizonGlow: { r: 120, g: 70, b: 20, a: 0.1 },
    landFill: 0.04, landStroke: 0.08,
    dotGlowMul: 1.1, routeOpMul: 1.05, particleOp: 0.12
  };
  PALETTES[TIME_NIGHT] = {
    bgTop: { r: 5, g: 13, b: 26 }, bgBot: { r: 10, g: 22, b: 40 },
    horizonGlow: { r: 20, g: 15, b: 40, a: 0.05 },
    landFill: 0.03, landStroke: 0.07,
    dotGlowMul: 1.3, routeOpMul: 1.15, particleOp: 0.15
  };

  function lerpC(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: (a.a !== undefined ? a.a : 1) + ((b.a !== undefined ? b.a : 1) - (a.a !== undefined ? a.a : 1)) * t
    };
  }

  function lerpV(a, b, t) { return a + (b - a) * t; }

  function updatePalette() {
    var p = getTimePeriod();
    if (p !== currentPeriod) {
      currentPeriod = p;
      colorTarget = PALETTES[p];
      colorLerp = 0;
    }
    if (colorLerp < 1) {
      colorLerp = Math.min(1, colorLerp + 0.008); // ~2s transition at 30fps
      var t = colorLerp;
      var src = colorState;
      var tgt = colorTarget;
      colorState = {
        bgTop: lerpC(src.bgTop || tgt.bgTop, tgt.bgTop, t),
        bgBot: lerpC(src.bgBot || tgt.bgBot, tgt.bgBot, t),
        horizonGlow: lerpC(src.horizonGlow || tgt.horizonGlow, tgt.horizonGlow, t),
        landFill: lerpV(src.landFill !== undefined ? src.landFill : tgt.landFill, tgt.landFill, t),
        landStroke: lerpV(src.landStroke !== undefined ? src.landStroke : tgt.landStroke, tgt.landStroke, t),
        dotGlowMul: lerpV(src.dotGlowMul !== undefined ? src.dotGlowMul : tgt.dotGlowMul, tgt.dotGlowMul, t),
        routeOpMul: lerpV(src.routeOpMul !== undefined ? src.routeOpMul : tgt.routeOpMul, tgt.routeOpMul, t),
        particleOp: lerpV(src.particleOp !== undefined ? src.particleOp : tgt.particleOp, tgt.particleOp, t)
      };
    }
  }

  /* ─── Cities ───────────────────────────────────────────────── */
  var MAJOR = 1, SECONDARY = 2, TERTIARY = 3;
  var cities = [
    { id: "chicago", x: 580, y: 330, label: "CHICAGO", tier: MAJOR, lx: 0, ly: -16 },
    { id: "dallas", x: 480, y: 480, label: "DALLAS", tier: MAJOR, lx: 0, ly: -16 },
    { id: "atlanta", x: 680, y: 460, label: "ATLANTA", tier: MAJOR, lx: 0, ly: 20 },
    { id: "losangeles", x: 200, y: 440, label: "LOS ANGELES", tier: MAJOR, lx: -8, ly: 20 },
    { id: "newyork", x: 820, y: 310, label: "NEW YORK", tier: MAJOR, lx: 14, ly: -6 },
    { id: "toronto", x: 700, y: 270, label: "TORONTO", tier: MAJOR, lx: 14, ly: -6 },

    { id: "seattle", x: 180, y: 200, label: "SEATTLE", tier: SECONDARY, lx: 0, ly: -14 },
    { id: "denver", x: 370, y: 370, label: "DENVER", tier: SECONDARY, lx: 0, ly: 18 },
    { id: "houston", x: 490, y: 530, label: "HOUSTON", tier: SECONDARY, lx: 0, ly: 18 },
    { id: "miami", x: 760, y: 560, label: "MIAMI", tier: SECONDARY, lx: 14, ly: 4 },
    { id: "minneapolis", x: 500, y: 260, label: "MINNEAPOLIS", tier: SECONDARY, lx: 0, ly: -14 },
    { id: "detroit", x: 660, y: 300, label: "DETROIT", tier: SECONDARY, lx: 12, ly: -8 },
    { id: "boston", x: 850, y: 270, label: "BOSTON", tier: SECONDARY, lx: 12, ly: -4 },

    { id: "vancouver", x: 170, y: 170, label: "VANCOUVER", tier: TERTIARY, lx: 0, ly: -12 },
    { id: "calgary", x: 260, y: 150, label: "CALGARY", tier: TERTIARY, lx: 0, ly: -12 },
    { id: "montreal", x: 800, y: 230, label: "MONTREAL", tier: TERTIARY, lx: 12, ly: -4 },
    { id: "sanfrancisco", x: 150, y: 370, label: "SAN FRANCISCO", tier: TERTIARY, lx: -8, ly: 16 },
    { id: "phoenix", x: 280, y: 470, label: "PHOENIX", tier: TERTIARY, lx: 0, ly: 16 },
    { id: "philadelphia", x: 800, y: 330, label: "PHILADELPHIA", tier: TERTIARY, lx: 14, ly: 6 },
    { id: "mexicocity", x: 440, y: 620, label: "MEXICO CITY", tier: TERTIARY, lx: 0, ly: 16 },
    { id: "monterrey", x: 420, y: 570, label: "MONTERREY", tier: TERTIARY, lx: -60, ly: 4 },
    { id: "laredo", x: 440, y: 530, label: "LAREDO", tier: TERTIARY, lx: -40, ly: 4 }
  ];

  var cityMap = {};
  cities.forEach(function (c) { cityMap[c.id] = c; });

  /* ─── Routes ───────────────────────────────────────────────── */
  var routes = [
    // Major corridors
    { from: "chicago", to: "newyork", major: true },
    { from: "chicago", to: "dallas", major: true },
    { from: "chicago", to: "atlanta", major: true },
    { from: "chicago", to: "detroit", major: true },
    { from: "chicago", to: "minneapolis", major: true },
    { from: "losangeles", to: "dallas", major: true },
    { from: "losangeles", to: "phoenix", major: true },
    { from: "losangeles", to: "sanfrancisco", major: true },
    { from: "dallas", to: "houston", major: true },
    { from: "dallas", to: "atlanta", major: true },
    { from: "newyork", to: "boston", major: true },
    { from: "newyork", to: "philadelphia", major: true },
    { from: "atlanta", to: "miami", major: true },
    { from: "toronto", to: "montreal", major: true },
    { from: "toronto", to: "detroit", major: true },
    // Secondary
    { from: "seattle", to: "vancouver", major: false },
    { from: "seattle", to: "sanfrancisco", major: false },
    { from: "vancouver", to: "calgary", major: false },
    { from: "calgary", to: "minneapolis", major: false },
    { from: "denver", to: "chicago", major: false },
    { from: "denver", to: "losangeles", major: false },
    { from: "denver", to: "dallas", major: false },
    { from: "houston", to: "miami", major: false },
    { from: "houston", to: "laredo", major: false },
    { from: "laredo", to: "monterrey", major: false },
    { from: "monterrey", to: "mexicocity", major: false },
    { from: "boston", to: "montreal", major: false },
    { from: "philadelphia", to: "atlanta", major: false },
    { from: "phoenix", to: "dallas", major: false },
    { from: "minneapolis", to: "detroit", major: false }
  ];

  // Pre-compute bezier control points and animation state
  routes.forEach(function (r, i) {
    var a = cityMap[r.from], b = cityMap[r.to];
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / dist, ny = dx / dist;
    var off = (15 + Math.random() * 20) * (i % 2 === 0 ? 1 : -1);
    r.cx = mx + nx * off;
    r.cy = my + ny * off;
    // Traveling light
    r.lightT = Math.random(); // current position 0..1
    r.lightSpeed = 1 / (90 + Math.random() * 90); // 3-6 sec at 30fps
    r.lightActive = Math.random() < 0.35;
    r.lightDelay = 0;
    r.lightDir = 1;
    r.rotateTimer = Math.random() * 300; // frames until rotation check
  });

  /* ─── North America Outline ────────────────────────────────── */
  // Simplified but recognizable silhouette, normalized to 1000x650 canvas
  var continentPoints = [
    // Alaska-ish (top left) — skip, just start from BC coast
    [120, 120], [140, 100], [170, 85], [200, 75], [240, 70],
    // Northern Canada
    [300, 60], [370, 52], [430, 48], [500, 45], [570, 48],
    [640, 52], [700, 55], [750, 50], [790, 55], [830, 65],
    // Eastern Canada / Maritimes
    [860, 80], [880, 100], [870, 120], [855, 140], [870, 160],
    [890, 180], [880, 200],
    // Quebec / New England coast
    [870, 215], [860, 240], [850, 255], [860, 270], [855, 285],
    // US East Coast
    [840, 300], [830, 320], [820, 340], [815, 360], [810, 380],
    [800, 400], [790, 420], [770, 440],
    // Southeast coast
    [750, 455], [730, 465], [710, 475], [700, 480],
    // Florida
    [720, 490], [740, 510], [755, 540], [760, 565], [750, 580],
    [735, 570], [720, 555], [710, 540],
    // Gulf coast
    [690, 520], [660, 510], [630, 505], [600, 510],
    [570, 520], [540, 530], [520, 535], [500, 540],
    // Texas coast
    [480, 545], [460, 540], [445, 535],
    // Mexico east coast
    [440, 550], [445, 570], [455, 590], [460, 610],
    [455, 630], [440, 640],
    // Mexico south
    [420, 645], [390, 640], [360, 630], [340, 635],
    [320, 640], [310, 630],
    // Mexico west coast
    [300, 610], [290, 590], [280, 570], [275, 550],
    [265, 530], [255, 510], [245, 495],
    // Baja
    [230, 490], [220, 480], [210, 465],
    [205, 450],
    // California coast
    [190, 430], [170, 400], [155, 380], [145, 355],
    [140, 330],
    // Pacific NW coast
    [145, 300], [150, 270], [155, 240], [150, 210],
    [140, 190], [135, 170], [130, 145], [120, 120]
  ];

  function drawContinent(c) {
    var sx = W / 1000, sy = H / 650;
    c.beginPath();
    var pts = continentPoints;
    c.moveTo(pts[0][0] * sx, pts[0][1] * sy);
    for (var i = 1; i < pts.length; i++) {
      var prev = pts[i - 1], curr = pts[i];
      var cpx = (prev[0] + curr[0]) / 2 * sx;
      var cpy = (prev[1] + curr[1]) / 2 * sy;
      c.quadraticCurveTo(prev[0] * sx, prev[1] * sy, cpx, cpy);
    }
    c.quadraticCurveTo(
      pts[pts.length - 1][0] * sx, pts[pts.length - 1][1] * sy,
      pts[0][0] * sx, pts[0][1] * sy
    );
    c.closePath();
    c.fillStyle = "rgba(255,255,255," + (colorState.landFill || 0.04) + ")";
    c.fill();
    c.strokeStyle = "rgba(255,255,255," + (colorState.landStroke || 0.08) + ")";
    c.lineWidth = 1;
    c.stroke();
  }

  /* ─── Particles ────────────────────────────────────────────── */
  var particles = [];
  var PARTICLE_COUNT = 40;

  function initParticles() {
    particles = [];
    var count = W < 768 ? 15 : PARTICLE_COUNT;
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * 1000,
        y: Math.random() * 650,
        size: 0.8 + Math.random() * 1.2,
        speed: 0.05 + Math.random() * 0.2,
        drift: (Math.random() - 0.5) * 0.1,
        opacity: 0.03 + Math.random() * 0.1
      });
    }
  }

  function updateParticles() {
    var maxOp = colorState.particleOp || 0.1;
    particles.forEach(function (p) {
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < -5) { p.y = 655; p.x = Math.random() * 1000; }
      if (p.x < -5) p.x = 1005;
      if (p.x > 1005) p.x = -5;
      p.renderOp = Math.min(p.opacity, maxOp);
    });
  }

  function drawParticles(c) {
    var sx = W / 1000, sy = H / 650;
    particles.forEach(function (p) {
      c.beginPath();
      c.arc(p.x * sx, p.y * sy, p.size * sx, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255," + p.renderOp + ")";
      c.fill();
    });
  }

  /* ─── Route Drawing ────────────────────────────────────────── */
  var globalTime = 0;

  function bezierPoint(ax, ay, cx, cy, bx, by, t) {
    var u = 1 - t;
    return {
      x: u * u * ax + 2 * u * t * cx + t * t * bx,
      y: u * u * ay + 2 * u * t * cy + t * t * by
    };
  }

  function drawRoutes(c) {
    var sx = W / 1000, sy = H / 650;
    var opMul = colorState.routeOpMul || 1;
    var glowMul = colorState.dotGlowMul || 1;

    routes.forEach(function (r) {
      var a = cityMap[r.from], b = cityMap[r.to];
      var ax = a.x * sx, ay = a.y * sy;
      var bx = b.x * sx, by = b.y * sy;
      var cxp = r.cx * sx, cyp = r.cy * sy;

      // Static route line
      var baseOp = (r.major ? 0.18 : 0.08) * opMul;
      c.beginPath();
      c.moveTo(ax, ay);
      c.quadraticCurveTo(cxp, cyp, bx, by);
      c.strokeStyle = "rgba(200,169,81," + baseOp + ")";
      c.lineWidth = (r.major ? 1.5 : 0.8) * (W / 1000);
      c.stroke();

      // Traveling light animation
      r.rotateTimer--;
      if (r.rotateTimer <= 0) {
        r.rotateTimer = 200 + Math.random() * 200;
        r.lightActive = Math.random() < 0.35;
        if (r.lightActive) r.lightT = 0;
      }

      if (r.lightActive) {
        if (r.lightDelay > 0) {
          r.lightDelay--;
        } else {
          r.lightT += r.lightSpeed;
          if (r.lightT >= 1) {
            r.lightT = 0;
            r.lightDelay = 30 + Math.random() * 60; // 1-2s pause
            r.lightActive = Math.random() < 0.6; // might deactivate
          }

          var t = r.lightT;
          var pt = bezierPoint(ax, ay, cxp, cyp, bx, by, t);

          // Comet tail — draw gradient trail behind the dot
          var tailLen = 8;
          for (var ti = tailLen; ti >= 1; ti--) {
            var tt = Math.max(0, t - ti * 0.015);
            var tp = bezierPoint(ax, ay, cxp, cyp, bx, by, tt);
            var tailOp = (1 - ti / tailLen) * 0.3 * opMul;
            c.beginPath();
            c.arc(tp.x, tp.y, (2.5 - ti * 0.15) * (W / 1000) * glowMul, 0, Math.PI * 2);
            c.fillStyle = "rgba(220,195,110," + tailOp + ")";
            c.fill();
          }

          // Bright traveling dot
          var dotR = 3 * (W / 1000) * glowMul;
          // Glow
          c.beginPath();
          c.arc(pt.x, pt.y, dotR * 3, 0, Math.PI * 2);
          c.fillStyle = "rgba(200,169,81," + (0.15 * glowMul) + ")";
          c.fill();
          // Core
          c.beginPath();
          c.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
          c.fillStyle = "rgba(255,235,180," + (0.85 * opMul) + ")";
          c.fill();
        }
      }
    });
  }

  /* ─── City Dots ────────────────────────────────────────────── */
  var hoveredCity = null;
  var hoverGrow = {};

  function drawCities(c) {
    var sx = W / 1000, sy = H / 650;
    var glowMul = colorState.dotGlowMul || 1;
    var pulse = Math.sin(globalTime * 0.05) * 0.5; // oscillate ±0.5
    var isMobile = W < 768;

    cities.forEach(function (city) {
      var cx = city.x * sx, cy = city.y * sy;
      var r, glowR, glowOp, labelOp;
      var hoverT = hoverGrow[city.id] || 0;

      if (city.tier === MAJOR) {
        r = (4 + pulse * 0.5 + hoverT * 2) * (W / 1000);
        glowR = (20 + hoverT * 10) * (W / 1000) * glowMul;
        glowOp = (0.25 + hoverT * 0.3) * glowMul;
        labelOp = 0.9 + hoverT * 0.1;
      } else if (city.tier === SECONDARY) {
        r = (3 + pulse * 0.4 + hoverT * 1.5) * (W / 1000);
        glowR = (14 + hoverT * 8) * (W / 1000) * glowMul;
        glowOp = (0.18 + hoverT * 0.3) * glowMul;
        labelOp = 0.7 + hoverT * 0.2;
      } else {
        r = (2.2 + pulse * 0.3 + hoverT * 1.2) * (W / 1000);
        glowR = (10 + hoverT * 6) * (W / 1000) * glowMul;
        glowOp = (0.12 + hoverT * 0.3) * glowMul;
        labelOp = 0.5 + hoverT * 0.3;
      }

      // Outer glow
      var grad = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, glowR);
      grad.addColorStop(0, "rgba(200,169,81," + glowOp + ")");
      grad.addColorStop(1, "rgba(200,169,81,0)");
      c.beginPath();
      c.arc(cx, cy, glowR, 0, Math.PI * 2);
      c.fillStyle = grad;
      c.fill();

      // Solid dot
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = "rgba(200,169,81," + (0.9 + hoverT * 0.1) + ")";
      c.fill();

      // Bright center
      c.beginPath();
      c.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255," + (0.7 + hoverT * 0.3) + ")";
      c.fill();

      // Label
      if (isMobile && city.tier === TERTIARY) return; // skip tertiary labels on mobile

      var fs;
      if (city.tier === MAJOR) fs = 11 * (W / 1000);
      else if (city.tier === SECONDARY) fs = 9 * (W / 1000);
      else fs = 8 * (W / 1000);
      fs = Math.max(fs, 7);

      c.font = "600 " + fs + "px 'Inter','Segoe UI',system-ui,sans-serif";
      c.letterSpacing = city.tier === MAJOR ? "2px" : "1px";

      var lx = city.lx * (W / 1000);
      var ly = city.ly * (W / 1000);
      // Determine textAlign from lx
      if (city.lx > 5) c.textAlign = "left";
      else if (city.lx < -5) c.textAlign = "right";
      else c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "rgba(200,169,81," + labelOp + ")";
      c.fillText(city.label, cx + lx, cy + ly);
    });
  }

  /* ─── Hover ────────────────────────────────────────────────── */
  function getHoveredCity(mx, my) {
    var sx = W / 1000, sy = H / 650;
    var best = null, bestDist = 25 * sx;
    cities.forEach(function (c) {
      var dx = c.x * sx - mx, dy = c.y * sy - my;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; best = c; }
    });
    return best;
  }

  function onMouseMove(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * dpr;
    var my = (e.clientY - rect.top) * dpr;
    hoveredCity = getHoveredCity(mx, my);
    canvas.style.cursor = hoveredCity ? "pointer" : "default";
  }

  function onTouchStart(e) {
    if (e.touches.length > 0) {
      var rect = canvas.getBoundingClientRect();
      var mx = (e.touches[0].clientX - rect.left) * dpr;
      var my = (e.touches[0].clientY - rect.top) * dpr;
      var c = getHoveredCity(mx, my);
      hoveredCity = (hoveredCity === c) ? null : c;
    }
  }

  function updateHover() {
    cities.forEach(function (c) {
      var target = (hoveredCity && hoveredCity.id === c.id) ? 1 : 0;
      var cur = hoverGrow[c.id] || 0;
      hoverGrow[c.id] = cur + (target - cur) * 0.15; // smooth
    });
  }

  /* ─── Background ───────────────────────────────────────────── */
  function drawBackground(c) {
    var top = colorState.bgTop || { r: 10, g: 22, b: 40 };
    var bot = colorState.bgBot || { r: 26, g: 39, b: 68 };
    var grd = c.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "rgb(" + Math.round(top.r) + "," + Math.round(top.g) + "," + Math.round(top.b) + ")");
    grd.addColorStop(1, "rgb(" + Math.round(bot.r) + "," + Math.round(bot.g) + "," + Math.round(bot.b) + ")");
    c.fillStyle = grd;
    c.fillRect(0, 0, W, H);

    // Horizon glow
    var hz = colorState.horizonGlow || { r: 40, g: 60, b: 90, a: 0.04 };
    var hGrd = c.createRadialGradient(W * 0.5, H * 1.1, 0, W * 0.5, H * 1.1, H * 0.8);
    hGrd.addColorStop(0, "rgba(" + Math.round(hz.r) + "," + Math.round(hz.g) + "," + Math.round(hz.b) + "," + (hz.a || 0.04) + ")");
    hGrd.addColorStop(1, "rgba(" + Math.round(hz.r) + "," + Math.round(hz.g) + "," + Math.round(hz.b) + ",0)");
    c.fillStyle = hGrd;
    c.fillRect(0, 0, W, H);
  }

  /* ─── Offscreen Continent Cache ────────────────────────────── */
  var continentDirty = true;

  function ensureContinentCache() {
    if (!continentDirty && offCanvas) return;
    offCanvas = document.createElement("canvas");
    offCanvas.width = W;
    offCanvas.height = H;
    offCtx = offCanvas.getContext("2d");
    drawContinent(offCtx);
    continentDirty = false;
  }

  /* ─── Render Loop ──────────────────────────────────────────── */
  function render(now) {
    animId = requestAnimationFrame(render);
    if (now - lastFrame < FRAME_INTERVAL) return;
    lastFrame = now;
    globalTime++;

    // Time palette check every ~5 min
    if (globalTime % 9000 === 0 || globalTime === 1) updatePalette();

    updateParticles();
    updateHover();

    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx);

    // Continent (cached offscreen)
    ensureContinentCache();
    ctx.drawImage(offCanvas, 0, 0);

    drawParticles(ctx);
    drawRoutes(ctx);
    drawCities(ctx);
  }

  /* ─── Resize ───────────────────────────────────────────────── */
  function resize() {
    var container = canvas.parentElement;
    var cw = container.clientWidth;
    var ch = Math.round(cw * 0.65);
    dpr = window.devicePixelRatio || 1;
    canvas.width = W = cw * dpr;
    canvas.height = H = ch * dpr;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
    continentDirty = true;
    initParticles();
  }

  /* ─── Init ─────────────────────────────────────────────────── */
  function init() {
    canvas = document.getElementById("networkMapCanvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    // Init palette instantly
    currentPeriod = getTimePeriod();
    colorState = JSON.parse(JSON.stringify(PALETTES[currentPeriod]));
    colorTarget = colorState;
    colorLerp = 1;

    resize();
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("resize", function () {
      resize();
    });

    animId = requestAnimationFrame(render);
  }

  // Auto-init on DOMContentLoaded or immediately if already loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
