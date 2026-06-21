"use client";

// v3.8.aok — SRL Driver Academy: inline-SVG / schematic figure library.
//
// Two kinds of figures, both self-contained (no external image assets, no <img>,
// no dangerouslySetInnerHTML — XSS-safe by construction):
//   1. Regulatory RECOGNITION charts (GHS pictograms, DOT placards) — inline SVG
//      in the ACTUAL regulatory colors a driver must recognize (§3.12 legitimate
//      exception to the SRL palette: on a recognition chart, technical accuracy
//      governs, not brand tokens).
//   2. Instructional SCHEMATIC figures (timelines, decision flows, step sequences,
//      comparison columns, matrices, labeled bars) — composed from a small set of
//      reusable layout primitives in canonical §2.1 brand tokens.
//
// Referenced from lesson markdown via a [[figure:KEY]] (or [[figure:KEY|caption]])
// directive — see LessonMarkdown.tsx. Unknown keys render nothing.
//
// Every number/label here is FAITHFUL to the live lesson text it attaches to —
// no figure introduces a figure-only fabricated precision (verify-before-acting
// applies to diagrams as much as to prose).

import React from "react";

// ── Canonical §2.1 brand tokens (instructional schematics) ──────────────
const C = {
  navy: "#0A2540", navy700: "#15365A", navy100: "#E2EAF2",
  gold: "#C5A572", goldDark: "#BA7517", goldTint: "#FAEEDA",
  cream: "#FBF7F0", cream2: "#F5EEE0", cream3: "#EFE6D3",
  fg: "#3A4A5F", muted: "#6B7685", disabled: "#A7AEB8",
  success: "#2F7A4F", successBg: "#E6F0E9",
  warning: "#B07A1A", warningBg: "#FBEFD4",
  danger: "#9B2C2C", dangerBg: "#F6E3E3",
  info: "#2A5B8B", infoBg: "#E2EAF2",
};

