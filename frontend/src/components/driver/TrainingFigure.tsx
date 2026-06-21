"use client";

// v3.8.anz — SRL Driver Academy: inline-SVG figure library (Sprint C visuals).
//
// Regulatory recognition charts authored as self-contained inline SVG — no external
// image assets, no <img>, no dangerouslySetInnerHTML (XSS-safe by construction).
//
// Colors here are the ACTUAL regulatory colors a driver must recognize (the GHS red
// diamond border, the DOT hazard-class colors). This is a §3.12 legitimate exception
// to the SRL brand palette: on a regulatory recognition chart, technical accuracy
// governs, not brand tokens. A driver who learns "oxidizer = yellow diamond, class 5"
// has to see yellow, not gold.
//
// Referenced from lesson markdown via a [[figure:KEY]] (or [[figure:KEY|caption]])
// directive — see LessonMarkdown.tsx. Unknown keys render nothing.

import React from "react";

// ── GHS pictogram: white diamond, red border, black symbol ──────────────
function GhsDiamond({ symbol, label }: { symbol: React.ReactNode; label: string }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 100 100" className="h-[72px] w-[72px]" role="img" aria-label={`GHS pictogram: ${label}`}>
        <polygon points="50,3 97,50 50,97 3,50" fill="#ffffff" stroke="#E2231A" strokeWidth="8" strokeLinejoin="round" />
        <g transform="translate(50 50)" fill="#1a1a1a" stroke="none">{symbol}</g>
      </svg>
      <figcaption className="max-w-[84px] text-center text-[10px] font-medium leading-tight text-[#3A4A5F]">{label}</figcaption>
    </figure>
  );
}

// symbols are drawn centered on (0,0), roughly within a 44×44 box
const flamePath = (
  <path d="M2 -22 C-6 -10 10 -6 1 7 C8 3 6 -3 6 -3 C13 8 5 22 -5 19 C-13 17 -15 8 -8 3 C-8 9 -4 9 -4 9 C-12 -2 1 -10 2 -22 Z" />
);
const exclamation = (
  <g>
    <rect x="-4" y="-22" width="8" height="28" rx="2" />
    <circle cx="0" cy="16" r="5" />
  </g>
);
const skull = (
  <g>
    <path d="M0 -20 C-13 -20 -20 -11 -20 -1 C-20 6 -16 10 -12 12 L-12 18 L12 18 L12 12 C16 10 20 6 20 -1 C20 -11 13 -20 0 -20 Z" />
    <circle cx="-8" cy="-2" r="4.5" fill="#ffffff" />
    <circle cx="8" cy="-2" r="4.5" fill="#ffffff" />
    <path d="M0 6 L-3 12 L3 12 Z" fill="#ffffff" />
    <g stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round">
      <line x1="-18" y1="22" x2="18" y2="30" />
      <line x1="-18" y1="30" x2="18" y2="22" />
    </g>
    <circle cx="-18" cy="22" r="3" /><circle cx="18" cy="22" r="3" />
    <circle cx="-18" cy="30" r="3" /><circle cx="18" cy="30" r="3" />
  </g>
);
const gasCylinder = (
  <g>
    <rect x="-11" y="-14" width="22" height="38" rx="8" />
    <rect x="-4" y="-22" width="8" height="10" rx="2" />
  </g>
);
const oxidizer = (
  <g>
    <circle cx="0" cy="10" r="20" fill="none" stroke="#1a1a1a" strokeWidth="5" />
    <g transform="translate(0 -6) scale(0.8)">{flamePath}</g>
  </g>
);
const bomb = (
  <g>
    <circle cx="-2" cy="8" r="16" />
    <g stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round">
      <line x1="10" y1="-10" x2="20" y2="-20" />
      <line x1="4" y1="-14" x2="7" y2="-26" />
      <line x1="16" y1="-4" x2="28" y2="-7" />
    </g>
  </g>
);
const corrosion = (
  <g>
    {/* two containers dripping onto a surface + a hand */}
    <path d="M-26 -18 L-12 -18 L-16 -4 Z" />
    <path d="M2 -18 L16 -18 L12 -4 Z" />
    <line x1="-15" y1="-2" x2="-15" y2="8" stroke="#1a1a1a" strokeWidth="3" />
    <line x1="13" y1="-2" x2="13" y2="8" stroke="#1a1a1a" strokeWidth="3" />
    {/* surface bar (left) */}
    <rect x="-30" y="10" width="20" height="5" />
    <path d="M-26 15 L-22 22 L-18 15 Z" />
    {/* hand (right) */}
    <rect x="6" y="10" width="22" height="6" rx="2" />
    <rect x="22" y="6" width="6" height="14" rx="2" />
  </g>
);
const healthHazard = (
  <g>
    {/* torso silhouette with white starburst on chest */}
    <circle cx="0" cy="-16" r="7" />
    <path d="M-14 24 C-14 4 -8 -4 0 -4 C8 -4 14 4 14 24 Z" />
    <g fill="#ffffff">
      <path d="M2 2 l2.5 6 l6 0 l-5 4 l2 6 l-5.5 -3.5 l-5.5 3.5 l2 -6 l-5 -4 l6 0 Z" />
    </g>
  </g>
);
const environment = (
  <g>
    {/* dead fish + tree over waterline */}
    <line x1="-26" y1="20" x2="26" y2="20" stroke="#1a1a1a" strokeWidth="3" />
    {/* tree */}
    <rect x="-20" y="2" width="3" height="14" />
    <circle cx="-18.5" cy="-2" r="9" />
    {/* fish (belly-up: tail left, X eye) */}
    <path d="M2 12 C10 4 22 4 26 12 C22 20 10 20 2 12 Z" />
    <path d="M2 12 L-6 6 L-6 18 Z" />
    <line x1="16" y1="8" x2="20" y2="12" stroke="#ffffff" strokeWidth="2" />
    <line x1="20" y1="8" x2="16" y2="12" stroke="#ffffff" strokeWidth="2" />
  </g>
);

