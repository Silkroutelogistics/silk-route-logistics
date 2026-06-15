"use client";

// v3.8.anb — SRL Driver Academy Sprint T4: dependency-free markdown renderer.
// Renders the exact subset the curriculum uses — paragraphs, **bold** inline,
// "> " blockquote (the disclaimer), "- " bullet lists, "## "/"### " headings.
// No raw HTML / dangerouslySetInnerHTML (XSS-safe by construction); lesson
// content is trusted DB data but we keep it safe regardless.

import React from "react";

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // Odd-indexed split parts are the **bold** captures.
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyBase}-b${i}`} className="font-semibold text-[#0F1117]">{p}</strong>
    ) : (
      <React.Fragment key={`${keyBase}-t${i}`}>{p}</React.Fragment>
    ),
  );
}

export function LessonMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let quote: string[] = [];
  let k = 0;

  const flushPara = () => {
    if (para.length) {
      const key = `p${k++}`;
      blocks.push(<p key={key} className="text-[14px] leading-relaxed text-gray-700 mb-3">{renderInline(para.join(" "), key)}</p>);
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      const key = `u${k++}`;
      blocks.push(
        <ul key={key} className="list-disc pl-5 mb-3 space-y-1 text-[14px] leading-relaxed text-gray-700">
          {bullets.map((b, i) => <li key={`${key}-${i}`}>{renderInline(b, `${key}-${i}`)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      const key = `q${k++}`;
      blocks.push(
        <blockquote key={key} className="border-l-4 border-[#C9A84C] bg-[#C9A84C]/5 pl-3 py-2 mb-3 text-[12px] italic text-gray-500">
          {renderInline(quote.join(" "), key)}
        </blockquote>,
      );
      quote = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushBullets(); flushQuote(); continue; }
    if (line.startsWith("> ")) { flushPara(); flushBullets(); quote.push(line.slice(2)); continue; }
    if (line.startsWith("- ")) { flushPara(); flushQuote(); bullets.push(line.slice(2)); continue; }
    if (line.startsWith("### ")) {
      flushPara(); flushBullets(); flushQuote();
      const key = `h${k++}`;
      blocks.push(<h4 key={key} className="font-semibold text-[#0F1117] text-[14px] mt-3 mb-1">{renderInline(line.slice(4), key)}</h4>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara(); flushBullets(); flushQuote();
      const key = `h${k++}`;
      blocks.push(<h3 key={key} className="font-serif text-[#0F1117] text-lg mt-3 mb-1">{renderInline(line.slice(3), key)}</h3>);
      continue;
    }
    flushBullets(); flushQuote();
    para.push(line);
  }
  flushPara(); flushBullets(); flushQuote();

  return <div>{blocks}</div>;
}
