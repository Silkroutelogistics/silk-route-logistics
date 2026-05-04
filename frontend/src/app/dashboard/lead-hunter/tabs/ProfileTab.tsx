"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, MapPin, Building2, DollarSign } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, PipelineStage } from "../types";
import { STAGE_BADGE, STAGE_TO_STATUS, resolveStage } from "../types";

interface Props {
  prospect: Customer;
  onChange: () => void;
}

const PIPELINE_STAGES: PipelineStage[] = ["LEAD", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON"];

export function ProfileTab({ prospect, onChange }: Props) {
  const queryClient = useQueryClient();
  const stage = resolveStage(prospect.status);
  const [stageDraft, setStageDraft] = useState<PipelineStage>(stage);

  const stageMutation = useMutation({
    mutationFn: (next: PipelineStage) =>
      api.patch(`/customers/${prospect.id}`, { status: STAGE_TO_STATUS[next] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      queryClient.invalidateQueries({ queryKey: ["lead-hunter-activity-feed"] });
      onChange();
    },
  });

  const badge = STAGE_BADGE[stage];
  const revenue = prospect.annualRevenue ? `$${(prospect.annualRevenue / 1000).toFixed(0)}K` : null;

  return (
    <div className="space-y-5 text-sm">
      <div>
        <h3 className="text-xl font-semibold text-white leading-tight">{prospect.name}</h3>
        {prospect.contactName && (
          <p className="text-slate-400 mt-0.5">{prospect.contactName}</p>
        )}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          {prospect.industryType && (
            <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
              <Building2 className="w-3 h-3 inline mr-1" strokeWidth={1.75} />
              {prospect.industryType}
            </span>
          )}
        </div>
      </div>

      {/* Inline stage change */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Change Stage</label>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={stageDraft}
            onChange={(e) => setStageDraft(e.target.value as PipelineStage)}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_BADGE[s].label}</option>
            ))}
          </select>
          <button
            disabled={stageDraft === stage || stageMutation.isPending}
            onClick={() => stageMutation.mutate(stageDraft)}
            className="px-3 py-1.5 text-sm bg-[#BA7517] text-white rounded hover:bg-[#9a5f12] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {stageMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Contact */}
      <section>
        <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Contact</h4>
        <div className="space-y-1.5">
          {prospect.email && (
            <a href={`mailto:${prospect.email}`} className="flex items-center gap-2 text-gray-700 hover:text-[#BA7517] transition">
              <Mail className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />
              <span className="truncate">{prospect.email}</span>
            </a>
          )}
          {prospect.phone && (
            <a href={`tel:${prospect.phone}`} className="flex items-center gap-2 text-gray-700 hover:text-[#BA7517] transition">
              <Phone className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />
              <span>{prospect.phone}</span>
            </a>
          )}
          {(prospect.city || prospect.state) && (
            <div className="flex items-center gap-2 text-slate-400">
              <MapPin className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />
              <span>{[prospect.city, prospect.state].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {!prospect.email && !prospect.phone && !prospect.city && !prospect.state && (
            <p className="text-xs text-gray-400 italic">No contact info on file</p>
          )}
        </div>
      </section>

      {/* Details */}
      <section>
        <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Details</h4>
        <dl className="space-y-1.5">
          {revenue && (
            <div className="flex items-center gap-2 text-slate-400">
              <DollarSign className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />
              <span>Est. revenue: <span className="text-white font-medium">{revenue}</span></span>
            </div>
          )}
          {prospect.paymentTerms && (
            <div className="text-slate-400 pl-5">Payment terms: <span className="text-white font-medium">{prospect.paymentTerms}</span></div>
          )}
          {prospect.onboardingStatus && (
            <div className="text-slate-400 pl-5">Onboarding: <span className="text-white font-medium">{prospect.onboardingStatus}</span></div>
          )}
          {!revenue && !prospect.paymentTerms && !prospect.onboardingStatus && (
            <p className="text-xs text-gray-400 italic">No additional details</p>
          )}
        </dl>
      </section>

      {/* Links — placeholders, no linkedinUrl/website on Customer model yet */}
      {(prospect.notes) && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Notes</h4>
          <p className="text-slate-400 whitespace-pre-wrap text-xs">{prospect.notes}</p>
        </section>
      )}

    </div>
  );
}