const GHS: { symbol: React.ReactNode; label: string }[] = [
  { symbol: flamePath, label: "Flammable" },
  { symbol: oxidizer, label: "Oxidizer" },
  { symbol: bomb, label: "Explosive" },
  { symbol: gasCylinder, label: "Gas under pressure" },
  { symbol: corrosion, label: "Corrosive" },
  { symbol: skull, label: "Acute toxicity" },
  { symbol: healthHazard, label: "Health hazard" },
  { symbol: exclamation, label: "Irritant / warning" },
  { symbol: environment, label: "Environmental (GHS, not OSHA)" },
];

// ── DOT hazard-class placard (colored diamond + symbol + class number) ───
function DotPlacard({
  fill, stripes, stripeColor = "#1a1a1a", stripeHeight = 100, splitBottom, symbolColor, numColor, symbol, num, label,
}: {
  fill: string; stripes?: boolean; stripeColor?: string; stripeHeight?: number; splitBottom?: string;
  symbolColor: string; numColor?: string; symbol: React.ReactNode; num: string; label: string;
}) {
  const clip = `dotclip-${num}`;
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 100 100" className="h-[72px] w-[72px]" role="img" aria-label={`DOT placard class ${num}: ${label}`}>
        <defs>
          <clipPath id={clip}><polygon points="50,4 96,50 50,96 4,50" /></clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect x="0" y="0" width="100" height="100" fill={fill} />
          {splitBottom && <rect x="0" y="50" width="100" height="50" fill={splitBottom} />}
          {stripes && [...Array(6)].map((_, i) => (
            <rect key={i} x={i * 18 + 2} y="0" width="9" height={stripeHeight} fill={stripeColor} />
          ))}
        </g>
        <polygon points="50,4 96,50 50,96 4,50" fill="none" stroke="#1a1a1a" strokeWidth="4" strokeLinejoin="round" />
        <g transform="translate(50 38) scale(0.62)" fill={symbolColor} stroke="none">{symbol}</g>
        <text x="50" y="84" textAnchor="middle" fontSize="20" fontWeight="700" fill={numColor ?? symbolColor} fontFamily="Arial, sans-serif">{num}</text>
      </svg>
      <figcaption className="max-w-[88px] text-center text-[10px] font-medium leading-tight text-[#3A4A5F]">{label}</figcaption>
    </figure>
  );
}

const trefoil = (
  <g>
    <circle cx="0" cy="0" r="6" />
    {[0, 120, 240].map((a) => (
      <path key={a} d="M0 0 L-13 -22 A26 26 0 0 1 13 -22 Z" transform={`rotate(${a})`} />
    ))}
  </g>
);

