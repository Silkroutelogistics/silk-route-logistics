"use client";

import {
  FileText, MapPin, FileUp, PhoneCall, AlertTriangle,
  CreditCard, ImageIcon, Activity,
} from "lucide-react";
import { IconTabs as SharedIconTabs, type IconTabDef } from "@/components/ui/IconTabs";
import type { DrawerTab } from "./drawer-types";

const TABS: IconTabDef<DrawerTab>[] = [
  { id: "details",     label: "Details",     Icon: FileText },
  { id: "tracking",    label: "Tracking",    Icon: MapPin },
  { id: "docs",        label: "Docs",        Icon: FileUp },
  { id: "check_calls", label: "Calls",       Icon: PhoneCall },
  { id: "exceptions",  label: "Exceptions",  Icon: AlertTriangle },
  { id: "finance",     label: "Finance",     Icon: CreditCard },
  { id: "photos",      label: "Photos",      Icon: ImageIcon },
  { id: "activity",    label: "Activity",    Icon: Activity },
];

interface IconTabsProps {
  active: DrawerTab;
  onChange: (tab: DrawerTab) => void;
  openExceptionCount?: number;
}

export function IconTabs({ active, onChange, openExceptionCount = 0 }: IconTabsProps) {
  const tabsWithAlert = TABS.map((t) =>
    t.id === "exceptions" && openExceptionCount > 0 ? { ...t, alert: true } : t
  );
  return <SharedIconTabs tabs={tabsWithAlert} active={active} onChange={onChange} />;
}
