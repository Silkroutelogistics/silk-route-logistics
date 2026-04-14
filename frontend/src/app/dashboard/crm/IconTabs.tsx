"use client";

import {
  FileText, Users, Truck, DollarSign, MapPin, MessageSquare,
  FileUp, ShoppingBag, Clock,
} from "lucide-react";
import { IconTabs as SharedIconTabs, type IconTabDef } from "@/components/ui/IconTabs";
import type { CrmTab } from "./types";

const TABS: IconTabDef<CrmTab>[] = [
  { id: "profile",    label: "Profile",    Icon: FileText },
  { id: "contacts",   label: "Contacts",   Icon: Users },
  { id: "loads",      label: "Loads",      Icon: Truck },
  { id: "rates",      label: "Rates",      Icon: DollarSign },
  { id: "facilities", label: "Facilities", Icon: MapPin },
  { id: "notes",      label: "Notes",      Icon: MessageSquare },
  { id: "docs",       label: "Docs",       Icon: FileUp },
  { id: "orders",     label: "Orders",     Icon: ShoppingBag },
  { id: "activity",   label: "Activity",   Icon: Clock },
];

export function CrmIconTabs({ active, onChange }: { active: CrmTab; onChange: (t: CrmTab) => void }) {
  return <SharedIconTabs tabs={TABS} active={active} onChange={onChange} />;
}