const DOT: React.ReactNode[] = [
  <DotPlacard key="1" num="1" label="Explosives" fill="#E8841A" symbolColor="#1a1a1a" symbol={bomb} />,
  <DotPlacard key="2" num="2" label="Gases (red flammable, green non-flam, yellow oxygen)" fill="#D0141E" symbolColor="#ffffff" symbol={flamePath} />,
  <DotPlacard key="3" num="3" label="Flammable liquid" fill="#D0141E" symbolColor="#ffffff" symbol={flamePath} />,
  <DotPlacard key="4" num="4" label="Flammable solid" fill="#ffffff" stripes stripeColor="#D0141E" symbolColor="#1a1a1a" symbol={flamePath} />,
  <DotPlacard key="5" num="5" label="Oxidizer" fill="#F6D000" symbolColor="#1a1a1a" symbol={oxidizer} />,
  <DotPlacard key="6" num="6" label="Toxic / poison" fill="#ffffff" symbolColor="#1a1a1a" symbol={skull} />,
  <DotPlacard key="7" num="7" label="Radioactive" fill="#F6D000" splitBottom="#ffffff" symbolColor="#1a1a1a" symbol={trefoil} />,
  <DotPlacard key="8" num="8" label="Corrosive" fill="#ffffff" splitBottom="#1a1a1a" symbolColor="#1a1a1a" numColor="#ffffff" symbol={corrosion} />,
  <DotPlacard key="9" num="9" label="Miscellaneous" fill="#ffffff" stripes stripeColor="#1a1a1a" stripeHeight={50} symbolColor="#1a1a1a" symbol={<></>} />,
];

// ── Placard anatomy: one diamond, annotated ─────────────────────────────
function PlacardAnatomy() {
  return (
    <svg viewBox="0 0 260 150" className="h-auto w-full max-w-[340px]" role="img" aria-label="Anatomy of a DOT placard">
      <polygon points="80,12 148,80 80,148 12,80" fill="#D0141E" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" />
      <g transform="translate(80 58) scale(0.7)" fill="#ffffff">{flamePath}</g>
      <text x="80" y="128" textAnchor="middle" fontSize="22" fontWeight="700" fill="#ffffff" fontFamily="Arial, sans-serif">3</text>
      {/* hazard class panel on a UN-ID orange box example to the side */}
      <rect x="170" y="62" width="78" height="26" fill="#E8841A" stroke="#1a1a1a" strokeWidth="2" />
      <text x="209" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1a1a1a" fontFamily="Arial, sans-serif">UN 1203</text>
      {/* callouts */}
      <g fontFamily="Arial, sans-serif" fontSize="9" fill="#3A4A5F">
        <line x1="86" y1="44" x2="150" y2="30" stroke="#BA7517" strokeWidth="1.2" />
        <text x="154" y="32">Symbol (hazard type)</text>
        <line x1="92" y1="120" x2="150" y2="132" stroke="#BA7517" strokeWidth="1.2" />
        <text x="154" y="135">Class number</text>
        <line x1="209" y1="90" x2="209" y2="102" stroke="#BA7517" strokeWidth="1.2" />
        <text x="209" y="114" textAnchor="middle">UN ID number panel</text>
      </g>
    </svg>
  );
}

// ── Public renderer ─────────────────────────────────────────────────────
export const FIGURE_KEYS = new Set(["ghs-pictograms", "dot-placard-classes", "placard-anatomy"]);

export function TrainingFigure({ figureKey, caption }: { figureKey: string; caption?: string }) {
  let body: React.ReactNode = null;
  let defaultCaption = "";

  if (figureKey === "ghs-pictograms") {
    defaultCaption = "The GHS hazard pictograms (red-bordered diamonds). OSHA requires the first 8 on US workplace labels; the environmental pictogram is the 9th in the full GHS — seen on some Canadian/WHMIS labels but not OSHA-required.";
    body = (
      <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">
        {GHS.map((g) => <GhsDiamond key={g.label} symbol={g.symbol} label={g.label} />)}
      </div>
    );
  } else if (figureKey === "dot-placard-classes") {
    defaultCaption = "The 9 DOT hazard classes — recognize them by color, symbol, and the class number at the bottom point.";
    body = (
      <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">
        {DOT}
      </div>
    );
  } else if (figureKey === "placard-anatomy") {
    defaultCaption = "A DOT placard: hazard symbol up top, class number at the bottom point, with the UN ID number nearby (on the placard or an adjacent orange panel).";
    body = <div className="flex justify-center">{PlacardAnatomy()}</div>;
  } else {
    return null;
  }

  return (
    <figure className="m-0 rounded-xl border border-[rgba(10,37,64,0.08)] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
      {body}
      <figcaption className="mt-3 border-t border-[rgba(10,37,64,0.06)] pt-2 text-[11.5px] leading-relaxed text-[#6B7685]">
        {caption || defaultCaption}
      </figcaption>
    </figure>
  );
}
