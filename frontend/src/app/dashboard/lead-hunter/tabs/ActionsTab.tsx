"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Calendar, ArrowRight, Trash2, Ban } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import type { Customer } from "../types";
import { resolveStage } from "../types";

interface Props {
  prospect: Customer;
  onClose: () => void;
}

export function ActionsTab({ prospect, onClose }: Props) {
  const queryClient = useQueryClient();
  const [callNotes, setCallNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInactivate, setShowInactivate] = useState(false);
  const [inactivateReason, setInactivateReason] = useState("");
  // B5a: inactivation is ADMIN / CEO / OPERATIONS (decision 5); the route refuses the rest.
  const { user } = useAuthStore();
  const canInactivate = ["ADMIN", "CEO", "OPERATIONS"].includes(user?.role ?? "");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
    queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
    queryClient.invalidateQueries({ queryKey: ["lead-hunter-prospect-feed", prospect.id] });
    queryClient.invalidateQueries({ queryKey: ["lead-hunter-activity-feed"] });
    queryClient.invalidateQueries({ queryKey: ["lead-hunter-communications"] });
  };

  const logCall = useMutation({
    mutationFn: () =>
      api.post("/communications", {
        type: "CALL_OUTBOUND",
        direction: "OUTBOUND",
        entityType: "SHIPPER",
        entityId: prospect.id,
        subject: `Call with ${prospect.contactName || prospect.name}`,
        body: callNotes.trim() || "Call logged from Actions panel",
        metadata: { source: "LeadHunter.Actions" },
      }),
    onSuccess: () => { setCallNotes(""); refresh(); },
  });

  const scheduleFollowUp = useMutation({
    mutationFn: () =>
      api.post("/communications", {
        type: "NOTE",
        entityType: "SHIPPER",
        entityId: prospect.id,
        subject: `Follow-up scheduled for ${followUpDate}`,
        body: followUpNotes.trim() || `Follow-up reminder set for ${followUpDate}`,
        metadata: { source: "LeadHunter.Actions", followUpDate },
      }),
    onSuccess: () => { setFollowUpDate(""); setFollowUpNotes(""); refresh(); },
  });

  const convert = useMutation({
    mutationFn: () => api.patch(`/customers/${prospect.id}`, { status: "Active" }),
    onSuccess: () => { refresh(); onClose(); },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/customers/${prospect.id}`),
    onSuccess: () => { refresh(); onClose(); },
  });
  // B5a: a delete is refused (409 CUSTOMER_HAS_REFERENCES) when anything references
  // the prospect. The body names the references and the next action; render it,
  // never a bare "failed".
  const removeRefusal = (remove.error as any)?.response?.data as
    | { error?: string; message?: string; remedy?: { openLoads?: string[]; stopSequencesFirst?: boolean } }
    | undefined;

  const inactivate = useMutation({
    mutationFn: () => api.post(`/customers/${prospect.id}/inactivate`, { reason: inactivateReason.trim() }),
    onSuccess: () => { setInactivateReason(""); setShowInactivate(false); refresh(); onClose(); },
  });
  const inactivateError = (inactivate.error as any)?.response?.data?.error as string | undefined;

  const stage = resolveStage(prospect.status);
  const canConvert = stage === "QUALIFIED" || stage === "PROPOSAL" || stage === "CONTACTED";

  return (
    <div className="space-y-4 text-sm">
      {/* Log call */}
      <section className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <PhoneCall className="w-4 h-4 text-blue-600" strokeWidth={1.75} />
          <h4 className="font-semibold text-gray-900">Log Call</h4>
        </div>
        <textarea
          value={callNotes}
          onChange={(e) => setCallNotes(e.target.value)}
          placeholder="What was discussed? (optional)"
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
        />
        <div className="flex items-center gap-2 mt-2">
          {prospect.phone && (
            <a
              href={`tel:${prospect.phone}`}
              className="flex-1 text-center px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
            >
              Dial {prospect.phone}
            </a>
          )}
          <button
            onClick={() => logCall.mutate()}
            disabled={logCall.isPending}
            className="flex-1 px-3 py-1.5 text-xs bg-[#BA7517] text-white rounded hover:bg-[#9a5f12] disabled:opacity-40 transition"
          >
            {logCall.isPending ? "Logging…" : "Log call"}
          </button>
        </div>
      </section>

      {/* Schedule follow-up */}
      <section className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
          <h4 className="font-semibold text-gray-900">Schedule Follow-up</h4>
        </div>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
        />
        <input
          value={followUpNotes}
          onChange={(e) => setFollowUpNotes(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full mt-2 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
        />
        <button
          onClick={() => scheduleFollowUp.mutate()}
          disabled={!followUpDate || scheduleFollowUp.isPending}
          className="w-full mt-2 px-3 py-1.5 text-xs bg-[#BA7517] text-white rounded hover:bg-[#9a5f12] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {scheduleFollowUp.isPending ? "Saving…" : "Schedule"}
        </button>
      </section>

      {/* Convert to customer */}
      {canConvert && (
        <section className="border border-green-200 rounded-lg p-3 bg-green-50/40">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="w-4 h-4 text-green-700" strokeWidth={1.75} />
            <h4 className="font-semibold text-gray-900">Convert to Customer</h4>
          </div>
          <p className="text-xs text-gray-600 mb-2">Move this prospect to the Active customer pipeline in CRM.</p>
          <button
            onClick={() => convert.mutate()}
            disabled={convert.isPending}
            className="w-full px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 transition"
          >
            {convert.isPending ? "Converting…" : "Convert now"}
          </button>
        </section>
      )}

      {/* Delete */}
      <section className="border border-red-200 rounded-lg p-3 bg-red-50/30">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 className="w-4 h-4 text-red-700" strokeWidth={1.75} />
          <h4 className="font-semibold text-gray-900">Delete Prospect</h4>
        </div>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-red-300 text-red-600 rounded hover:bg-red-50 transition"
          >
            Delete…
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-700">
              Deletes this prospect outright. It is refused if anything references it — loads, orders,
              contracts, facilities, contacts or an in-flight email sequence — and the refusal names them.
              A prospect with history is inactivated instead.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 transition"
              >
                {remove.isPending ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        )}
        {removeRefusal && (
          <div role="alert" className="mt-2 rounded border border-red-300 bg-white p-2 text-xs text-red-700 space-y-1">
            <p>{removeRefusal.message ?? removeRefusal.error ?? "Delete failed."}</p>
            {removeRefusal.remedy?.openLoads && removeRefusal.remedy.openLoads.length > 0 && (
              <p className="text-gray-700">
                Cancel first, each with a reason code:{" "}
                <span className="font-mono">{removeRefusal.remedy.openLoads.join(", ")}</span>
              </p>
            )}
            {removeRefusal.remedy?.stopSequencesFirst && (
              <p className="text-gray-700">Stop the in-flight email sequence from the Queue first.</p>
            )}
            {removeRefusal.error === "CUSTOMER_HAS_REFERENCES" && (
              canInactivate ? (
                <button
                  onClick={() => { setConfirmDelete(false); setShowInactivate(true); }}
                  className="mt-1 px-2 py-1 text-xs bg-white border border-gray-300 text-gray-800 rounded hover:bg-gray-50 transition"
                >
                  Inactivate instead
                </button>
              ) : (
                <p className="text-gray-700">Inactivation needs an Admin, CEO or Operations role.</p>
              )
            )}
          </div>
        )}
      </section>

      {/* Inactivate — B5a: the end state for a prospect with history. */}
      {canInactivate && (
        <section className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <Ban className="w-4 h-4 text-[#9B2C2C]" strokeWidth={1.75} />
            <h4 className="font-semibold text-gray-900">Inactivate Prospect</h4>
          </div>
          {!showInactivate ? (
            <button
              onClick={() => setShowInactivate(true)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-800 rounded hover:bg-gray-50 transition"
            >
              Inactivate…
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-700">
                Keeps every record and blocks new loads. A reason of at least 5 characters is required.
              </p>
              <textarea
                value={inactivateReason}
                onChange={(e) => setInactivateReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Why this prospect is being inactivated…"
                aria-label="Inactivation reason"
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#BA7517]"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowInactivate(false); setInactivateReason(""); }}
                  className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => inactivate.mutate()}
                  disabled={inactivate.isPending || inactivateReason.trim().length < 5}
                  className="flex-1 px-3 py-1.5 text-xs bg-[#9B2C2C] text-white rounded hover:bg-[#7C2323] disabled:opacity-40 transition"
                >
                  {inactivate.isPending ? "Inactivating…" : "Confirm inactivate"}
                </button>
              </div>
              {inactivateError && <p role="alert" className="text-xs text-red-700">{inactivateError}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
