"use client";

// v3.8.anp — SRL Driver Academy: ONE question per slide (presentational).
// Replaces the old all-questions-stacked "exam" layout. Big tappable answer
// cards, confirm-with-Next (no mis-tap auto-advance), per-slide progress.
// The player owns answers state + server grading; this renders one question.

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export interface QuizSlideProps {
  question: { id: string; question: string; options: string[] };
  index: number; // 0-based
  total: number;
  selected: number | null;
  onSelect: (oi: number) => void;
  onBack: () => void; // index 0 → review lessons; else previous question
  onNext: () => void;
  onSubmit: () => void;
  submitting: boolean;
  passThreshold: number;
  answeredCount: number;
  error?: string | null;
  staleReload?: boolean;
  onReload?: () => void;
}

const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#BA7517] px-5 py-2.5 text-[13.5px] font-semibold text-[#FBF7F0] shadow-[0_2px_8px_rgba(186,117,23,0.28)] transition-all hover:bg-[#a3650f] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#BA7517]";

export function QuizSlide(p: QuizSlideProps) {
  const isLast = p.index === p.total - 1;
  const pct = p.total > 0 ? Math.round(((p.index + 1) / p.total) * 100) : 0;
  const canAdvance = p.selected !== null && p.selected !== undefined;

  return (
    <div className="srl-slide-in">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#BA7517]">Knowledge check</span>
        <span className="text-[11px] text-[#6B7685]">{p.answeredCount} of {p.total} answered</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#EFE6D3]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#C5A572] to-[#BA7517] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <article className="rounded-2xl border border-[rgba(10,37,64,0.08)] bg-white p-5 shadow-[0_4px_24px_rgba(10,37,64,0.07)] sm:p-6">
        <div className="mb-1 text-[11px] text-[#6B7685]">Question {p.index + 1} of {p.total} · {p.passThreshold}% to pass</div>
        <p className="mb-5 text-[16px] font-semibold leading-snug text-[#0A2540]">{p.question.question}</p>
        <div className="space-y-2.5">
          {p.question.options.map((opt, oi) => {
            const on = p.selected === oi;
            return (
              <button key={oi} onClick={() => p.onSelect(oi)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[14px] transition-all active:scale-[0.99] ${
                  on
                    ? "border-[#BA7517] bg-[#FAEEDA] text-[#0A2540] shadow-[0_2px_10px_rgba(186,117,23,0.14)]"
                    : "border-[rgba(10,37,64,0.12)] bg-white text-[#3A4A5F] hover:border-[#C5A572] hover:bg-[#FBF7F0]"
                }`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                  on ? "bg-[#BA7517] text-[#FBF7F0]" : "bg-[#F5EEE0] text-[#6B7685]"
                }`}>{String.fromCharCode(65 + oi)}</span>
                <span className="leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>
      </article>

      {p.error && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border-l-4 border-[#9B2C2C] bg-[#F6E3E3] px-3 py-2 text-xs text-[#9B2C2C]">
          <span>{p.error}</span>
          {p.staleReload && <button onClick={p.onReload} className="shrink-0 font-semibold underline">Reload</button>}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button onClick={p.onBack}
          className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-[13px] text-[#6B7685] transition-colors hover:bg-[#F5EEE0]">
          <ChevronLeft size={16} /> {p.index === 0 ? "Review lessons" : "Back"}
        </button>
        {isLast ? (
          <button onClick={p.onSubmit} disabled={!canAdvance || p.submitting} className={PRIMARY}>
            {p.submitting && <Loader2 size={14} className="animate-spin" />} Submit quiz
          </button>
        ) : (
          <button onClick={p.onNext} disabled={!canAdvance} className={PRIMARY}>
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
      {!canAdvance && <p className="mt-1.5 text-right text-[11px] text-[#A7AEB8]">Pick an answer to continue</p>}
    </div>
  );
}
