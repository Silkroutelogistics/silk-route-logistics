const fs = require('fs');
const html = fs.readFileSync('./temp-us-map.html', 'utf-8');

// Extract all path elements (skip HI and AK)
const skipIds = ['HI', 'AK', 'path67', 'path58', 'circle60'];
const statePaths = [];

// Split on <path to isolate each element, then extract id and d separately
// This avoids regex issues with data-info attributes containing HTML (angle brackets, etc.)
const chunks = html.split('<path ');
for (const chunk of chunks) {
  const idMatch = chunk.match(/id="([^"]+)"/);
  const dMatch = chunk.match(/\sd="([^"]+)"/s);
  if (idMatch && dMatch && !skipIds.includes(idMatch[1])) {
    statePaths.push({ id: idMatch[1], d: dMatch[1].replace(/\s+/g, ' ').trim() });
  }
}

console.log(`Extracted ${statePaths.length} state paths`);

// City positions (calibrated to the SVG coordinate system viewBox="174 100 959 593")
// US cities positioned based on geographic location within the state path boundaries
const cities = [
  // Major US hubs
  { name: 'NEW YORK', x: 1005, y: 295, r: 5, tier: 1 },
  { name: 'LOS ANGELES', x: 250, y: 465, r: 5, tier: 1 },
  { name: 'CHICAGO', x: 770, y: 310, r: 5, tier: 1 },
  { name: 'DALLAS', x: 580, y: 488, r: 4.5, tier: 1 },
  { name: 'ATLANTA', x: 862, y: 478, r: 4.5, tier: 1 },
  { name: 'SEATTLE', x: 272, y: 158, r: 4.5, tier: 1 },
  // Secondary US cities
  { name: 'HOUSTON', x: 605, y: 538, r: 3.5, tier: 2 },
  { name: 'MIAMI', x: 940, y: 638, r: 3.5, tier: 2 },
  { name: 'BOSTON', x: 1055, y: 270, r: 3.5, tier: 2 },
  { name: 'PHILADELPHIA', x: 993, y: 325, r: 3.5, tier: 2 },
  { name: 'DETROIT', x: 840, y: 298, r: 3.5, tier: 2 },
  { name: 'MINNEAPOLIS', x: 670, y: 248, r: 3.5, tier: 2 },
  { name: 'DENVER', x: 465, y: 358, r: 3.5, tier: 2 },
  { name: 'SAN FRANCISCO', x: 218, y: 398, r: 3.5, tier: 2 },
  { name: 'PHOENIX', x: 358, y: 478, r: 3.5, tier: 2 },
  // Canadian cities
  { name: 'VANCOUVER', x: 262, y: 100, r: 4, tier: 1, canada: true },
  { name: 'CALGARY', x: 395, y: 62, r: 3.5, tier: 2, canada: true },
  { name: 'TORONTO', x: 910, y: 255, r: 4, tier: 1, canada: true },
  { name: 'MONTREAL', x: 1010, y: 215, r: 3.5, tier: 2, canada: true },
];

// Label offsets for readability
const labelOffsets = {
  'NEW YORK': { dx: 14, dy: -4, anchor: 'start' },
  'LOS ANGELES': { dx: -52, dy: 16, anchor: 'middle' },
  'CHICAGO': { dx: -38, dy: 16, anchor: 'end' },
  'DALLAS': { dx: 0, dy: -10, anchor: 'middle' },
  'ATLANTA': { dx: 0, dy: 18, anchor: 'middle' },
  'SEATTLE': { dx: 0, dy: -10, anchor: 'middle' },
  'HOUSTON': { dx: 0, dy: 15, anchor: 'middle' },
  'MIAMI': { dx: 14, dy: 4, anchor: 'start' },
  'BOSTON': { dx: 12, dy: -2, anchor: 'start' },
  'PHILADELPHIA': { dx: 14, dy: 8, anchor: 'start' },
  'DETROIT': { dx: 10, dy: -6, anchor: 'start' },
  'MINNEAPOLIS': { dx: 0, dy: -10, anchor: 'middle' },
  'DENVER': { dx: 0, dy: 16, anchor: 'middle' },
  'SAN FRANCISCO': { dx: -50, dy: 4, anchor: 'end' },
  'PHOENIX': { dx: 0, dy: 16, anchor: 'middle' },
  'VANCOUVER': { dx: 0, dy: -10, anchor: 'middle' },
  'CALGARY': { dx: 0, dy: -10, anchor: 'middle' },
  'TORONTO': { dx: 12, dy: -4, anchor: 'start' },
  'MONTREAL': { dx: 12, dy: -4, anchor: 'start' },
};

