"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

const NOTE_TYPES = [
  { id: "internal",             label: "Internal",             border: "border-gray-200" },
  { id: "shipper_requirement",  label: "Shipper requirement",  border: "border-red-300 bg-red-50/30" },
  { id: "carrier_instruction",  label: "Carrier instruction",  border: "border-blue-200 bg-blue-50/30" },
  { id: "rate_note",            label: "Rate note",            border: "border-amber-200 bg-amber-50/30" },
  { id: "pickup_instruction",   label: "Pickup",               border: "border-gray-200" },
  { id: "delivery_instruction", label: "Delivery",             border: "border-gray-200" },
];

const typeStyle = (t: string) =>
  NOTE_TYPES.find((n) => n.id === t)?.border ?? "border-gray-200";

interface Props {
  load: any;
  loadId: string;
  onChange: () => void;
}

export function NotesTab({ load, loadId, onChange }: Props) {
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("internal");

  const create = useMutation({
    mutationFn: async () =>
      (await api.post(`/loads/${loadId}/notes`, { content, noteType })).data,
    onSuccess: () => {
      setContent(""); setNoteType("internal"); onChange();
    },
  });

  const notes: any[] = load.loadNotes ?? [];

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className={`border rounded-lg p-3 ${typeStyle(n.noteType)}`}>
            <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
              <span>{NOTE_TYPES.find((nt) => nt.id === n.noteType)?.label ?? n.noteType}</span>
              <span>{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-gray-900 whitespace-pre-wrap">{n.content}</p>
            {n.createdByName && <div className="text-[10px] text-gray-400 mt-1">{n.createdByName}</div>}
          </div>
        ))}
        {notes.length === 0 && <div className="text-center py-4 text-xs text-gray-400">No notes yet.</div>}
      </div>

      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
        <textarea
          value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note" rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white"
        />
        <div className="flex gap-2">
          <select
            value={noteType} onChange={(e) => setNoteType(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded bg-white"
          >
            {NOTE_TYPES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <button
            disabled={!content || create.isPending}
            onClick={() => create.mutate()}
            className="px-3 py-1.5 text-xs bg-[#BA7517] hover:bg-[#8f5a11] disabled:opacity-40 text-white font-medium rounded"
          >
            {create.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
