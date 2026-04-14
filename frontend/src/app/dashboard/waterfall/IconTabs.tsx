"use client";

import { GitBranch, FileText, UserPlus, Activity, FileSignature, MessageSquare, Clock } from "lucide-react";

export type WfTab = "waterfall" | "details" | "match" | "market" | "tenders" | "notes" | "activity";

const TABS: { id: WfTab; label: string; Icon: typeof GitBranch }[] = [
  { id: "waterfall", label: "Cascade",  Icon: GitBranch },
  { id: "details",   label: "Details",  Icon: FileText },
  { id: "match",     label: "Match",    Icon: UserPlus },
  { id: "market",    label: "Market",   Icon: Activity },
  { id: "tenders",   label: "Tenders",  Icon: FileSignature },
  { id: "notes",     label: "Notes",    Icon: MessageSquare },
  { id: "activity",  label: "Activity", Icon: Clock },
];

export function WaterfallIconTabs({ active, onChange }: { active: WfTab; onChange: (t: WfTab) => void }) {
  return (
    <div className="w-16 shrink-0 border-r border-gray-200 bg-gray-50 py-4 flex flex-col items-center gap-2">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="group flex flex-col items-center gap-0.5 w-full py-1 transition-all duration-150 relative"
            aria-label={label}
            title={label}
          >
            <span
              className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r transition-all duration-150 ${
                isActive ? "bg-[#BA7517]" : "bg-transparent"
              }`}
            />
            <span
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 ${
                isActive ? "bg-[#FAEEDA]" : "bg-white group-hover:bg-gray-100"
              }`}
            >
              <Icon
                className={`w-[14px] h-[14px] ${isActive ? "text-[#BA7517]" : "text-gray-400"}`}
                strokeWidth={1.5}
              />
            </span>
            <span className={`text-[10px] font-medium ${isActive ? "text-[#854F0B]" : "text-gray-500"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
