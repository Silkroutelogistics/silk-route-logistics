"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X } from "lucide-react";
import type { CrmNote } from "../types";

const NOTE_TYPES = [
  { id: "shipping_instruction",  label: "Shipping instruction",  border: "border-blue-400",  bg: "bg-blue-50/30" },
  { id: "receiving_instruction", label: "Receiving instruction", border: "border-teal-400",  bg: "bg-teal-50/30" },
  { id: "customer_preference",   label: "Customer preference",   border: "border-amber-400", bg: "bg-amber-50/30" },
  { id: "operational",           label: "Operational",           border: "border-gray-300",  bg: "bg-white" },
] as const;

type NoteType = (typeof NOTE_TYPES)[number]["id"];

const typeStyle = (t: string) => NOTE_TYPES.find((n) => n.id === t) ?? NOTE_TYPES[3];

interface Props {
  customerId: string;
  onChange: () => void;
}

export function NotesTab({ customerId, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery<{ notes: CrmNote[] }>({
    queryKey: ["crm-notes", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/notes`)).data,
  });

  const notes = q.data?.notes ?? [];

  return (
    <div className="space-y-3 text-sm">
      {notes.length === 0 && !q.isLoading && (
        <div className="text-center py-6 text-gray-400">No notes yet.</div>
      )}

      {notes.map((n) => {
        const style = typeStyle(n.noteType);
        return (
          <div key={n.id} className={`border-l-4 ${style.border} ${style.bg} border-r border-t border-b border-gray-200 rounded-r-lg p-3`}>
            <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
              <span className="font-medium">{style.label}</span>
              {n.followUpDate && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                  Follow-up {new Date(n.followUpDate).toLocaleDateString()}
                </span>
              )}
            </div>
            {n.title && <div className="font-medium text-gray-900">{n.title}</div>}
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.content}</p>
            <div className="text-[10px] text-gray-500 mt-1">
              {n.facility ? `From ${n.facility.name} · ` : ""}
              {n.createdByName && `By ${n.createdByName} · `}
              {new Date(n.createdAt).toLocaleDateString()}
              {n.source !== "manual" && ` · ${n.source}`}
            </div>
          </div>
        );
      })}

      {!addOpen ? (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:text-[#BA7517] hover:border-[#BA7517] rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Add note
        </button>
      ) : (
        <AddNoteForm customerId={customerId} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); q.refetch(); onChange(); }} />
      )}
    </div>
  );
}

function AddNoteForm({
  customerId, onClose, onSaved,
}: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const [noteType, setNoteType] = useState<NoteType>("operational");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [facilityId, setFacilityId] = useState("");

  const facilitiesQ = useQuery<{ facilities: { id: string; name: string }[] }>({
    queryKey: ["crm-facilities-picker", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/facilities`)).data,
  });

  const save = useMutation({
    mutationFn: async () =>
      (await api.post(`/customers/${customerId}/notes`, {
        noteType,
        title: title || undefined,
        content,
        facilityId: facilityId || undefined,
        followUpDate: followUpDate || undefined,
      })).data,
    onSuccess: onSaved,
  });

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">New note</h4>
        <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
      </div>
      <select
        value={noteType}
        onChange={(e) => setNoteType(e.target.value as NoteType)}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      >
        {NOTE_TYPES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
      </select>
      {(noteType === "shipping_instruction" || noteType === "receiving_instruction") && (
        <select
          value={facilityId}
          onChange={(e) => setFacilityId(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
        >
          <option value="">No facility (applies to all)</option>
          {(facilitiesQ.data?.facilities ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content"
        rows={4}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white"
      />
      <label className="block">
        <span className="text-[10px] text-gray-500">Follow-up date (optional)</span>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
        />
      </label>
      <button
        disabled={!content || save.isPending}
        onClick={() => save.mutate()}
        className="w-full py-2 bg-[#BA7517] text-white text-sm font-medium rounded disabled:opacity-40"
      >
        {save.isPending ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}
