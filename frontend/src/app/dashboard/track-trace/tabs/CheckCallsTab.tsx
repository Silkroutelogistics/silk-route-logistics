"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PhoneCall, Plus, X } from "lucide-react";

interface Props {
  load: any;
  loadId: string;
  onChange: () => void;
}

export function CheckCallsTab({ load, loadId, onChange }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("PHONE");

  const create = useMutation({
    mutationFn: async () =>
      (await api.post(`/check-calls`, { loadId, notes, method, status: "IN_TRANSIT" })).data,
    onSuccess: () => {
      setShowForm(false); setNotes(""); setMethod("PHONE");
      onChange();
    },
  });

  const calls: any[] = load.checkCalls ?? [];
  const schedules: any[] = load.checkCallSchedules ?? [];
  const now = Date.now();

  const completed = calls.length;
  const total = schedules.length || completed;
  const due = schedules.filter((s) => ["PENDING", "SENT"].includes(s.status) && new Date(s.scheduledTime).getTime() < now).length;
  const upcoming = schedules.filter((s) => ["PENDING", "SENT"].includes(s.status) && new Date(s.scheduledTime).getTime() >= now).length;

  const timeline = [
    ...schedules.map((s) => ({
      kind: "schedule", id: s.id, time: s.scheduledTime, status: s.status, type: s.type,
    })),
    ...calls.map((c) => ({
      kind: "done", id: c.id, time: c.createdAt, status: "DONE", type: c.status, notes: c.notes, method: c.method, calledBy: c.calledBy,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <Card tone="green" label="Completed" value={`${completed}${total ? `/${total}` : ""}`} />
        <Card tone="amber" label="Due now"   value={due} />
        <Card tone="gray"  label="Upcoming"  value={upcoming} />
      </div>

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:text-[#BA7517] hover:border-[#BA7517] rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Log call
        </button>
      )}

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">New check call</h4>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes" rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white"
          />
          <select
            value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white"
          >
            <option value="PHONE">Phone</option>
            <option value="EMAIL">Email / Text</option>
            <option value="GPS">GPS auto-update</option>
            <option value="CARRIER_UPDATE">Carrier portal</option>
          </select>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="w-full py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded disabled:opacity-40"
          >
            {create.isPending ? "Saving…" : "Log call"}
          </button>
        </div>
      )}

      {load.driverPhone && (
        <a
          href={`tel:${load.driverPhone}`}
          className="flex items-center justify-center gap-2 py-2 text-sm text-[#BA7517] border border-[#BA7517]/40 bg-[#FAEEDA]/30 rounded-lg hover:bg-[#FAEEDA]/60"
        >
          <PhoneCall className="w-4 h-4" /> Call driver — {load.driverPhone}
        </a>
      )}

      <ol className="space-y-2 border-l border-gray-200 pl-4">
        {timeline.map((t: any) => {
          const isDone = t.kind === "done";
          const isOverdue = !isDone && new Date(t.time).getTime() < now;
          const dotColor = isDone ? "bg-green-500" : isOverdue ? "bg-red-500" : "bg-gray-300";
          return (
            <li key={`${t.kind}-${t.id}`} className="relative">
              <span className={`absolute -left-[19px] top-2 w-2.5 h-2.5 rounded-full ${dotColor}`} />
              <div className="text-xs text-gray-500">{new Date(t.time).toLocaleString()}</div>
              <div className="text-sm text-gray-900">{t.type}</div>
              {t.notes && <div className="text-xs text-gray-600">{t.notes}</div>}
              {t.method && <div className="text-[11px] text-gray-400">{t.method}</div>}
            </li>
          );
        })}
        {timeline.length === 0 && <li className="text-xs text-gray-400">No calls yet.</li>}
      </ol>
    </div>
  );
}

function Card({ tone, label, value }: { tone: "green" | "amber" | "gray"; label: string; value: string | number }) {
  const cls = tone === "green" ? "border-green-200 bg-green-50 text-green-700"
            : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-[11px] uppercase">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