// Route lines connecting cities
const routes = [
  ['VANCOUVER', 'SEATTLE'],
  ['VANCOUVER', 'CALGARY'],
  ['SEATTLE', 'MINNEAPOLIS'],
  ['SAN FRANCISCO', 'LOS ANGELES'],
  ['LOS ANGELES', 'PHOENIX'],
  ['LOS ANGELES', 'DALLAS'],
  ['PHOENIX', 'DALLAS'],
  ['DALLAS', 'HOUSTON'],
  ['DALLAS', 'ATLANTA'],
  ['HOUSTON', 'ATLANTA'],
  ['ATLANTA', 'MIAMI'],
  ['CHICAGO', 'MINNEAPOLIS'],
  ['CHICAGO', 'DETROIT'],
  ['CHICAGO', 'NEW YORK'],
  ['DETROIT', 'TORONTO'],
  ['TORONTO', 'MONTREAL'],
  ['MONTREAL', 'BOSTON'],
  ['BOSTON', 'NEW YORK'],
  ['NEW YORK', 'PHILADELPHIA'],
  ['NEW YORK', 'ATLANTA'],
  ['DENVER', 'CHICAGO'],
  ['DENVER', 'DALLAS'],
];

const cityMap = {};
cities.forEach(c => { cityMap[c.name] = c; });

// Generate route line SVG
function routeLine(from, to) {
  const a = cityMap[from], b = cityMap[to];
  if (!a || !b) return '';
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  // For long routes, use a slight curve
  if (dist > 200) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // Offset perpendicular to the line
    const nx = -dy / dist, ny = dx / dist;
    const offset = dist * 0.08;
    const cx = mx + nx * offset, cy = my + ny * offset;
    return `  <path d="M ${a.x},${a.y} Q ${cx.toFixed(0)},${cy.toFixed(0)} ${b.x},${b.y}" stroke="#C8963E" stroke-width="1.2" stroke-dasharray="6,4" fill="none" opacity="0.4" filter="url(#lineGlow)"/>`;
  }
  return `  <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#C8963E" stroke-width="1.2" stroke-dasharray="6,4" opacity="0.4" filter="url(#lineGlow)"/>`;
}

// Canada simplified outline (southern strip visible above US)
const canadaPath = `M 180,30 L 200,30 L 350,28 L 500,30 L 650,30 L 800,30 L 950,30 L 1050,30 L 1120,35
  L 1115,60 L 1110,100 L 1105,140 L 1097,177
  L 1060,200 L 1020,215 L 985,228 L 960,235 L 935,245 L 920,252
  C 910,258 900,262 895,265
  L 870,270 L 860,272
  C 850,268 845,262 842,258
  L 838,250 L 835,245 L 830,238 L 825,230 L 818,222
  C 812,216 808,212 802,208
  L 795,204 L 790,200 L 785,196 L 780,192
  C 776,188 772,186 768,184
  L 758,180 L 748,178 L 738,176
  C 728,174 718,175 710,178
  L 700,180 L 692,178 L 682,170 L 670,162
  L 660,155 L 650,152 L 640,150
  L 615,150 L 590,148 L 560,146 L 530,142
  L 500,138 L 470,134 L 440,128
  L 410,120 L 380,112 L 350,106 L 325,102
  L 300,100 L 280,98 L 267,104
  C 255,96 240,80 230,65
  L 220,50 L 200,35 L 180,30 Z`;

// Build SVG
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="140 20 1020 700" fill="none">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#0d1f35" stroke-width="0.2"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect x="140" y="20" width="1020" height="700" fill="#0a1628"/>
  <rect x="140" y="20" width="1020" height="700" fill="url(#grid)" opacity="0.25"/>

  <!-- Canada (simplified southern strip) -->
  <path d="${canadaPath}" fill="#0d1a2e" stroke="#162a42" stroke-width="0.6" opacity="0.8"/>

  <!-- US States (real geographic paths) -->
  <g fill="#0f1f34" stroke="#1a3050" stroke-width="0.5">
`;

// Add all state paths
for (const sp of statePaths) {
  svg += `    <path id="${sp.id}" d="${sp.d}"/>\n`;
}

svg += `  </g>

  <!-- Route Lines -->
`;

for (const [from, to] of routes) {
  svg += routeLine(from, to) + '\n';
}

svg += `
  <!-- City Markers and Labels -->
`;

for (const city of cities) {
  const lo = labelOffsets[city.name] || { dx: 0, dy: -10, anchor: 'middle' };
  const fontSize = city.tier === 1 ? '9' : '7.5';
  const fontWeight = city.tier === 1 ? '700' : '600';
  const opacity = city.tier === 1 ? '0.95' : '0.8';
  const labelOpacity = city.tier === 1 ? '0.9' : '0.7';
  const whiteR = city.tier === 1 ? city.r * 0.4 : 0;

  svg += `  <circle cx="${city.x}" cy="${city.y}" r="${city.r}" fill="#C8963E" filter="url(#glow)" opacity="${opacity}"/>\n`;
  if (whiteR > 0) {
    svg += `  <circle cx="${city.x}" cy="${city.y}" r="${whiteR}" fill="#fff" opacity="0.75"/>\n`;
  }
  svg += `  <text x="${city.x + lo.dx}" y="${city.y + lo.dy}" text-anchor="${lo.anchor}" fill="#C8963E" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="0.6" opacity="${labelOpacity}">${city.name}</text>\n`;
}

svg += `</svg>`;

fs.writeFileSync('./frontend/public/hero-map.svg', svg, 'utf-8');
console.log('Generated hero-map.svg successfully');
console.log(`File size: ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
