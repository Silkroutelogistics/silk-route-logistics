"use client";

// v3.8.ane — SRL Driver Academy T7: lessons array editor for the course author.
// Parent owns the lessons[] (CourseEditor); this renders the add/edit/reorder/
// remove controls + a live preview rendered with the SAME LessonMarkdown the
// driver sees, so the AE authors against the real output.

import { useState } from "react";
import { ChevronUp, ChevronDown, Trash2, Plus, Eye, EyeOff } from "lucide-react";
import { LessonMarkdown } from "@/components/driver/LessonMarkdown";

export interface LessonForm {
  order: number;
  title: string;
  bodyMarkdown: string;
  estMinutes: number;
}

export function emptyLesson(order: number): LessonForm {
  return { order, title: "", bodyMarkdown: "", estMinutes: 5 };
}

// Re-number 1..N so `order` always matches array position (the backend accepts
// any unique positive orders, but sequential is cleanest + matches the player).
function renumber(list: LessonForm[]): LessonForm[] {
  return list.map((l, i) => ({ ...l, order: i + 1 }));
}

export function LessonsSection({ lessons, onChange }: { lessons: LessonForm[]; onChange: (l: LessonForm[]) => void }) {
  const [preview, setPreview] = useState<number | null>(null);

  const update = (i: number, patch: Partial<LessonForm>) =>
    onChange(lessons.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const add = () => onChange(renumber([...lessons, emptyLesson(lessons.length + 1)]));
  const remove = (i: number) => onChange(renumber(lessons.filter((_, idx) => idx !== i)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= lessons.length) return;
    const next = [...lessons];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(renumber(next));
  };

  const totalMin = lessons.reduce((s, l) => s + (l.estMinutes || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5A572]">
          Lessons <span className="text-gray-500">({lessons.length}{totalMin ? ` · ~${totalMin} min` : ""})</span>
        </h3>
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#C5A572] hover:text-[#DAC39C]">
          <Plus size={14} /> Add lesson
        </button>
      </div>

      {lessons.length === 0 ? (
        <p className="text-xs text-gray-500 italic mb-3">No lessons yet. Add at least one before publishing.</p>
      ) : (
        <div className="space-y-3">
          {lessons.map((l, i) => (
            <div key={l.order} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 shrink-0 w-6 h-6 rounded-md bg-[#C5A572]/15 text-[#C5A572] text-xs font-semibold flex items-center justify-center">{l.order}</span>
                <div className="flex-1 min-w-0">
                  <input
                    value={l.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    placeholder="Lesson title"
                    className="w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-[#C5A572]/60 focus:outline-none mb-2"
                  />
                  <textarea
                    value={l.bodyMarkdown}
                    onChange={(e) => update(i, { bodyMarkdown: e.target.value })}
                    placeholder="Lesson body — markdown supported: ## heading, **bold**, > quote, - bullet"
                    rows={5}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-[13px] text-white placeholder:text-gray-500 focus:border-[#C5A572]/60 focus:outline-none font-mono leading-relaxed"
                  />
                  <div className="flex items-center gap-3 mt-2">
                    <label className="text-[11px] text-gray-400 flex items-center gap-1.5">
                      Est. min
                      <input
                        type="number" min={0} max={600}
                        value={l.estMinutes}
                        onChange={(e) => update(i, { estMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-[#C5A572]/60 focus:outline-none"
                      />
                    </label>
                    <button type="button" onClick={() => setPreview(preview === l.order ? null : l.order)}
                      className="text-[11px] text-gray-400 hover:text-[#C5A572] inline-flex items-center gap-1">
                      {preview === l.order ? <EyeOff size={12} /> : <Eye size={12} />} {preview === l.order ? "Hide preview" : "Preview"}
                    </button>
                  </div>
                  {preview === l.order && l.bodyMarkdown.trim() && (
                    <div className="mt-2 bg-white rounded-lg p-4 border border-white/10">
                      <LessonMarkdown text={l.bodyMarkdown} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" title="Move up">
                    <ChevronUp size={15} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === lessons.length - 1}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" title="Move down">
                    <ChevronDown size={15} />
                  </button>
                  <button type="button" onClick={() => remove(i)}
                    className="p-1 rounded text-gray-400 hover:text-[#F87171] hover:bg-white/10" title="Remove lesson">
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
