"use client";

// v3.8.anp — SRL Driver Academy: one lesson = one slide (presentational).
// The player (course/page.tsx) owns data + forced-sequential flow; this just
// renders the slide. Keyed on the lesson index by the player so it re-mounts
// and replays the entrance animation on every advance. Canonical §2.1 tokens.

import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { LessonMarkdown } from "./LessonMarkdown";
import { LessonAudio } from "./LessonAudio";
import { courseIcon } from "./courseIcon";

export interface LessonSlideProps {
  category: string;
  slug: string;
  lessonOrder: number;
  lessonTitle: string;
  bodyMarkdown: string;
  estMinutes: number;
  index: number; // 0-based
  total: number;
  furthestReached: number;
  reviewMode: boolean;
  onJump: (i: number) => void;
  onBack: () => void;
  onPrimary: () => void;
  primaryLabel: string; // "Next" | "Go to quiz" | "Finish"
  error?: string | null;
  disclaimer?: string | null;
}

const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#BA7517] px-5 py-2.5 text-[13.5px] font-semibold text-[#FBF7F0] shadow-[0_2px_8px_rgba(186,117,23,0.28)] transition-all hover:bg-[#a3650f] active:scale-[0.98]";

export function LessonSlide(p: LessonSlideProps) {
  const Icon = courseIcon(p.slug, p.category);
  const pct = p.total > 0 ? Math.round(((p.index + 1) / p.total) * 100) : 0;
  const isLast = p.index === p.total - 1;

  return (
    <div className="srl-slide-in">
      {/* dots + lock note */}
      <div className="mb-2 flex items-center gap-1.5">
        {Array.from({ length: p.total }).map((_, i) => {
          const reached = i <= p.furthestReached;
          const cls = `h-1.5 rounded-full transition-all ${
            i === p.index ? "w-6 bg-[#BA7517]" : reached ? "w-3 bg-[#C5A572]" : "w-3 bg-[#EFE6D3]"
          }`;
          return p.reviewMode ? (
            <button key={i} onClick={() => p.onJump(i)} aria-label={`Lesson ${i + 1}`} className={cls} />
          ) : (
            <span key={i} aria-label={`Lesson ${i + 1}`} className={cls} />
          );
        })}
      </div>
      {!p.reviewMode && (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-[#6B7685]">
          <Lock size={11} /> Work through each lesson in order. Free review unlocks once you finish.
        </p>
      )}

      {/* slide card */}
      <article className="overflow-hidden rounded-2xl border border-[rgba(10,37,64,0.08)] bg-white shadow-[0_4px_24px_rgba(10,37,64,0.07)]">
        <div className="h-1.5 bg-[#EFE6D3]">
          <div className="h-full rounded-r-full bg-gradient-to-r from-[#C5A572] to-[#BA7517] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0A2540] text-[#C5A572]">
              <Icon size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#BA7517]">{p.category}</div>
              <div className="text-[11px] text-[#6B7685]">Lesson {p.lessonOrder} of {p.total} · ~{p.estMinutes} min</div>
            </div>
          </div>
          <h2 className="mb-3 font-serif text-[22px] leading-tight text-[#0A2540]">{p.lessonTitle}</h2>
          <div className="mb-4">
            <LessonAudio title={p.lessonTitle} bodyMarkdown={p.bodyMarkdown} />
          </div>
          <LessonMarkdown text={p.bodyMarkdown} />
        </div>
      </article>

      {p.error && (
        <div className="mt-3 rounded-lg border-l-4 border-[#9B2C2C] bg-[#F6E3E3] px-3 py-2 text-xs text-[#9B2C2C]">{p.error}</div>
      )}

      <div className="mt-4 flex items-center justify-between">
        {p.reviewMode ? (
          <button onClick={p.onBack} disabled={p.index === 0}
            className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-[13px] text-[#6B7685] transition-colors hover:bg-[#F5EEE0] disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronLeft size={16} /> Back
          </button>
        ) : <span />}
        <button onClick={p.onPrimary} className={PRIMARY}>
          {p.primaryLabel} <ChevronRight size={16} />
        </button>
      </div>

      {isLast && p.disclaimer && (
        <p className="mt-5 text-[10px] italic leading-relaxed text-[#A7AEB8]">{p.disclaimer}</p>
      )}
    </div>
  );
}
