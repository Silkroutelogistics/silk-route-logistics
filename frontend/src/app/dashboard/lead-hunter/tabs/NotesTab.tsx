"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";

interface CustomerNote {
  id: string;
  noteType: string;
  title: string | null;
  content: string;
  followUpDate: string | null;
  source: string;
  createdByName: string | null;
  createdAt: string;
}

const NOTE_TYPES = [
  { id: "shipping_instruction",  label: "Shipping instruction",  border: "border-blue-400",  bg: "bg-blue-50/30" },
  { id: "receiving_instruction", label: "Receiving instruction", border: "border-teal-400",  bg: "bg-teal-50/30" },
  { id: "customer_preference",   label: "Customer preference",   border: "border-amber-400", bg: "bg-amber-50/30" },
  { id: "operational",           label: "Operational",           border: "border-gray-300",  bg: "bg-white" },
] as const;

type NoteType = (typeof NOTE_TYPES)[number]["id"];

const typeStyle = (t: string) => NOTE_TYPES.find((n) => n.id === t) ?? NOTE_TYPES[3];

interface Props {
  prospectId: string;
}

export function NotesTab({ prospectId }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery<{ notes: CustomerNote[] }>({
    queryKey: ["lead-hunter-notes", prospectId],
    queryFn: () => api.get(`/customers/${prospectId}/notes`).then((r) => r.data),
  });

  const notes = q.data?.notes ?? [];

  return (
    <div className="space-y-3 text-sm">
      {notes.length === 0 && !q.isLoading && !addOpen && (
        <div className="text-center py-6 text-gray-400 text-xs">No notes yet — add your first one below.</div>
      )}

      {notes.map((n) => {
        const style = typeStyle(n.noteType);
        return (
          <div key={n.id} className={`border-l-4 ${style.border} ${style.bg} border-r border-t border-b border-gray-200 rounded-r-lg p-3`}>
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
              <span className="font-medium uppercase tracking-wider">{style.label}</span>
              {n.followUpDate && (
                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                  Follow-up {new Date(n.followUpDate).toLocaleDateString()}
                </span>
              )}
            </div>
            {n.title && <div className="font-medium text-white text-sm">{n.title}</div>}
            <p className="text-sm text-white whitespace-pre-wrap">{n.content}</p>
            <div className="text-[10px] text-gray-500 mt-1.5">
              {n.createdByName && `${n.createdByName} · `}
              {new Date(n.createdAt).toLocaleDateString()}
            </div>
          </div>
        );
      })}

      {!addOpen ? (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:text-[#BA7517] hover:border-[#BA7517] rounded-lg transition"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} /> Add note
        </button>
      ) : (
        <AddNoteForm
          prospectId={prospectId}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); q.refetch(); }}
        />
      )}
    </div>
  );
}

function AddNoteForm({
  prospectId, onClose, onSaved,
}: { prospectId: string; onClose: () => void; onSaved: () => void }) {
  const [noteType, setNoteType] = useState<NoteType>("operational");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.post(`/customers/${prospectId}/notes`, {
        noteType,
        title: title || undefined,
        content,
        followUpDate: followUpDate || undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-900">New note</h4>
        <button onClick={onClose} aria-label="Cancel"><X className="w-4 h-4 text-gray-700" /></button>
      </div>
      <select
        value={noteType}
        onChange={(e) => setNoteType(e.target.value as NoteType)}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
      >
        {NOTE_TYPES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content"
        rows={4}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
      />
      <label className="block">
        <span className="text-[10px] text-gray-500">Follow-up date (optional)</span>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
        />
      </label>
      <button
        disabled={!content || save.isPending}
        onClick={() => save.mutate()}
        className="w-full py-2 bg-[#BA7517] text-white text-sm font-medium rounded hover:bg-[#9a5f12] disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {save.isPending ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}
