"use client";

// v3.8.aom — SRL Driver Academy: ONE question per slide with Duolingo-style
// INSTANT feedback. Flow per question: pick an answer → Check → the answer is
// revealed (correct option turns green, a wrong pick turns red, the explanation
// appears) → Continue. The answer locks once checked. The player owns the answers
// + the per-question checked state + the server check call; the final /quiz submit
// stays the sole pass authority. Canonical §2.1 tokens.

import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle } from "lucide-react";

export interface CheckedResult { correct: boolean; correctIndex: number; explanation: string | null; xp?: number }

export interface QuizSlideProps {
  question: { id: string; question: string; options: string[] };
  index: number; // 0-based
  total: number;
  selected: number | null;
  onSelect: (oi: number) => void;
  checkedResult: CheckedResult | null; // this question's result, if already checked (locks it)
  onCheck: () => void; // player calls the check endpoint + stores the result + awards XP
  checking: boolean;
  onBack: () => void; // index 0 → review lessons; else previous question
  onNext: () => void;
  onSubmit: () => void;
  submitting: boolean;
  passThreshold: number;
  answeredCount: number; // checked count
  error?: string | null;
  staleReload?: boolean;
  onReload?: () => void;
}

const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#BA7517] px-5 py-2.5 text-[13.5px] font-semibold text-[#FBF7F0] shadow-[0_2px_8px_rgba(186,117,23,0.28)] transition-all hover:bg-[#a3650f] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#BA7517]";

export function QuizSlide(p: QuizSlideProps) {
  const isLast = p.index === p.total - 1;
  const pct = p.total > 0 ? Math.round(((p.index + 1) / p.total) * 100) : 0;
  const hasSelection = p.selected !== null && p.selected !== undefined;
  const checked = p.checkedResult;
  const locked = !!checked;

  return (
    <div className="srl-slide-in">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#BA7517]">Knowledge check</span>
        <span className="text-[11px] text-[#6B7685]">{p.answeredCount} of {p.total} checked</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#EFE6D3]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#C5A572] to-[#BA7517] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <article className="rounded-2xl border border-[rgba(10,37,64,0.08)] bg-white p-5 shadow-[0_4px_24px_rgba(10,37,64,0.07)] sm:p-6">
        <div className="mb-1 text-[11px] text-[#6B7685]">Question {p.index + 1} of {p.total} · {p.passThreshold}% to pass</div>
        <p className="mb-5 text-[16px] font-semibold leading-snug text-[#0A2540]">{p.question.question}</p>
        <div className="space-y-2.5">
          {p.question.options.map((opt, oi) => {
            const isSel = p.selected === oi;
            const isCorrectOpt = locked && oi === checked!.correctIndex;
            const isWrongPick = locked && isSel && !checked!.correct;
            // colour: after check → green correct / red wrong-pick / muted; before → selected gold
            let cls: string;
            let badge: string;
            if (isCorrectOpt) { cls = "border-[#2F7A4F] bg-[#E6F0E9] text-[#0A2540]"; badge = "bg-[#2F7A4F] text-[#FBF7F0]"; }
            else if (isWrongPick) { cls = "border-[#9B2C2C] bg-[#F6E3E3] text-[#0A2540]"; badge = "bg-[#9B2C2C] text-[#FBF7F0]"; }
            else if (locked) { cls = "border-[rgba(10,37,64,0.10)] bg-white text-[#A7AEB8]"; badge = "bg-[#F5EEE0] text-[#A7AEB8]"; }
            else if (isSel) { cls = "border-[#BA7517] bg-[#FAEEDA] text-[#0A2540] shadow-[0_2px_10px_rgba(186,117,23,0.14)]"; badge = "bg-[#BA7517] text-[#FBF7F0]"; }
            else { cls = "border-[rgba(10,37,64,0.12)] bg-white text-[#3A4A5F] hover:border-[#C5A572] hover:bg-[#FBF7F0]"; badge = "bg-[#F5EEE0] text-[#6B7685]"; }
            return (
              <button key={oi} onClick={() => !locked && p.onSelect(oi)} disabled={locked}
                className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[14px] transition-all ${locked ? "cursor-default" : "active:scale-[0.99]"} ${cls}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${badge}`}>
                  {isCorrectOpt ? "✓" : isWrongPick ? "✕" : String.fromCharCode(65 + oi)}
                </span>
                <span className="leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>

        {/* instant feedback */}
        {checked && (
          <div className={`srl-slide-in mt-4 rounded-xl border px-4 py-3 ${checked.correct ? "border-[#2F7A4F]/30 bg-[#E6F0E9]" : "border-[#B07A1A]/30 bg-[#FBEFD4]"}`}>
            <div className="flex items-center gap-2">
              {checked.correct
                ? <CheckCircle2 size={18} className="text-[#2F7A4F]" />
                : <XCircle size={18} className="text-[#B07A1A]" />}
              <span className={`text-[14px] font-bold ${checked.correct ? "text-[#2F7A4F]" : "text-[#B07A1A]"}`}>
                {checked.correct ? "Correct!" : "Not quite"}
              </span>
              {checked.correct && checked.xp ? (
                <span className="ml-auto rounded-full bg-[#BA7517] px-2 py-0.5 text-[11px] font-bold text-[#FBF7F0]">+{checked.xp} XP</span>
              ) : null}
            </div>
            {checked.explanation && <p className="mt-1.5 text-[13px] leading-relaxed text-[#3A4A5F]">{checked.explanation}</p>}
          </div>
        )}
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
        {!locked ? (
          <button onClick={p.onCheck} disabled={!hasSelection || p.checking} className={PRIMARY}>
            {p.checking && <Loader2 size={14} className="animate-spin" />} Check
          </button>
        ) : isLast ? (
          <button onClick={p.onSubmit} disabled={p.submitting} className={PRIMARY}>
            {p.submitting && <Loader2 size={14} className="animate-spin" />} See results
          </button>
        ) : (
          <button onClick={p.onNext} className={PRIMARY}>
            Continue <ChevronRight size={16} />
          </button>
        )}
      </div>
      {!locked && !hasSelection && <p className="mt-1.5 text-right text-[11px] text-[#A7AEB8]">Pick an answer, then Check</p>}
    </div>
  );
}
