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
  // v3.8.akh §13.3 Item 63 P3-3 — "Docs" → "Documents". Tab id stays
  // "docs" to preserve consumer call sites (setTab("docs") + popstate
  // history-state keys); only the user-visible label changes.
  { id: "docs",       label: "Documents",  Icon: FileUp },
  { id: "orders",     label: "Orders",     Icon: ShoppingBag },
  { id: "activity",   label: "Activity",   Icon: Clock },
];

export function CrmIconTabs({ active, onChange }: { active: CrmTab; onChange: (t: CrmTab) => void }) {
  return <SharedIconTabs tabs={TABS} active={active} onChange={onChange} />;
}
