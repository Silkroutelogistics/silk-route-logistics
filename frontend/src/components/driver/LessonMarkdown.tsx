"use client";

// v3.8.anp — SRL Driver Academy: rich slide-content renderer.
//
// Renders the curriculum markdown as *designed* blocks instead of a flat text
// dump. The dominant content shape is "**Lead.** body" rule paragraphs (424
// across the courses) — those become scannable rule cards with a gold accent.
// Also handles: intro/plain paragraphs, "- " bullets (gold check list),
// "> " blockquote (muted disclaimer callout), "##"/"###" headings, and inline
// **bold** + *italic*. No raw HTML / dangerouslySetInnerHTML (XSS-safe by
// construction). Canonical §2.1 tokens only (navy #0A2540, gold #C5A572 /
// gold-dark #BA7517, cream #FBF7F0 / cream-2 #F5EEE0).
//
// Shared by the driver lesson player AND the T7 authoring preview, so the
// author sees exactly what the driver sees.

import React from "react";
import { Check, ShieldCheck } from "lucide-react";
import { TrainingFigure, FIGURE_KEYS } from "./TrainingFigure";

// "[[figure:key]]" or "[[figure:key|caption]]" on its own line → an inline-SVG figure.
const FIGURE_RE = /^\[\[figure:\s*([a-z0-9-]+)\s*(?:\|\s*([\s\S]+?))?\]\]$/;

// Inline tokenizer: **bold** then *italic* within the remaining text.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const boldParts = text.split(/\*\*(.+?)\*\*/g); // odd indexes = bold captures
  boldParts.forEach((chunk, bi) => {
    if (bi % 2 === 1) {
      out.push(<strong key={`${keyBase}-b${bi}`} className="font-semibold text-[#0A2540]">{chunk}</strong>);
      return;
    }
    // italic within plain chunk
    const itParts = chunk.split(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g);
    itParts.forEach((seg, ii) =>
      ii % 2 === 1
        ? out.push(<em key={`${keyBase}-i${bi}-${ii}`} className="italic">{seg}</em>)
        : seg && out.push(<React.Fragment key={`${keyBase}-t${bi}-${ii}`}>{seg}</React.Fragment>),
    );
  });
  return out;
}

// "**Lead.** body" → { heading, body }; null if not a leading-bold rule paragraph.
function asRuleCard(paragraph: string): { heading: string; body: string } | null {
  const m = paragraph.match(/^\*\*(.+?)\*\*([.:])?\s+([\s\S]+)$/);
  if (!m) return null;
  const body = m[3].trim();
  if (!body) return null;
  return { heading: m[1].trim(), body };
}

export function LessonMarkdown({ text }: { text: string }) {
  const lines = (text || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let quote: string[] = [];
  let k = 0;

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join(" ").trim();
    const key = `p${k++}`;
    const card = asRuleCard(joined);
    if (card) {
      blocks.push(
        <div key={key} className="rounded-xl border border-[rgba(10,37,64,0.08)] border-l-[3px] border-l-[#BA7517] bg-[#FBF7F0] px-4 py-3 shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
          <div className="text-[13.5px] font-semibold text-[#0A2540] mb-0.5">{card.heading}</div>
          <div className="text-[13.5px] leading-relaxed text-[#3A4A5F]">{renderInline(card.body, key)}</div>
        </div>,
      );
    } else {
      blocks.push(<p key={key} className="text-[14px] leading-relaxed text-[#3A4A5F]">{renderInline(joined, key)}</p>);
    }
    para = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    const key = `u${k++}`;
    blocks.push(
      <ul key={key} className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={`${key}-${i}`} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-[#3A4A5F]">
            <Check size={14} className="mt-[3px] shrink-0 text-[#BA7517]" />
            <span>{renderInline(b, `${key}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const key = `q${k++}`;
    blocks.push(
      <div key={key} className="flex items-start gap-2 rounded-r-md border-l-[3px] border-l-[#C5A572] bg-[#F5EEE0] px-3.5 py-2.5">
        <ShieldCheck size={14} className="mt-[2px] shrink-0 text-[#BA7517]" />
        <p className="text-[11.5px] italic leading-relaxed text-[#6B7685]">{renderInline(quote.join(" "), key)}</p>
      </div>,
    );
    quote = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushBullets(); flushQuote(); continue; }
    const fig = line.trim().match(FIGURE_RE);
    if (fig && FIGURE_KEYS.has(fig[1])) {
      flushPara(); flushBullets(); flushQuote();
      blocks.push(<TrainingFigure key={`f${k++}`} figureKey={fig[1]} caption={fig[2]?.trim()} />);
      continue;
    }
    if (line.startsWith("> ")) { flushPara(); flushBullets(); quote.push(line.slice(2)); continue; }
    if (line.startsWith("- ")) { flushPara(); flushQuote(); bullets.push(line.slice(2)); continue; }
    if (line.startsWith("### ")) {
      flushPara(); flushBullets(); flushQuote();
      const key = `h${k++}`;
      blocks.push(<h4 key={key} className="text-[13.5px] font-semibold text-[#0A2540] pt-1">{renderInline(line.slice(4), key)}</h4>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara(); flushBullets(); flushQuote();
      const key = `h${k++}`;
      blocks.push(<h3 key={key} className="font-serif text-lg text-[#0A2540] pt-1">{renderInline(line.slice(3), key)}</h3>);
      continue;
    }
    flushBullets(); flushQuote();
    para.push(line);
  }
  flushPara(); flushBullets(); flushQuote();

  return <div className="space-y-3">{blocks}</div>;
}
