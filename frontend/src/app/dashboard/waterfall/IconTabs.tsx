"use client";

import { GitBranch, FileText, UserPlus, Activity, FileSignature, MessageSquare, Clock } from "lucide-react";
import { IconTabs as SharedIconTabs, type IconTabDef } from "@/components/ui/IconTabs";

export type WfTab = "waterfall" | "details" | "match" | "market" | "tenders" | "notes" | "activity";

const TABS: IconTabDef<WfTab>[] = [
  { id: "waterfall", label: "Cascade",  Icon: GitBranch },
  { id: "details",   label: "Details",  Icon: FileText },
  { id: "match",     label: "Match",    Icon: UserPlus },
  { id: "market",    label: "Market",   Icon: Activity },
  { id: "tenders",   label: "Tenders",  Icon: FileSignature },
  { id: "notes",     label: "Notes",    Icon: MessageSquare },
  { id: "activity",  label: "Activity", Icon: Clock },
];

export function WaterfallIconTabs({ active, onChange }: { active: WfTab; onChange: (t: WfTab) => void }) {
  return <SharedIconTabs tabs={TABS} active={active} onChange={onChange} />;
}