// ════════════════════════════════════════════════════════════════════════
// 1. REGULATORY RECOGNITION CHARTS (real regulatory colors — §3.12)
// ════════════════════════════════════════════════════════════════════════

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
    <path d="M-26 -18 L-12 -18 L-16 -4 Z" />
    <path d="M2 -18 L16 -18 L12 -4 Z" />
    <line x1="-15" y1="-2" x2="-15" y2="8" stroke="#1a1a1a" strokeWidth="3" />
    <line x1="13" y1="-2" x2="13" y2="8" stroke="#1a1a1a" strokeWidth="3" />
    <rect x="-30" y="10" width="20" height="5" />
    <path d="M-26 15 L-22 22 L-18 15 Z" />
    <rect x="6" y="10" width="22" height="6" rx="2" />
    <rect x="22" y="6" width="6" height="14" rx="2" />
  </g>
);
const healthHazard = (
  <g>
    <circle cx="0" cy="-16" r="7" />
    <path d="M-14 24 C-14 4 -8 -4 0 -4 C8 -4 14 4 14 24 Z" />
    <g fill="#ffffff">
      <path d="M2 2 l2.5 6 l6 0 l-5 4 l2 6 l-5.5 -3.5 l-5.5 3.5 l2 -6 l-5 -4 l6 0 Z" />
    </g>
  </g>
);
const environment = (
  <g>
    <line x1="-26" y1="20" x2="26" y2="20" stroke="#1a1a1a" strokeWidth="3" />
    <rect x="-20" y="2" width="3" height="14" />
    <circle cx="-18.5" cy="-2" r="9" />
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
      <rect x="170" y="62" width="78" height="26" fill="#E8841A" stroke="#1a1a1a" strokeWidth="2" />
      <text x="209" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1a1a1a" fontFamily="Arial, sans-serif">UN 1203</text>
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

// ════════════════════════════════════════════════════════════════════════
// 2. REUSABLE SCHEMATIC LAYOUT PRIMITIVES (brand tokens)
// ════════════════════════════════════════════════════════════════════════

type Seg = { w: number; label: string; sub?: string; fill: string; fg?: string };
// A proportional horizontal track (timeline / window bar).
function Track({ title, segments, height = 46 }: { title?: string; segments: Seg[]; height?: number }) {
  return (
    <div className="w-full">
      {title && <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#BA7517]">{title}</div>}
      <div className="flex w-full overflow-hidden rounded-lg border border-[rgba(10,37,64,0.12)]" style={{ minHeight: height }}>
        {segments.map((s, i) => (
          <div
            key={i}
            style={{ flexGrow: s.w, flexBasis: 0, background: s.fill, color: s.fg ?? "#FBF7F0" }}
            className={`flex min-w-0 flex-col items-center justify-center px-1 py-1.5 text-center ${i > 0 ? "border-l border-white/30" : ""}`}
          >
            <span className="text-[11px] font-semibold leading-tight">{s.label}</span>
            {s.sub && <span className="mt-0.5 text-[9.5px] leading-tight opacity-90">{s.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Numbered step sequence (vertical), with optional tone per step.
type StepItem = { title: string; sub?: string; tone?: "navy" | "gold" | "success" | "danger" | "warning" };
function Steps({ items, numbered = true }: { items: StepItem[]; numbered?: boolean }) {
  const toneBg: Record<string, string> = { navy: C.navy, gold: C.goldDark, success: C.success, danger: C.danger, warning: C.warning };
  return (
    <ol className="m-0 flex flex-col gap-0 p-0">
      {items.map((s, i) => {
        const bg = toneBg[s.tone ?? "navy"];
        return (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-12px)] w-[2px] bg-[#EFE6D3]" aria-hidden />}
            <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-[#FBF7F0]" style={{ background: bg }}>
              {numbered ? i + 1 : "•"}
            </span>
            <div className="pt-0.5">
              <div className="text-[13px] font-semibold text-[#0A2540]">{s.title}</div>
              {s.sub && <div className="mt-0.5 text-[12px] leading-snug text-[#3A4A5F]">{s.sub}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Decision flow (vertical): condition rows + branch off-ramps + terminal chips.
type FlowNode =
  | { kind: "start" | "action"; text: string }
  | { kind: "decision"; text: string; failText: string }
  | { kind: "stop" | "go"; text: string };
function FlowDown({ nodes }: { nodes: FlowNode[] }) {
  return (
    <div className="flex flex-col items-stretch gap-0">
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        if (n.kind === "decision") {
          return (
            <div key={i} className="flex flex-col items-stretch">
              <div className="flex items-start gap-2 rounded-lg border border-[#C5A572] bg-[#FAEEDA] px-3 py-2">
                <span className="mt-px text-[11px] font-bold text-[#BA7517]">?</span>
                <span className="text-[12.5px] font-semibold leading-snug text-[#0A2540]">{n.text}</span>
              </div>
              <div className="ml-6 flex items-stretch gap-2 py-1">
                <div className="w-[2px] shrink-0 bg-[#EFE6D3]" aria-hidden />
                <div className="flex items-center gap-1.5 rounded-md border-l-[3px] border-l-[#9B2C2C] bg-[#F6E3E3] px-2.5 py-1.5">
                  <span className="text-[10px] font-bold uppercase text-[#9B2C2C]">No →</span>
                  <span className="text-[11.5px] leading-snug text-[#9B2C2C]">{n.failText}</span>
                </div>
              </div>
              {!last && <CenterArrow label="Yes" />}
            </div>
          );
        }
        if (n.kind === "stop" || n.kind === "go") {
          const ok = n.kind === "go";
          return (
            <div key={i} className="flex justify-center">
              <span
                className="rounded-full px-4 py-1.5 text-[12.5px] font-bold"
                style={{ background: ok ? C.successBg : C.dangerBg, color: ok ? C.success : C.danger, border: `1.5px solid ${ok ? C.success : C.danger}` }}
              >
                {ok ? "✓ " : "✕ "}{n.text}
              </span>
            </div>
          );
        }
        // start / action
        const isStart = n.kind === "start";
        return (
          <div key={i} className="flex flex-col items-stretch">
            <div
              className="rounded-lg px-3 py-2 text-center text-[12.5px] font-semibold leading-snug"
              style={isStart
                ? { background: C.navy, color: C.cream }
                : { background: "#fff", color: C.navy, border: `1px solid rgba(10,37,64,0.14)` }}
            >
              {n.text}
            </div>
            {!last && <CenterArrow />}
          </div>
        );
      })}
    </div>
  );
}
function CenterArrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1">
      {label && <span className="text-[9.5px] font-bold uppercase tracking-wide text-[#2F7A4F]">{label} ↓</span>}
      {!label && <span className="text-[14px] leading-none text-[#A7AEB8]">↓</span>}
    </div>
  );
}

// "All of these must pass" checklist with a gate.
function Checklist({ items, pass, fail }: { items: string[]; pass: string; fail: string }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg border border-[rgba(10,37,64,0.08)] bg-white px-3 py-1.5">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E6F0E9] text-[10px] font-bold text-[#2F7A4F]">✓</span>
            <span className="text-[12.5px] leading-snug text-[#3A4A5F]">{it}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div className="rounded-lg border-l-[3px] border-l-[#2F7A4F] bg-[#E6F0E9] px-3 py-2 text-[11.5px] font-medium text-[#2F7A4F]">All pass → {pass}</div>
        <div className="rounded-lg border-l-[3px] border-l-[#9B2C2C] bg-[#F6E3E3] px-3 py-2 text-[11.5px] font-medium text-[#9B2C2C]">Any one fails → {fail}</div>
      </div>
    </div>
  );
}

// Comparison columns (2 or 3), each with a header tone + bullet items.
type Col = { title: string; sub?: string; tone?: "neutral" | "good" | "bad" | "navy"; items: string[] };
function Compare({ columns }: { columns: Col[] }) {
  const head: Record<string, { bg: string; fg: string; mark?: string }> = {
    neutral: { bg: C.cream2, fg: C.navy },
    navy: { bg: C.navy, fg: C.cream },
    good: { bg: C.successBg, fg: C.success, mark: "✓" },
    bad: { bg: C.dangerBg, fg: C.danger, mark: "✕" },
  };
  return (
    <div className={`grid gap-2 ${columns.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {columns.map((col, i) => {
        const h = head[col.tone ?? "neutral"];
        return (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-[rgba(10,37,64,0.10)]">
            <div className="px-3 py-2 text-center" style={{ background: h.bg, color: h.fg }}>
              <div className="text-[12.5px] font-bold leading-tight">{h.mark ? `${h.mark} ` : ""}{col.title}</div>
              {col.sub && <div className="mt-0.5 text-[10.5px] font-medium opacity-90">{col.sub}</div>}
            </div>
            <ul className="flex flex-1 flex-col gap-1.5 bg-white px-3 py-2.5">
              {col.items.map((it, j) => (
                <li key={j} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[#3A4A5F]">
                  <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[#C5A572]" aria-hidden />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// Data matrix (table) with tone per row.
type Row = { cells: string[]; tone?: "danger" | "warning" | "info" | "neutral" };
function Matrix({ headers, rows }: { headers: string[]; rows: Row[] }) {
  const toneBg: Record<string, string> = { danger: C.dangerBg, warning: C.warningBg, info: C.infoBg, neutral: "#fff" };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="border-b border-[rgba(10,37,64,0.14)] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#0A2540]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: toneBg[r.tone ?? "neutral"] }}>
              {r.cells.map((c, j) => (
                <td key={j} className={`border-b border-[rgba(10,37,64,0.06)] px-2.5 py-1.5 align-top text-[11.5px] leading-snug ${j === 0 ? "font-semibold text-[#0A2540]" : "text-[#3A4A5F]"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Labeled horizontal bars (percentages / proportional values).
type BarItem = { label: string; value: number; max: number; valueLabel?: string; highlight?: boolean };
function Bars({ items, unit }: { items: BarItem[]; unit?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-[120px] shrink-0 text-right text-[11.5px] leading-tight text-[#3A4A5F]">{b.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-[#F5EEE0]">
            <div
              className="absolute left-0 top-0 h-full rounded"
              style={{ width: `${Math.max(4, (b.value / b.max) * 100)}%`, background: b.highlight ? C.goldDark : C.navy700 }}
            />
          </div>
          <span className="w-[58px] shrink-0 text-left text-[11px] font-semibold" style={{ color: b.highlight ? C.goldDark : C.navy }}>
            {b.valueLabel ?? `${b.value}${unit ?? ""}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// Small labeled-cell grid (pattern recognition).
function IconGrid({ items }: { items: { glyph: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-lg border border-[rgba(10,37,64,0.08)] bg-[#FBF7F0] px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A2540] text-[16px] text-[#C5A572]">{it.glyph}</span>
          <span className="text-[12px] font-medium leading-snug text-[#3A4A5F]">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// A small note strip under a figure body (danger / warning / info).
function Note({ tone = "info", children }: { tone?: "danger" | "warning" | "info" | "success"; children: React.ReactNode }) {
  const map: Record<string, { bg: string; fg: string }> = {
    danger: { bg: C.dangerBg, fg: C.danger }, warning: { bg: C.warningBg, fg: C.warning },
    info: { bg: C.infoBg, fg: C.info }, success: { bg: C.successBg, fg: C.success },
  };
  const m = map[tone];
  return <div className="mt-2.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium leading-snug" style={{ background: m.bg, color: m.fg }}>{children}</div>;
}

// ════════════════════════════════════════════════════════════════════════
// 3. STRUCTURED FIGURE REGISTRY (key → caption + body)
// ════════════════════════════════════════════════════════════════════════

const STRUCTURED: Record<string, { caption: string; body: React.ReactNode }> = {
  // ── HOURS OF SERVICE ──────────────────────────────────────────────────
  "hos-daily-clock": {
    caption: "The two daily limits run together off one 10-hour reset: you may drive up to 11 hours, but only inside a 14-hour window that does not pause for ordinary breaks. A 30-minute break is required after 8 hours of driving.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Track title="14-hour ON-DUTY window (does NOT pause for breaks)" segments={[
          { w: 8, label: "Drive / on-duty", sub: "first 8 h", fill: C.navy700 },
          { w: 0.6, label: "30-min", sub: "break", fill: C.goldDark },
          { w: 3, label: "Drive / on-duty", fill: C.navy700 },
          { w: 2.4, label: "Window closes", sub: "no more driving", fill: C.cream3, fg: C.fg },
        ]} />
        <Track title="11-hour DRIVING limit (within that window)" segments={[
          { w: 11, label: "Up to 11 hours of driving", fill: C.gold, fg: C.navy },
          { w: 3, label: "no-drive", fill: C.cream3, fg: C.muted },
        ]} />
        <Note tone="info"><strong>10 consecutive hours off duty</strong> resets both clocks for the next day.</Note>
      </div>
    ),
  },
  "sleeper-berth-split-73": {
    caption: "A 7/3 sleeper split: a 7-hour sleeper-berth period paired with a separate 3-hour off-duty (or sleeper) period totals at least 10 hours — and NEITHER qualifying period counts against your 14-hour window.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Track segments={[
          { w: 3, label: "Drive / on-duty", fill: C.navy700 },
          { w: 7, label: "7 h sleeper berth", sub: "doesn't count vs 14-hr", fill: C.gold, fg: C.navy },
          { w: 2.5, label: "Drive / on-duty", fill: C.navy700 },
          { w: 3, label: "3 h off duty", sub: "doesn't count vs 14-hr", fill: C.goldTint, fg: C.navy },
        ]} />
        <Note tone="success"><strong>7 + 3 = at least 10 hours.</strong> Pair the two periods to satisfy your reset without losing your whole window to one block.</Note>
      </div>
    ),
  },
  "short-haul-daily-test": {
    caption: "Short-haul is a DAILY test — all four conditions must be true that day. If even one fails, you run the full RODS/ELD for that day.",
    body: (
      <Checklist
        items={[
          "Stay within a 150 air-mile radius of your normal work-reporting location",
          "Return to that same work-reporting location the same day",
          "Released from duty within 14 hours of coming on duty",
          "Have 10 consecutive hours off between shifts",
        ]}
        pass="short-haul exception (no ELD/RODS that day)"
        fail="full RODS / ELD required that day"
      />
    ),
  },
  "adverse-driving-extension": {
    caption: "When UNFORESEEN adverse conditions keep you from safely finishing a run, you may drive up to 2 extra hours — and under the current rule that stretches BOTH the 11-hour driving limit (to 13) and the 14-hour window (to 16).",
    body: (
      <div className="flex flex-col gap-2.5">
        <Track title="Normal day" segments={[
          { w: 11, label: "11 h driving", fill: C.gold, fg: C.navy },
          { w: 3, label: "rest of 14-h window", fill: C.cream3, fg: C.muted },
          { w: 2, label: "past 14 h: must stop", fill: C.cream2, fg: C.disabled },
        ]} />
        <Track title="Adverse driving conditions (unforeseen only)" segments={[
          { w: 11, label: "11 h driving", fill: C.gold, fg: C.navy },
          { w: 2, label: "+2 h drive", sub: "to 13 h", fill: C.goldDark },
          { w: 3, label: "window also +2 h", sub: "to 16 h", fill: C.goldTint, fg: C.navy },
        ]} />
        <Note tone="warning"><strong>Unforeseen only.</strong> Conditions you knew or could have known at dispatch (rush-hour traffic, a closure already on the map, a slow shipper) do NOT qualify. Use only the extra time you actually need. It never extends your 30-minute break or your weekly 60/70-hour limit.</Note>
      </div>
    ),
  },

  // ── CDL / MEDICAL / CLEARINGHOUSE ─────────────────────────────────────
  "cdl-classes-endorsements": {
    caption: "Three CDL classes by vehicle weight and use, plus the endorsement letters that add privileges. Carry only what your operation needs, and only haul what your endorsements cover.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Compare columns={[
          { title: "Class A", sub: "most over-the-road freight", tone: "navy", items: ["Combination over 26,001 lb GCWR", "Towing a unit over 10,000 lb", "Tractor-trailers, doubles, tankers"] },
          { title: "Class B", tone: "neutral", items: ["Single vehicle 26,001 lb or more", "Or towing a unit under 10,000 lb", "Straight trucks, large buses"] },
          { title: "Class C", tone: "neutral", items: ["Smaller vehicle, under A/B weights", "Placarded hazmat, or 16+ passengers"] },
        ]} />
        <Note tone="info"><strong>Endorsements:</strong> H hazmat · N tank · X tank + hazmat · T doubles/triples · P passenger · S school bus. You may hold only one CDL, from your home state.</Note>
      </div>
    ),
  },
  "clearinghouse-return-to-duty-cycle": {
    caption: "The return-to-duty process after a drug/alcohol violation is a fixed sequence. You stay prohibited from safety-sensitive driving until the whole chain is complete.",
    body: (
      <Steps items={[
        { title: "Violation recorded", sub: "You are prohibited from safety-sensitive functions", tone: "danger" },
        { title: "Evaluation by a Substance Abuse Professional (SAP)" },
        { title: "Complete the SAP-prescribed education / treatment" },
        { title: "Pass a return-to-duty test", sub: "negative result required" },
        { title: "Follow-up testing", sub: "minimum 6 unannounced tests in 12 months (program can run up to 5 years)", tone: "gold" },
      ]} />
    ),
  },
  "disqualification-offense-matrix": {
    caption: "Disqualification periods are set by 49 CFR 383.51. Your driving record — on AND off the clock — is your livelihood.",
    body: (
      <Matrix
        headers={["Offense type", "Disqualification"]}
        rows={[
          { tone: "danger", cells: ["Major offense (DUI, refusing a test, leaving the scene, felony use of a CMV, driving on a revoked CDL, fatal negligent operation)", "≥ 1 year (3 years if hauling placarded hazmat); 2nd major = LIFETIME"] },
          { tone: "warning", cells: ["Serious traffic violation (15+ over, reckless, erratic lane changes, following too close, phone/texting in a CMV, no CDL on you, tied to a fatal crash)", "1st: not disqualifying · 2nd within 3 yr = 60 days · 3rd within 3 yr = 120 days"] },
          { tone: "warning", cells: ["Out-of-service-order violation", "1st: 90 days to 1 year (180 days–2 years if hazmat/passengers); repeats = multiple years"] },
          { tone: "info", cells: ["Railroad-grade-crossing violation", "1st: ≥ 60 days · 2nd within 3 yr: ≥ 120 days · 3rd within 3 yr: ≥ 1 year"] },
        ]}
      />
    ),
  },
  "cdl-medical-disqualification-paths": {
    caption: "Three different ways you can lose the wheel — each has its own cause and its own way back. Don't confuse a medical downgrade (paperwork) with a 383.51 disqualification (penalty) or a Clearinghouse stop (drug/alcohol).",
    body: (
      <Compare columns={[
        { title: "Medical downgrade", sub: "med card lapsed", tone: "neutral", items: ["Administrative, not a penalty", "Get a new DOT physical", "Submit the med card to your state", "CDL restored — no waiting period"] },
        { title: "383.51 disqualification", sub: "an offense penalty", tone: "neutral", items: ["Triggered by a disqualifying offense", "90 days → 1 year → lifetime by severity", "Serve the period", "Reinstatement process at the end"] },
        { title: "Clearinghouse prohibition", sub: "drug/alcohol violation", tone: "neutral", items: ["Prohibited from safety-sensitive driving", "SAP evaluation + treatment", "Pass a return-to-duty test", "Follow-up testing (up to 5 years)"] },
      ]} />
    ),
  },

  // ── HUMAN TRAFFICKING ─────────────────────────────────────────────────
  "trafficking-warning-signs-pattern": {
    caption: "No single sign confirms trafficking — look for the PATTERN. Several of these together is the signal to report (and a minor in commercial sex is always trafficking).",
    body: (
      <IconGrid items={[
        { glyph: "1", label: "Not free to come and go — controlled by another person" },
        { glyph: "2", label: "Lacks their own ID or documents (someone else holds them)" },
        { glyph: "3", label: "Appears coached or fearful, not allowed to speak for themselves" },
        { glyph: "4", label: "Signs of abuse, malnourishment, or branding tattoos" },
        { glyph: "5", label: "A minor involved in commercial sex — ALWAYS trafficking" },
      ]} />
    ),
  },
  "trafficking-reporting-workflow": {
    caption: "Recognize, report, do NOT engage. Your job is to notice and call from a safe place — not to confront, rescue, or investigate. Trained responders take it from there.",
    body: (
      <Steps items={[
        { title: "Notice the pattern", sub: "not free to move, no documents, coached, fearful, branding" },
        { title: "Stay back, stay safe", sub: "do NOT confront, rescue, or engage", tone: "danger" },
        { title: "Note details quietly", sub: "descriptions, vehicle / plate, location, time" },
        { title: "Call from a safe place", sub: "National Hotline 1-888-373-7888, or text HELP to 233733", tone: "gold" },
        { title: "If someone is in immediate danger", sub: "call 911", tone: "danger" },
        { title: "Let trained responders take it from there", tone: "success" },
      ]} />
    ),
  },

  // ── HAZMAT / HAZCOM ───────────────────────────────────────────────────
  "hazmat-table1-vs-table2-decision-tree": {
    caption: "When do you placard? The most dangerous materials (Table 1) require placards in ANY amount; most other hazmat (Table 2) only once the load reaches 1,001 lb aggregate.",
    body: (
      <FlowDown nodes={[
        { kind: "start", text: "You have a hazmat load — does it need placards?" },
        { kind: "decision", text: "Is it a Table 1 material? (certain explosives, poison-inhalation gas, and the like)", failText: "Not Table 1 — check Table 2 below" },
        { kind: "go", text: "Placard it — in ANY amount" },
        { kind: "decision", text: "Table 2 material at 1,001 lb or more aggregate gross weight?", failText: "Under 1,001 lb — no placard required" },
        { kind: "go", text: "Placard required (1,001 lb threshold)" },
      ]} />
    ),
  },
  "hazmat-parking-distances": {
    caption: "The setback distances a placarded hazmat load keeps on the road (49 CFR Part 397). The 300-ft rule covers explosives near bridges, tunnels, and dwellings — and any hazmat near an open fire.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Bars items={[
          { label: "Off the traveled road", value: 5, max: 300, valueLabel: "5 ft" },
          { label: "No smoking within", value: 25, max: 300, valueLabel: "25 ft" },
          { label: "Explosives from bridges / tunnels / dwellings", value: 300, max: 300, valueLabel: "300 ft", highlight: true },
          { label: "Any hazmat from an open fire", value: 300, max: 300, valueLabel: "300 ft", highlight: true },
        ]} />
        <Note tone="warning"><strong>Attend explosives at all times.</strong> A Division 1.1/1.2/1.3 load is never left unattended. Mark a stop near explosives or flammables with reflective triangles, never burning flares or fusees.</Note>
      </div>
    ),
  },
  "hazmat-shipping-paper-anatomy": {
    caption: "The hazmat shipping paper's basic description, in order: UN ID number, proper shipping name, hazard class, and packing group — plus quantity, an emergency phone, and the shipper's certification. Find the UN number first; it's your key to the ERG.",
    body: (
      <div className="overflow-hidden rounded-lg border border-[rgba(10,37,64,0.12)] bg-white">
        <div className="bg-[#0A2540] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#C5A572]">Basic description (read in this order)</div>
        <ol className="m-0 flex flex-col p-0">
          {[
            ["UN ID number", "UN 1203", "your key to the ERG"],
            ["Proper shipping name", "Gasoline", ""],
            ["Hazard class", "Class 3", "flammable liquid"],
            ["Packing group", "PG II", "I = high, II = medium, III = low danger"],
          ].map(([k, v, note], i) => (
            <li key={i} className="flex items-center gap-2 border-b border-[rgba(10,37,64,0.06)] px-3 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FAEEDA] text-[10px] font-bold text-[#BA7517]">{i + 1}</span>
              <span className="w-[120px] shrink-0 text-[11.5px] font-semibold text-[#0A2540]">{k}</span>
              <span className="rounded bg-[#F5EEE0] px-2 py-0.5 font-mono text-[11px] text-[#0A2540]">{v}</span>
              {note && <span className="text-[10.5px] italic leading-tight text-[#6B7685]">{note}</span>}
            </li>
          ))}
          <li className="flex flex-col gap-0.5 px-3 py-1.5 text-[11px] text-[#3A4A5F]">
            <span>+ Quantity, an <strong>emergency-response phone number</strong>,</span>
            <span>+ the <strong>shipper&apos;s certification</strong> that it&apos;s properly classified, packed, marked, and labeled.</span>
          </li>
        </ol>
      </div>
    ),
  },
  "hazard-communication-systems-comparison": {
    caption: "The same drum, two different systems: a GHS workplace label (OSHA HazCom / WHMIS) governs it sitting on the dock; DOT transport placards govern it once it's a load on the trailer. Keep them straight.",
    body: (
      <Compare columns={[
        { title: "WORKPLACE — HazCom / WHMIS", sub: "the drum on the dock", tone: "navy", items: ["GHS supplier label on the container", "Red-bordered diamond pictograms", "Signal word (Danger / Warning)", "Product name + hazard statements", "Backed by a Safety Data Sheet (SDS)"] },
        { title: "TRANSPORT — DOT placards", sub: "the load on the trailer", tone: "navy", items: ["Large diamond placard on the vehicle", "Hazard-class number at the bottom", "UN ID number on / beside it", "Backed by the shipping paper + ERG", "Governed by 49 CFR (HMR / TDG)"] },
      ]} />
    ),
  },
  "nfpa-704-diamond": {
    caption: "The NFPA 704 fire diamond on a tank, building, or storage room rates a chemical for emergency responders: blue health, red flammability, yellow instability, each 0 (minimal) to 4 (severe); the white box flags special hazards (OX oxidizer, W water-reactive). It is a fixed-facility marking, not a GHS workplace label and not a DOT transport placard.",
    body: (
      <div className="flex flex-wrap items-center justify-center gap-5 py-1">
        <svg viewBox="0 0 100 100" className="h-[124px] w-[124px]" role="img" aria-label="NFPA 704 fire diamond: blue health, red flammability, yellow instability, white special hazard">
          <polygon points="50,3 73,26 50,49 27,26" fill="#D32F2F" />
          <polygon points="3,50 26,27 49,50 26,73" fill="#1450A0" />
          <polygon points="97,50 74,27 51,50 74,73" fill="#F2C200" />
          <polygon points="50,97 73,74 50,51 27,74" fill="#FFFFFF" />
          <polygon points="50,3 97,50 50,97 3,50" fill="none" stroke="#0A2540" strokeWidth="1.6" />
          <line x1="26.5" y1="26.5" x2="73.5" y2="73.5" stroke="#0A2540" strokeWidth="0.6" />
          <line x1="73.5" y1="26.5" x2="26.5" y2="73.5" stroke="#0A2540" strokeWidth="0.6" />
          <text x="50" y="31" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#FFFFFF">3</text>
          <text x="25" y="55" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#FFFFFF">2</text>
          <text x="75" y="55" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#0A2540">0</text>
          <text x="50" y="80" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0A2540">OX</text>
        </svg>
        <div className="flex flex-col gap-1.5 text-[11.5px] text-[#3A4A5F]">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#1450A0" }} /> <strong>Blue</strong> — health (0&ndash;4)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#D32F2F" }} /> <strong>Red</strong> — flammability (0&ndash;4)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#F2C200" }} /> <strong>Yellow</strong> — instability (0&ndash;4)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border border-[#0A2540]" style={{ background: "#FFFFFF" }} /> <strong>White</strong> — special: OX, W</span>
        </div>
      </div>
    ),
  },
  "sds-sections-quick-reference": {
    caption: "Every Safety Data Sheet has 16 sections in a fixed order — so you can find what you need fast. The ones a driver or dock worker reaches for first:",
    body: (
      <Steps numbered={false} items={[
        { title: "Section 1 — Identification", sub: "what it is, supplier, emergency phone" },
        { title: "Section 2 — Hazards", sub: "what it can do" },
        { title: "Section 4 — First-aid measures", sub: "skin, eye, inhalation, ingestion", tone: "danger" },
        { title: "Section 6 — Accidental release", sub: "what to do for a spill" },
        { title: "Section 7 — Handling and storage" },
        { title: "Section 8 — Exposure controls / PPE" },
      ]} />
    ),
  },

  // ── PRE-TRIP / CARGO / REEFER ─────────────────────────────────────────
  "cargo-void-space-dynamics": {
    caption: "Void space is the silent killer. A pallet floating behind the headboard slides forward in a hard stop (the 0.8 g forward force) and hits the straps with far more energy than they're rated for. Block and brace tight, fill the gap with dunnage.",
    body: (
      <Compare columns={[
        { title: "Void space — DANGER", sub: "gap behind the headboard", tone: "bad", items: ["Pallet sits ~2 ft off the headboard", "In a 0.8 g hard stop it slides forward and accelerates through the gap", "Hits the straps / headboard with built-up force", "Can punch through a 'strapped' load"] },
        { title: "Blocked & braced — SECURE", sub: "gap filled", tone: "good", items: ["Pallet tight against the headboard", "Dunnage / blocking fills every void", "Nothing can build forward momentum", "A braced load can need fewer tiedowns (393.110)"] },
      ]} />
    ),
  },
  "reefer-pre-cool-timeline": {
    caption: "A reefer HOLDS temperature; it doesn't pull a warm load down quickly. So pre-cool the empty box to the shipper's setpoint BEFORE loading — load into a warm box and the product warms up while the unit struggles to catch up, and that's how a cold-chain claim starts.",
    body: (
      <Compare columns={[
        { title: "Load into a WARM box", tone: "bad", items: ["Box never pre-cooled", "Reefer can't pull the load down fast", "Product warms while the unit struggles to catch up", "Cold-chain claim risk"] },
        { title: "PRE-COOLED box", tone: "good", items: ["Empty trailer cooled to the setpoint first", "Product stays at spec from the start", "Run the mode the load calls for", "Clean temperature trace"] },
      ]} />
    ),
  },
  "reefer-danger-zone": {
    caption: "The FDA danger zone: refrigerated food held between 40°F and 140°F grows bacteria fast. Once a fresh load climbs above its spec into that band, every minute counts — which is why a reefer breakdown is a call-dispatch-now event, not a wait-and-see.",
    body: (
      <Track height={52} segments={[
        { w: 4, label: "Cold / frozen", sub: "below 40°F", fill: C.navy700 },
        { w: 10, label: "DANGER ZONE", sub: "40°F – 140°F: bacteria multiply fast", fill: C.danger },
        { w: 3, label: "Hot-held", sub: "above 140°F", fill: C.warning },
      ]} />
    ),
  },

  // ── ON-ROAD SAFETY ────────────────────────────────────────────────────
  "stopping-distance-55mph-breakdown": {
    caption: "A loaded truck at 55 mph needs about 400+ feet to stop — longer than a football field. Perception + reaction + braking all add up. And counter-intuitively, an EMPTY truck needs MORE braking distance, not less (less weight = less tire traction).",
    body: (
      <div className="flex flex-col gap-2.5">
        <Track title="Total stopping distance at 55 mph (loaded) ≈ 400+ ft" segments={[
          { w: 140, label: "Perception", sub: "~140 ft (1.75 s)", fill: C.navy100, fg: C.navy },
          { w: 60, label: "Reaction", sub: "~60 ft (¾ s)", fill: C.gold, fg: C.navy },
          { w: 200, label: "Braking", sub: "200+ ft", fill: C.navy700 },
        ]} />
        <Note tone="warning"><strong>Empty truck:</strong> needs <em>more</em> braking distance than loaded — less weight presses the tires into the road, so they grip less and lock more easily.</Note>
      </div>
    ),
  },
  "adverse-weather-speed-reduction": {
    caption: "A CDL rule of thumb for cutting speed as the road gets worse: wet, reduce about a third; packed snow, cut by half or more; ice, slow to a crawl and stop as soon as you safely can. (Shown from a 55 mph baseline.)",
    body: (
      <Bars items={[
        { label: "Dry (baseline)", value: 55, max: 55, valueLabel: "55 mph" },
        { label: "Wet — cut ~1/3", value: 37, max: 55, valueLabel: "~37 mph" },
        { label: "Packed snow — cut ~1/2", value: 27, max: 55, valueLabel: "~27 mph" },
        { label: "Ice", value: 5, max: 55, valueLabel: "crawl / stop", highlight: true },
      ]} />
    ),
  },
  "visibility-speed-matching-fog": {
    caption: "Match your speed to what you can SEE. Your stopping distance has to fit inside your sight distance. At 55 mph you need ~400+ ft to stop — so if fog cuts your view to a couple hundred feet, you cannot safely run that speed. Slow until you could stop within what you can see.",
    body: (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-[120px] shrink-0 text-right text-[11.5px] text-[#3A4A5F]">What you can SEE (fog)</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-[#F5EEE0]">
            <div className="absolute left-0 top-0 h-full rounded bg-[#B07A1A]" style={{ width: "50%" }} />
          </div>
          <span className="w-[58px] shrink-0 text-[11px] font-semibold text-[#B07A1A]">~200 ft</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-[120px] shrink-0 text-right text-[11.5px] text-[#3A4A5F]">Stop distance @ 55 mph</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-[#F5EEE0]">
            <div className="absolute left-0 top-0 h-full rounded bg-[#9B2C2C]" style={{ width: "100%" }} />
          </div>
          <span className="w-[58px] shrink-0 text-[11px] font-semibold text-[#9B2C2C]">400+ ft</span>
        </div>
        <Note tone="danger">You need twice the distance you can see → <strong>slow down</strong> until your stopping distance fits inside your sight distance. &quot;Don&apos;t overdrive your headlights&quot; is the same rule at night.</Note>
      </div>
    ),
  },
  "brake-failure-vs-transmission-failure-decision-tree": {
    caption: "On a grade, the wrong first move costs seconds you don't have. Sort the failure first: a spongy brake pedal vs a jammed transmission call for different first steps.",
    body: (
      <Compare columns={[
        { title: "Brake failure (spongy pedal)", tone: "neutral", items: ["Downshift to a lower gear", "Use the engine brake / retarder", "Pump hydraulic brakes to build pressure (if equipped)", "Aim for the runaway-truck escape ramp"] },
        { title: "Transmission jammed (can't downshift)", tone: "neutral", items: ["Do NOT burn seconds fighting for a gear", "Go straight to the parking/emergency brake (firm, steady)", "Aim for the escape ramp", "On a steep grade those seconds are the margin"] },
      ]} />
    ),
  },

  // ── WEIGHTS / ROUTING ─────────────────────────────────────────────────
  "registered-vs-legal-weight-trap": {
    caption: "The registered-weight trap: you can be LEGAL on the scale (under 80,000 lb gross, every axle in limits) and still be OVER your IRP cab-card registered weight — which is a citation. They are two separate limits.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Bars items={[
          { label: "Federal gross ceiling", value: 80000, max: 80000, valueLabel: "80,000 lb" },
          { label: "You scale at", value: 78000, max: 80000, valueLabel: "78,000 lb" },
          { label: "IRP registered wt.", value: 76000, max: 80000, valueLabel: "76,000 lb", highlight: true },
        ]} />
        <Note tone="danger">78,000 lb is under the federal 80,000 lb limit, but <strong>OVER the cab-card&apos;s 76,000 lb registered weight = citation.</strong> Know and obey both.</Note>
      </div>
    ),
  },
  "bridge-formula-axle-spacing": {
    caption: "The Federal Bridge Formula ties allowable weight to the SPACING between axles — axles closer together can carry less. You can't memorize the formula; the scale ticket or a bridge-formula calculator tells you whether you're legal.",
    body: (
      <Compare columns={[
        { title: "Axles CLOSE together", tone: "bad", items: ["Less spacing between axles", "Bridge formula allows LESS weight", "Same axle weights can violate the formula even when each axle is under its own limit"] },
        { title: "Axles FARTHER apart", tone: "good", items: ["More spacing between axles", "Bridge formula allows MORE weight", "Sliding the tandems changes this spacing — re-check after every slide"] },
      ]} />
    ),
  },

  // ── FRAUD ─────────────────────────────────────────────────────────────
  "fraud-broker-verification-flowchart": {
    caption: "Verification is a GATE — clear every check before you commit to the load. Any STOP is a reason to walk away.",
    body: (
      <FlowDown nodes={[
        { kind: "start", text: "Got a load offer — verify BEFORE you commit" },
        { kind: "decision", text: "Broker authority ACTIVE on FMCSA SAFER (by USDOT)?", failText: "STOP — don't haul it" },
        { kind: "decision", text: "BMC-84 broker bond on file ($75K min)?", failText: "STOP — don't haul it" },
        { kind: "decision", text: "Call the number on the FMCSA record — does it confirm the load + match who pays you?", failText: "STOP — possible spoof / double-broker" },
        { kind: "go", text: "Checks pass → accept the load" },
      ]} />
    ),
  },
  "real-vs-spoofed-broker": {
    caption: "Same load board, two very different offers. The legitimate deal answers your questions and matches everywhere; the scam pressures you, uses a free email and an off-record phone, and the names don't line up.",
    body: (
      <Compare columns={[
        { title: "Legitimate broker", tone: "good", items: ["Company name matches on email, rate con, and BOL", "Corporate email domain", "Phone matches the FMCSA SAFER record", "Answers your verification questions", "Market-rate offer, professional paperwork"] },
        { title: "Spoofed / fraud", tone: "bad", items: ["Free email domain (Gmail / Yahoo)", "Rate too good to be true", "Company name doesn't match the BOL", "Pressure to decide fast / same-day pickup", "Phone not on SAFER; sloppy formatting"] },
      ]} />
    ),
  },

  // ── DETENTION / OPERATIONAL ───────────────────────────────────────────
  "detention-timeline": {
    caption: "Detention is paid on PROOF — a timestamped record. Free time (set by your rate confirmation) is non-billable; billable detention is the wait beyond it. Note every time as it happens, not from memory.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Track segments={[
          { w: 1, label: "Arrive (gate)", sub: "timestamp", fill: C.navy700 },
          { w: 2, label: "Free time", sub: "non-billable (per rate con)", fill: C.cream3, fg: C.fg },
          { w: 3, label: "BILLABLE detention", sub: "wait beyond free time", fill: C.goldDark },
          { w: 1, label: "Depart", sub: "timestamp", fill: C.navy700 },
        ]} />
        <Note tone="info">Billable detention = (departure − arrival) − free time. Not all waiting bills the same — early arrival and dock holds may not count, so check the rate con.</Note>
      </div>
    ),
  },
  "accessorial-preauth-flowchart": {
    caption: "The receipt alone is not enough. Get authorization BEFORE you incur any accessorial — an unauthorized charge often gets denied no matter what receipt you have.",
    body: (
      <FlowDown nodes={[
        { kind: "start", text: "Accessorial needed (lumper / detention / scale)" },
        { kind: "action", text: "BEFORE paying, text dispatch: 'Receiver requires $X — OK to pay?'" },
        { kind: "decision", text: "Approved?", failText: "Don't pay — escalate / refuse the charge" },
        { kind: "action", text: "Incur the charge, get the receipt" },
        { kind: "go", text: "Keep the receipt AND the approval → upload with the BOL" },
      ]} />
    ),
  },
  "cargo-theft-red-zone": {
    caption: "The riskiest window is right after pickup. A large share of cargo theft happens at unsecured parking within the first hours and roughly the first 200 miles — the 'red zone.' Fuel and stage so you clear it before your first long stop.",
    body: (
      <div className="flex flex-col gap-2">
        <Track segments={[
          { w: 4, label: "0–4 h / first ~200 mi", sub: "HIGHEST theft risk", fill: C.danger },
          { w: 4, label: "declining risk", fill: C.warning },
          { w: 5, label: "out of the red zone", fill: C.success },
        ]} />
        <Note tone="warning">Get out of the red zone before your first long stop — don&apos;t park a fresh load right next to the shipper.</Note>
      </div>
    ),
  },
  "check-call-cadence": {
    caption: "Visibility is part of the job on an SRL load. Confirm at pickup, give a daily update in transit, confirm at delivery — and call IMMEDIATELY on any delay, breakdown, or exception. Every call: location, ETA, and the issue.",
    body: (
      <Steps numbered={false} items={[
        { title: "Pickup", sub: "departure call — location + ETA", tone: "success" },
        { title: "Daily in transit", sub: "location, ETA, any issues" },
        { title: "Delivery", sub: "confirm delivered", tone: "success" },
        { title: "On ANY delay / breakdown / detention", sub: "call immediately — location, ETA, the issue", tone: "danger" },
      ]} />
    ),
  },
  "coercion-recognition": {
    caption: "Coercion rarely uses the word 'coercion' — it sounds like a threat to your pay, job, or future loads to push you past the rules. Recognize it, and you can report it (FMCSA NCCDB, within 90 days).",
    body: (
      <div className="flex flex-col gap-2.5">
        <ul className="flex flex-col gap-1.5">
          {[
            "\"You won't get another load from us if you don't roll tonight.\"",
            "\"Other drivers make this run — what's your problem?\"",
            "\"If you log it that way, we lose the customer.\"",
            "\"Just tell them you're empty so we can load you again faster.\"",
          ].map((q, i) => (
            <li key={i} className="rounded-lg border-l-[3px] border-l-[#9B2C2C] bg-[#F6E3E3] px-3 py-1.5 text-[12px] italic leading-snug text-[#9B2C2C]">{q}</li>
          ))}
        </ul>
        <Note tone="info"><strong>To report:</strong> FMCSA National Consumer Complaint Database (nccdb.fmcsa.dot.gov) within 90 days — include your name, the coercer&apos;s name, the specific rule, and what was said.</Note>
      </div>
    ),
  },
  "compass-score-factors": {
    caption: "The SRL Compass Score is SRL's own 7-factor carrier rating (not a federal CSA score). Tracking compliance is 15% of it — so keeping the load visible lifts the whole score, and a higher score earns the carrier better freight.",
    body: (
      <Bars unit="%" items={[
        { label: "On-time pickup", value: 20, max: 20 },
        { label: "On-time delivery", value: 20, max: 20 },
        { label: "Tracking compliance", value: 15, max: 20, highlight: true },
        { label: "Claims", value: 15, max: 20 },
        { label: "Communication", value: 10, max: 20 },
        { label: "Document timeliness", value: 10, max: 20 },
        { label: "Acceptance rate", value: 10, max: 20 },
      ]} />
    ),
  },

  // ── ROADSIDE / TRIP-PLANNING ──────────────────────────────────────────
  "inspection-levels-cvsa-scope": {
    caption: "The CVSA North American Standard inspection levels. You're most likely to meet Levels I–III; the higher levels are specialized.",
    body: (
      <Matrix
        headers={["Level", "Scope"]}
        rows={[
          { cells: ["I — Full", "Driver credentials AND a complete vehicle inspection, including underneath"] },
          { cells: ["II — Walk-around", "Driver + vehicle, but only what's checkable without going under"] },
          { cells: ["III — Driver-only", "License, med card, HOS/ELD, shipping papers — no vehicle component"] },
          { tone: "info", cells: ["IV–VIII", "Special (IV), vehicle-only (V), radioactive (VI), jurisdictional (VII), electronic/in-motion (VIII)"] },
        ]}
      />
    ),
  },
  "bridge-clearance-decision-tree": {
    caption: "At a low bridge, don't ease into it and don't 'try it slow.' You hold the primary duty to verify — and if a route puts you under a posted clearance near your height, escalate instead of obey.",
    body: (
      <FlowDown nodes={[
        { kind: "start", text: "Approaching a bridge with a posted clearance" },
        { kind: "decision", text: "Posted clearance comfortably above your ACTUAL height?", failText: "Don't proceed — go to next step" },
        { kind: "go", text: "Proceed with caution" },
        { kind: "action", text: "Brake, pull to the shoulder, STOP — don't guess, don't try it slow" },
        { kind: "decision", text: "Verified clearance is above your height?", failText: "Find an alternate route; notify SRL — do NOT attempt" },
        { kind: "go", text: "Proceed" },
      ]} />
    ),
  },
  "state-height-limits-variance": {
    caption: "There is NO national truck-height limit — federal law sets width (8'6\") but leaves height to the states. Most are around 13'6\", but it ranges up to 14' (and higher in places). Know your state's limit AND your truck's actual height.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Track segments={[
          { w: 6, label: "~13'6\"", sub: "most common", fill: C.navy700 },
          { w: 4, label: "up to 14'+", sub: "higher-limit states", fill: C.gold, fg: C.navy },
        ]} />
        <Note tone="danger">{"A 14' reefer in a 13'6\" state = a height-violation citation. Federal sets width (8'6\") only; height is state-by-state — verify yours."}</Note>
      </div>
    ),
  },
  "truck-vs-consumer-gps-routing": {
    caption: "A consumer app doesn't know your truck. Federal law requires you to operate a safe vehicle (49 CFR 392.7) — meeting that duty means a truck-specific routing tool set to your height, weight, and length.",
    body: (
      <Compare columns={[
        { title: "Consumer GPS", sub: "Google Maps / Waze", tone: "bad", items: ["Doesn't know your height, weight, or length", "Will route you under a low bridge", "Will send you down a no-truck parkway", "Built for cars, not CMVs"] },
        { title: "Truck-specific routing", sub: "CoPilot / Trucker Path / fleet tool", tone: "good", items: ["Set to your actual dimensions + weight", "Avoids low bridges and weight-limited bridges", "Avoids no-truck and restricted zones", "How you satisfy the 392.7 duty"] },
      ]} />
    ),
  },

  // ════ Ship B: bespoke schematics where geometry carries meaning ════
  "hos-constrained-trip-timeline": {
    caption: "Plan the trip against your HOS clock, not just the miles. The 14-hour window holds everything — driving, fueling, waiting, the 30-minute break — and your 11 hours of driving live inside it. Find your parking before the clock runs out, not at the last minute.",
    body: (
      <div className="flex flex-col gap-2.5">
        <Track title="14-hour ON-DUTY window — everything counts against it" segments={[
          { w: 5, label: "Driving", fill: C.navy700 },
          { w: 1, label: "Fuel", fill: C.gold, fg: C.navy },
          { w: 0.7, label: "30-min", sub: "break", fill: C.goldDark },
          { w: 3, label: "Driving", fill: C.navy700 },
          { w: 2, label: "Detention", sub: "still on the clock", fill: C.cream3, fg: C.fg },
          { w: 2.3, label: "Window closes", fill: C.cream2, fg: C.muted },
        ]} />
        <Note tone="warning">Identify parking BEFORE your 11-hour driving limit (and your 14-hour window) run out — running out of hours with nowhere safe to park is the avoidable trap.</Note>
      </div>
    ),
  },
  "backing-fifth-wheel-coupling": {
    caption: "Couple in order — mechanical first, then the lines. Confirm the lock three ways before you trust it: a tug test, the jaws closed on the kingpin shank, and the trailer fully ridden up onto the plate with no gap.",
    body: (
      <Steps items={[
        { title: "Set trailer height + line up square", sub: "the kingpin enters the middle; the trailer rides UP onto the plate, never down" },
        { title: "Back slowly under the kingpin until it locks" },
        { title: "Tug test", sub: "low gear, pull forward against set trailer brakes — it must not separate", tone: "gold" },
        { title: "Visual check: jaws fully closed on the shank, full ride-up, no gap", tone: "gold" },
        { title: "NOW connect the glad-hands + electrical", sub: "after the mechanical lock, so loose lines can't catch or tear" },
        { title: "Raise the landing gear all the way + stow the handle" },
      ]} />
    ),
  },
  "cargo-wll-weakest-link": {
    caption: "A tiedown's real working load limit is its LOWEST-rated part. The strap, the hook, the winch, and the anchor point all count — the weakest one sets the WLL for the whole assembly. Use the marked value, or the 49 CFR 393.108 defaults if it's unmarked.",
    body: (
      <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-1">
        {[
          { n: "Strap / chain", weak: false },
          { n: "Hook / hardware", weak: false },
          { n: "Winch", weak: false },
          { n: "Anchor point", weak: true },
        ].map((c, i, arr) => (
          <React.Fragment key={i}>
            <div className="flex-1 rounded-lg border px-2 py-2 text-center" style={c.weak ? { borderColor: C.danger, background: C.dangerBg } : { borderColor: "rgba(10,37,64,0.14)", background: "#fff" }}>
              <div className="text-[11.5px] font-semibold" style={{ color: c.weak ? C.danger : C.navy }}>{c.n}</div>
              {c.weak && <div className="text-[10px] font-bold uppercase text-[#9B2C2C]">weakest = the WLL</div>}
            </div>
            {i < arr.length - 1 && <span className="hidden text-[#A7AEB8] sm:block">—</span>}
          </React.Fragment>
        ))}
      </div>
    ),
  },
  "tiedown-wll-counting": {
    caption: "How a tiedown counts toward the 50% aggregate WLL (49 CFR 393.106(d)): a strap anchored across to the OPPOSITE side counts its full rating; a strap to a point on the cargo, or back to the same side, counts only half.",
    body: (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[rgba(10,37,64,0.10)] bg-white p-2.5">
          <svg viewBox="0 0 120 70" className="h-[78px] w-full" role="img" aria-label="Strap crossing to the opposite anchor counts full WLL">
            <line x1="6" y1="60" x2="114" y2="60" stroke="#6B7685" strokeWidth="2" />
            <rect x="42" y="30" width="36" height="30" fill="#E2EAF2" stroke="#15365A" strokeWidth="1.5" />
            <polyline points="12,60 12,52 42,30 78,30 108,52 108,60" fill="none" stroke="#BA7517" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="12" cy="60" r="3" fill="#0A2540" />
            <circle cx="108" cy="60" r="3" fill="#0A2540" />
          </svg>
          <span className="text-center text-[11.5px] font-semibold text-[#2F7A4F]">Anchor to opposite anchor &rarr; FULL WLL</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[rgba(10,37,64,0.10)] bg-white p-2.5">
          <svg viewBox="0 0 120 70" className="h-[78px] w-full" role="img" aria-label="Strap to a point on the cargo or back to the same side counts half WLL">
            <line x1="6" y1="60" x2="114" y2="60" stroke="#6B7685" strokeWidth="2" />
            <rect x="42" y="30" width="36" height="30" fill="#E2EAF2" stroke="#15365A" strokeWidth="1.5" />
            <polyline points="12,60 12,52 50,32" fill="none" stroke="#BA7517" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="12" cy="60" r="3" fill="#0A2540" />
            <circle cx="50" cy="32" r="3" fill="#9B2C2C" />
          </svg>
          <span className="text-center text-[11.5px] font-semibold text-[#B07A1A]">To cargo / same side &rarr; HALF WLL</span>
        </div>
      </div>
    ),
  },
  "bol-fields-checklist": {
    caption: "A clean Bill of Lading shows the shipper and consignee, the commodity, the piece + weight count, and signatures with dates and times. Verify the count yourself before you sign — physically count pallets, or note 'per shipper count' on sealed freight.",
    body: (
      <div className="overflow-hidden rounded-lg border border-[rgba(10,37,64,0.14)] bg-white text-[11px]">
        <div className="bg-[#0A2540] px-3 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide text-[#C5A572]">Bill of Lading</div>
        <div className="grid grid-cols-2 divide-x divide-[rgba(10,37,64,0.10)]">
          <div className="px-3 py-2"><div className="text-[10px] font-bold uppercase text-[#BA7517]">Shipper</div><div className="text-[#3A4A5F]">name · address · phone</div></div>
          <div className="px-3 py-2"><div className="text-[10px] font-bold uppercase text-[#BA7517]">Consignee</div><div className="text-[#3A4A5F]">name · address · phone</div></div>
        </div>
        <div className="border-t border-[rgba(10,37,64,0.10)] px-3 py-2"><div className="text-[10px] font-bold uppercase text-[#BA7517]">Commodity</div><div className="text-[#3A4A5F]">description · <strong>pieces + weight</strong> · class <span className="text-[#9B2C2C]">← verify the count before signing</span></div></div>
        <div className="grid grid-cols-2 divide-x divide-[rgba(10,37,64,0.10)] border-t border-[rgba(10,37,64,0.10)]">
          <div className="px-3 py-2"><div className="text-[10px] font-bold uppercase text-[#BA7517]">Pickup signature</div><div className="text-[#3A4A5F]">signed · date · time</div></div>
          <div className="px-3 py-2"><div className="text-[10px] font-bold uppercase text-[#BA7517]">Delivery (POD)</div><div className="text-[#3A4A5F]">signed · date · time · OS&amp;D notes</div></div>
        </div>
      </div>
    ),
  },
  "osd-notation-workflow": {
    caption: "Your signature attests to the load's condition. Sign clean over a problem and the law presumes it arrived perfect — so note the over/short/damage on the receipt, have the receiver acknowledge it, and photograph it BEFORE you sign.",
    body: (
      <Compare columns={[
        { title: "Sign CLEAN over a problem", tone: "bad", items: ["No exception noted", "Receiver doesn't acknowledge", "Law presumes the load arrived in good order", "The claim can land on the carrier (Carmack)"] },
        { title: "NOTE the OS&D, then sign", tone: "good", items: ["Write the over/short/damage on the receipt", "Receiver acknowledges / initials it", "Photograph the issue", "You and the carrier are protected"] },
      ]} />
    ),
  },
  "cat-scale-ticket-reading": {
    caption: "A CAT scale ticket gives three platform weights — steer, drive, trailer-tandem — plus the gross. Check each against its limit before you trust your axle weights.",
    body: (
      <div className="overflow-hidden rounded-lg border border-[rgba(10,37,64,0.14)] bg-white">
        <div className="bg-[#0A2540] px-3 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide text-[#C5A572]">CAT Scale Ticket</div>
        {[
          ["Steer axle", "≤ 20,000 lb"],
          ["Drive axles (tandem)", "≤ 34,000 lb"],
          ["Trailer tandems", "≤ 34,000 lb"],
          ["GROSS", "≤ 80,000 lb"],
        ].map(([k, v], i) => (
          <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-[12px] ${i === 3 ? "border-t-2 border-[#0A2540] font-bold" : "border-t border-[rgba(10,37,64,0.08)]"}`}>
            <span className="font-semibold text-[#0A2540]">{k}</span>
            <span className="rounded bg-[#F5EEE0] px-2 py-0.5 font-mono text-[11px] text-[#0A2540]">{v}</span>
          </div>
        ))}
      </div>
    ),
  },
  "distraction-three-types-venn": {
    caption: "Distraction comes in three forms — and the worst tasks hit all three at once. Texting while anxious about a delivery is visual (eyes off), manual (hands off), and cognitive (mind off) together.",
    body: (
      <svg viewBox="0 0 260 200" className="mx-auto h-auto w-full max-w-[320px]" role="img" aria-label="Three overlapping types of distraction: visual, manual, cognitive">
        <circle cx="100" cy="80" r="62" fill="rgba(10,37,64,0.12)" stroke="#0A2540" strokeWidth="1.5" />
        <circle cx="160" cy="80" r="62" fill="rgba(186,117,23,0.12)" stroke="#BA7517" strokeWidth="1.5" />
        <circle cx="130" cy="130" r="62" fill="rgba(47,122,79,0.12)" stroke="#2F7A4F" strokeWidth="1.5" />
        <text x="74" y="58" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0A2540" fontFamily="Arial, sans-serif">VISUAL</text>
        <text x="74" y="70" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">eyes off road</text>
        <text x="186" y="58" textAnchor="middle" fontSize="11" fontWeight="700" fill="#BA7517" fontFamily="Arial, sans-serif">MANUAL</text>
        <text x="186" y="70" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">hands off wheel</text>
        <text x="130" y="162" textAnchor="middle" fontSize="11" fontWeight="700" fill="#2F7A4F" fontFamily="Arial, sans-serif">COGNITIVE</text>
        <text x="130" y="174" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">mind off drive</text>
        <text x="130" y="100" textAnchor="middle" fontSize="9" fontWeight="700" fill="#9B2C2C" fontFamily="Arial, sans-serif">texting</text>
        <text x="130" y="111" textAnchor="middle" fontSize="7" fill="#9B2C2C" fontFamily="Arial, sans-serif">= all three</text>
      </svg>
    ),
  },
  "dock-safety-hazards": {
    caption: "The dock is someone else's workplace full of moving equipment. The hazards that hurt drivers — and how to beat each one.",
    body: (
      <div className="flex flex-col gap-1.5">
        {[
          ["Falls from the cab / trailer", "Three points of contact, face the equipment, never jump down"],
          ["Trailer creep + early pull-away", "Chock the wheels, engage the dock lock — verify it's on the bumper (a green light isn't proof)"],
          ["Forklift blind spots", "A raised load blocks the operator's view — make eye contact before you cross"],
          ["Carbon monoxide in enclosed docks", "Headache or dizziness = get to fresh air; don't idle in a sealed space"],
          ["Overhead dock doors", "Never stand or walk under a moving door — sensors fail"],
        ].map(([h, f], i) => (
          <div key={i} className="rounded-lg border-l-[3px] border-l-[#BA7517] bg-[#FBF7F0] px-3 py-1.5">
            <div className="text-[12px] font-semibold text-[#9B2C2C]">{h}</div>
            <div className="text-[11.5px] leading-snug text-[#3A4A5F]">{f}</div>
          </div>
        ))}
      </div>
    ),
  },
  "post-accident-test-decision-tree": {
    caption: "When a DOT post-accident drug + alcohol test is required (49 CFR 382.303). A fatality always triggers it; otherwise it takes a citation for a moving violation PLUS an injury treated away from the scene or a vehicle towed for disabling damage.",
    body: (
      <FlowDown nodes={[
        { kind: "start", text: "You were in a crash while operating the CMV" },
        { kind: "decision", text: "Was there a fatality?", failText: "No — check the conditions below" },
        { kind: "go", text: "TEST: alcohol + drugs — always, regardless of any citation" },
        { kind: "decision", text: "Citation for a moving violation AND (someone treated away from the scene OR a vehicle towed for disabling damage)?", failText: "No — no DOT post-accident test required" },
        { kind: "go", text: "TEST: alcohol within 8 hr, drugs within 32 hr" },
      ]} />
    ),
  },
  "warning-device-placement-highway": {
    caption: "Put out your three warning triangles within 10 minutes (49 CFR 392.22). On a TWO-WAY highway: ~10 ft toward approaching traffic, ~100 ft behind, ~100 ft ahead. On a ONE-WAY or divided highway: ~10, 100, and 200 ft, all to the rear toward approaching traffic.",
    body: (
      <svg viewBox="0 0 320 184" className="mx-auto h-auto w-full max-w-[360px]" role="img" aria-label="Warning triangle placement on two-way vs one-way highways">
        <text x="6" y="13" fontSize="10" fontWeight="700" fill="#0A2540" fontFamily="Arial, sans-serif">Two-way highway</text>
        <line x1="10" y1="42" x2="312" y2="42" stroke="#C5A572" strokeWidth="1" strokeDasharray="6 5" />
        <rect x="150" y="34" width="34" height="14" rx="2" fill="#0A2540" />
        <text x="167" y="44" textAnchor="middle" fontSize="7" fill="#FBF7F0" fontFamily="Arial, sans-serif">TRUCK</text>
        <g fill="#9B2C2C">
          <polygon points="136,33 142,44 130,44" /><text x="136" y="57" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">10 ft</text>
          <polygon points="82,33 88,44 76,44" /><text x="82" y="57" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">100 ft</text>
          <polygon points="252,33 258,44 246,44" /><text x="252" y="57" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">100 ft ahead</text>
        </g>
        <text x="6" y="100" fontSize="10" fontWeight="700" fill="#0A2540" fontFamily="Arial, sans-serif">One-way / divided highway</text>
        <line x1="10" y1="130" x2="312" y2="130" stroke="#C5A572" strokeWidth="1" strokeDasharray="6 5" />
        <rect x="244" y="122" width="34" height="14" rx="2" fill="#0A2540" />
        <text x="261" y="132" textAnchor="middle" fontSize="7" fill="#FBF7F0" fontFamily="Arial, sans-serif">TRUCK</text>
        <g fill="#9B2C2C">
          <polygon points="226,121 232,132 220,132" /><text x="226" y="145" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">10 ft</text>
          <polygon points="150,121 156,132 144,132" /><text x="150" y="145" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">100 ft</text>
          <polygon points="70,121 76,132 64,132" /><text x="70" y="145" textAnchor="middle" fontSize="7.5" fill="#3A4A5F" fontFamily="Arial, sans-serif">200 ft</text>
        </g>
        <text x="160" y="172" textAnchor="middle" fontSize="8" fill="#6B7685" fontFamily="Arial, sans-serif">red triangles placed toward approaching traffic</text>
      </svg>
    ),
  },
  "backing-driver-vs-blind-side": {
    caption: "Back toward the DRIVER's (left) side whenever you can — you can see down the length of the trailer out your window. A blind-side (right) back hides the danger zone behind the trailer; avoid it, or use a spotter. G.O.A.L. — Get Out And Look — on every back.",
    body: (
      <svg viewBox="0 0 320 158" className="mx-auto h-auto w-full max-w-[360px]" role="img" aria-label="Driver-side versus blind-side backing visibility">
        <text x="80" y="14" textAnchor="middle" fontSize="10" fontWeight="700" fill="#2F7A4F" fontFamily="Arial, sans-serif">Driver-side (LEFT) back ✓</text>
        <polygon points="20,72 62,42 62,102" fill="rgba(47,122,79,0.14)" stroke="#2F7A4F" strokeWidth="1" />
        <rect x="62" y="57" width="58" height="30" rx="2" fill="#15365A" /><rect x="120" y="62" width="22" height="20" rx="2" fill="#0A2540" />
        <text x="86" y="122" textAnchor="middle" fontSize="8" fill="#2F7A4F" fontFamily="Arial, sans-serif">trailer-rear visible</text>
        <text x="240" y="14" textAnchor="middle" fontSize="10" fontWeight="700" fill="#9B2C2C" fontFamily="Arial, sans-serif">Blind-side (RIGHT) back ✕</text>
        <polygon points="300,72 258,42 258,102" fill="rgba(155,44,44,0.14)" stroke="#9B2C2C" strokeWidth="1" strokeDasharray="4 3" />
        <rect x="200" y="57" width="58" height="30" rx="2" fill="#15365A" /><rect x="178" y="62" width="22" height="20" rx="2" fill="#0A2540" />
        <text x="280" y="122" textAnchor="middle" fontSize="8" fill="#9B2C2C" fontFamily="Arial, sans-serif">hidden zone</text>
        <text x="160" y="150" textAnchor="middle" fontSize="8" fill="#6B7685" fontFamily="Arial, sans-serif">the shaded wedge is what the driver can see from the cab</text>
      </svg>
    ),
  },
  "pre-trip-air-brake-gauges": {
    caption: "The in-cab air-brake test by the numbers (per the CDL manual): the low-air warning must come on before about 60 psi, the spring brakes pop out around 20-45 psi, and the governor cuts in around 100 and cuts out around 120-125 psi.",
    body: (
      <svg viewBox="0 0 320 112" className="mx-auto h-auto w-full max-w-[360px]" role="img" aria-label="Air-brake pressure thresholds">
        <rect x="20" y="52" width="56" height="16" fill="#9B2C2C" />
        <rect x="76" y="52" width="111" height="16" fill="#FBEFD4" />
        <rect x="187" y="52" width="113" height="16" fill="#E6F0E9" />
        <line x1="20" y1="52" x2="300" y2="52" stroke="#0A2540" strokeWidth="1" />
        {([["0", 20], ["30", 76], ["60", 132], ["100", 207], ["125", 254], ["150", 300]] as [string, number][]).map(([n, x], i) => (
          <g key={i}><line x1={x} y1="68" x2={x} y2="74" stroke="#3A4A5F" strokeWidth="1" /><text x={x} y="86" textAnchor="middle" fontSize="8" fill="#3A4A5F" fontFamily="Arial, sans-serif">{n}</text></g>
        ))}
        <text x="48" y="46" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#9B2C2C" fontFamily="Arial, sans-serif">pop-out 20-45</text>
        <text x="132" y="44" textAnchor="middle" fontSize="8" fontWeight="700" fill="#B07A1A" fontFamily="Arial, sans-serif">low-air warn ~60</text>
        <text x="232" y="46" textAnchor="middle" fontSize="8" fontWeight="700" fill="#2F7A4F" fontFamily="Arial, sans-serif">governor 100 to 125</text>
        <text x="160" y="104" textAnchor="middle" fontSize="8" fill="#6B7685" fontFamily="Arial, sans-serif">PSI · leak-down: under 2/3 psi/min released, 3/4 applied</text>
      </svg>
    ),
  },
  "pre-trip-walk-sequence": {
    caption: "Walk the truck the same direction every time so you never skip a side: start at the driver's door, work forward and down that side, around the back and the trailer, up the passenger side, then into the cab for the brake and gauge checks.",
    body: (
      <svg viewBox="0 0 300 150" className="mx-auto h-auto w-full max-w-[340px]" role="img" aria-label="Systematic pre-trip walk-around sequence">
        <rect x="62" y="50" width="178" height="50" rx="4" fill="none" stroke="#15365A" strokeWidth="2" />
        <rect x="40" y="58" width="24" height="34" rx="3" fill="#0A2540" />
        <path d="M52 44 H150 V32 M150 100 V112 H52 V100 M255 50 V100" fill="none" stroke="#C5A572" strokeWidth="1.2" strokeDasharray="5 4" />
        {([["1", 50, 46], ["2", 100, 42], ["3", 160, 42], ["4", 255, 75], ["5", 160, 112], ["6", 100, 112], ["7", 64, 112], ["8", 52, 75]] as [string, number, number][]).map(([n, x, y], i) => (
          <g key={i}><circle cx={x} cy={y} r="9" fill="#BA7517" /><text x={x} y={y + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#FBF7F0" fontFamily="Arial, sans-serif">{n}</text></g>
        ))}
        <text x="150" y="138" textAnchor="middle" fontSize="8" fill="#6B7685" fontFamily="Arial, sans-serif">driver door → front → around back → passenger side → cab</text>
      </svg>
    ),
  },
  "railroad-crossing-45-degree-evacuation": {
    caption: "If you stall on the tracks with a train coming, run TOWARD the oncoming train at about 45 degrees, away from the tracks. Debris flies the way the train is traveling, so running away from the train puts you in its path — 45° toward it keeps you behind the debris.",
    body: (
      <svg viewBox="0 0 300 160" className="mx-auto h-auto w-full max-w-[340px]" role="img" aria-label="45-degree evacuation toward the oncoming train">
        <line x1="10" y1="92" x2="290" y2="92" stroke="#6B7685" strokeWidth="2" />
        <line x1="10" y1="102" x2="290" y2="102" stroke="#6B7685" strokeWidth="2" />
        {[...Array(14)].map((_, i) => (<line key={i} x1={22 + i * 19} y1="88" x2={22 + i * 19} y2="106" stroke="#A7AEB8" strokeWidth="2" />))}
        <rect x="250" y="80" width="40" height="24" rx="3" fill="#0A2540" />
        <text x="270" y="95" textAnchor="middle" fontSize="7" fill="#FBF7F0" fontFamily="Arial, sans-serif">TRAIN</text>
        <path d="M248 92 H232 M238 87 L232 92 L238 97" fill="none" stroke="#9B2C2C" strokeWidth="2" />
        <rect x="120" y="84" width="30" height="16" rx="2" fill="#9B2C2C" />
        <text x="135" y="78" textAnchor="middle" fontSize="7" fill="#9B2C2C" fontFamily="Arial, sans-serif">stalled</text>
        <path d="M132 84 L178 42 M171 44 L178 42 L177 49" fill="none" stroke="#2F7A4F" strokeWidth="3" />
        <text x="182" y="40" fontSize="9" fontWeight="700" fill="#2F7A4F" fontFamily="Arial, sans-serif">45° toward the train</text>
        <text x="150" y="150" textAnchor="middle" fontSize="8" fill="#6B7685" fontFamily="Arial, sans-serif">debris flies the way the train travels — stay behind it</text>
      </svg>
    ),
  },
  "tandem-slider-weight-shift": {
    caption: "Sliding the trailer tandems shifts weight between the drives and the trailer tandems. Tandems too heavy? Slide them BACK to load the drives. Drives too heavy? Slide them FORWARD onto the tandems (~250-400 lb per hole). Sliding the fifth wheel forward loads the steer. Re-check the bridge formula after any slide.",
    body: (
      <svg viewBox="0 0 320 150" className="mx-auto h-auto w-full max-w-[360px]" role="img" aria-label="Trailer tandem slider and fifth-wheel weight shift">
        <rect x="70" y="40" width="220" height="36" rx="3" fill="none" stroke="#15365A" strokeWidth="2" />
        <rect x="20" y="48" width="40" height="28" rx="3" fill="#0A2540" />
        <circle cx="40" cy="86" r="8" fill="#3A4A5F" /><circle cx="58" cy="86" r="8" fill="#3A4A5F" />
        <circle cx="240" cy="86" r="8" fill="#3A4A5F" /><circle cx="262" cy="86" r="8" fill="#3A4A5F" />
        <text x="49" y="110" textAnchor="middle" fontSize="8" fill="#0A2540" fontFamily="Arial, sans-serif">drives</text>
        <text x="251" y="110" textAnchor="middle" fontSize="8" fill="#0A2540" fontFamily="Arial, sans-serif">trailer tandems</text>
        <path d="M232 126 H210 M216 122 L210 126 L216 130" fill="none" stroke="#BA7517" strokeWidth="2" />
        <text x="150" y="130" fontSize="7.5" fill="#BA7517" fontFamily="Arial, sans-serif">forward → weight onto the tandems</text>
        <path d="M276 126 H298 M292 122 L298 126 L292 130" fill="none" stroke="#BA7517" strokeWidth="2" />
        <text x="252" y="142" fontSize="7.5" fill="#BA7517" fontFamily="Arial, sans-serif">back → onto the drives</text>
        <text x="40" y="30" textAnchor="middle" fontSize="7.5" fill="#2F7A4F" fontFamily="Arial, sans-serif">5th wheel fwd → steer</text>
      </svg>
    ),
  },
  "backing-spotter-signals": {
    caption: "Agree on signals before you back, and stop the instant you lose sight of the spotter. A flat raised palm means STOP; hands held apart show how much room is left; a directional point shows which way to bring the trailer.",
    body: (
      <div className="grid grid-cols-3 gap-2">
        {[
          { t: "STOP", d: "flat raised palm", svg: (<g><line x1="20" y1="46" x2="20" y2="22" stroke="#0A2540" strokeWidth="3" /><rect x="13" y="8" width="14" height="13" rx="3" fill="#9B2C2C" /></g>) },
          { t: "ROOM LEFT", d: "hands apart", svg: (<g><line x1="8" y1="28" x2="20" y2="28" stroke="#0A2540" strokeWidth="3" /><line x1="20" y1="28" x2="32" y2="28" stroke="#0A2540" strokeWidth="3" /><line x1="8" y1="22" x2="8" y2="34" stroke="#BA7517" strokeWidth="3" /><line x1="32" y1="22" x2="32" y2="34" stroke="#BA7517" strokeWidth="3" /></g>) },
          { t: "DIRECTION", d: "point the way", svg: (<g><line x1="8" y1="28" x2="30" y2="28" stroke="#0A2540" strokeWidth="3" /><path d="M24 22 L32 28 L24 34" fill="none" stroke="#2F7A4F" strokeWidth="3" /></g>) },
        ].map((s, i) => (
          <div key={i} className="flex flex-col items-center rounded-lg border border-[rgba(10,37,64,0.10)] bg-white px-2 py-2">
            <svg viewBox="0 0 40 52" className="h-12 w-12" role="img" aria-label={s.t}>{s.svg}</svg>
            <div className="text-[11px] font-bold text-[#0A2540]">{s.t}</div>
            <div className="text-center text-[9.5px] text-[#6B7685]">{s.d}</div>
          </div>
        ))}
      </div>
    ),
  },
  "reefer-airflow-circulation": {
    caption: "Airflow keeps the whole load in spec. Keep the return-air bulkhead at the front CLEAR and use the floor channels — don't floor-load solid product over the air chute. Block the bulkhead and you starve the cargo of cold air and create warm hot spots.",
    body: (
      <svg viewBox="0 0 320 134" className="mx-auto h-auto w-full max-w-[360px]" role="img" aria-label="Reefer airflow: clear bulkhead versus blocked">
        <text x="80" y="13" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#2F7A4F" fontFamily="Arial, sans-serif">Clear bulkhead ✓</text>
        <rect x="20" y="22" width="120" height="80" rx="3" fill="none" stroke="#15365A" strokeWidth="1.5" />
        <rect x="22" y="24" width="14" height="76" fill="#E2EAF2" />
        <rect x="50" y="34" width="86" height="56" fill="rgba(197,165,114,0.22)" />
        <path d="M40 30 H132 M132 30 V92 M132 92 H40 M40 92 V30" fill="none" stroke="#2F7A4F" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="60" y="116" textAnchor="middle" fontSize="7.5" fill="#2F7A4F" fontFamily="Arial, sans-serif">air circulates around the load</text>
        <text x="240" y="13" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#9B2C2C" fontFamily="Arial, sans-serif">Blocked ✕</text>
        <rect x="180" y="22" width="120" height="80" rx="3" fill="none" stroke="#15365A" strokeWidth="1.5" />
        <rect x="182" y="24" width="116" height="76" fill="rgba(197,165,114,0.22)" />
        <circle cx="202" cy="42" r="10" fill="rgba(155,44,44,0.5)" /><circle cx="282" cy="84" r="10" fill="rgba(155,44,44,0.5)" />
        <text x="240" y="116" textAnchor="middle" fontSize="7.5" fill="#9B2C2C" fontFamily="Arial, sans-serif">hot spots — air cannot move</text>
      </svg>
    ),
  },
};

// ── Public renderer ─────────────────────────────────────────────────────
export const FIGURE_KEYS = new Set<string>([
  "ghs-pictograms", "dot-placard-classes", "placard-anatomy",
  ...Object.keys(STRUCTURED),
]);

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
    body = <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">{DOT}</div>;
  } else if (figureKey === "placard-anatomy") {
    defaultCaption = "A DOT placard: hazard symbol up top, class number at the bottom point, with the UN ID number nearby (on the placard or an adjacent orange panel).";
    body = <div className="flex justify-center">{PlacardAnatomy()}</div>;
  } else if (STRUCTURED[figureKey]) {
    defaultCaption = STRUCTURED[figureKey].caption;
    body = STRUCTURED[figureKey].body;
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
