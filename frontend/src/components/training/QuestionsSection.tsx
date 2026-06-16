"use client";

// v3.8.ane — SRL Driver Academy T7: quiz-questions array editor for the course
// author. Each question is exactly 4 options + one correct answer + an optional
// explanation (shown to the driver in the post-quiz review). Mirrors the
// LessonsSection controlled-array pattern.

import { ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";

export interface QuestionForm {
  order: number;
  question: string;
  options: string[]; // exactly 4
  correctIndex: number; // 0-3
  explanation: string;
}

export function emptyQuestion(order: number): QuestionForm {
  return { order, question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" };
}

function renumber(list: QuestionForm[]): QuestionForm[] {
  return list.map((q, i) => ({ ...q, order: i + 1 }));
}

const OPTION_LABELS = ["A", "B", "C", "D"];

export function QuestionsSection({ questions, onChange }: { questions: QuestionForm[]; onChange: (q: QuestionForm[]) => void }) {
  const update = (i: number, patch: Partial<QuestionForm>) =>
    onChange(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOption = (i: number, oi: number, value: string) =>
    update(i, { options: questions[i].options.map((o, idx) => (idx === oi ? value : o)) });
  const add = () => onChange(renumber([...questions, emptyQuestion(questions.length + 1)]));
  const remove = (i: number) => onChange(renumber(questions.filter((_, idx) => idx !== i)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(renumber(next));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5A572]">
          Quiz questions <span className="text-gray-500">({questions.length})</span>
        </h3>
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#C5A572] hover:text-[#DAC39C]">
          <Plus size={14} /> Add question
        </button>
      </div>

      {questions.length === 0 ? (
        <p className="text-xs text-gray-500 italic mb-3">No questions yet. Add at least one before publishing. Each question needs exactly four answer options and one correct answer.</p>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.order} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 shrink-0 w-6 h-6 rounded-md bg-[#C5A572]/15 text-[#C5A572] text-xs font-semibold flex items-center justify-center">{q.order}</span>
                <div className="flex-1 min-w-0">
                  <textarea
                    value={q.question}
                    onChange={(e) => update(i, { question: e.target.value })}
                    placeholder="Question text"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-[#C5A572]/60 focus:outline-none mb-2"
                  />
                  <div className="space-y-1.5 mb-2">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${q.order}`}
                          checked={q.correctIndex === oi}
                          onChange={() => update(i, { correctIndex: oi })}
                          className="shrink-0 accent-[#2F7A4F]"
                          title="Mark as the correct answer"
                        />
                        <span className={`shrink-0 w-5 text-xs font-semibold ${q.correctIndex === oi ? "text-[#4ade80]" : "text-gray-500"}`}>{OPTION_LABELS[oi]}</span>
                        <input
                          value={opt}
                          onChange={(e) => setOption(i, oi, e.target.value)}
                          placeholder={`Option ${OPTION_LABELS[oi]}`}
                          className={`flex-1 bg-white/5 border rounded-md px-2.5 py-1.5 text-[13px] text-white placeholder:text-gray-500 focus:outline-none ${q.correctIndex === oi ? "border-[#2F7A4F]/50 focus:border-[#2F7A4F]" : "border-white/10 focus:border-[#C5A572]/60"}`}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mb-2">Select the radio next to the correct answer.</p>
                  <textarea
                    value={q.explanation}
                    onChange={(e) => update(i, { explanation: e.target.value })}
                    placeholder="Explanation (optional) — shown to the driver after they answer"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-[13px] text-white placeholder:text-gray-500 focus:border-[#C5A572]/60 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" title="Move up">
                    <ChevronUp size={15} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" title="Move down">
                    <ChevronDown size={15} />
                  </button>
                  <button type="button" onClick={() => remove(i)}
                    className="p-1 rounded text-gray-400 hover:text-[#F87171] hover:bg-white/10" title="Remove question">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
