"use client";

import {
  FileText, MapPin, FileUp, PhoneCall, AlertTriangle,
  CreditCard, ImageIcon, Activity,
} from "lucide-react";
import type { DrawerTab } from "./drawer-types";

/**
 * 8 vertical icon tabs for load detail drawer.
 * Spec §2.2 + §14 icon system — gold active state (#BA7517 / #FAEEDA).
 */

interface TabDef {
  id: DrawerTab;
  label: string;
  Icon: typeof FileText;
}

const TABS: TabDef[] = [
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
  return (
    <div className="w-16 shrink-0 border-r border-gray-200 bg-gray-50 py-4 flex flex-col items-center gap-2">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        const isException = id === "exceptions" && openExceptionCount > 0;
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
                className={`w-[14px] h-[14px] ${
                  isActive ? "text-[#BA7517]" : isException ? "text-red-500" : "text-gray-400"
                }`}
                strokeWidth={1.5}
              />
            </span>
            <span
              className={`text-[10px] font-medium ${
                isActive ? "text-[#854F0B]" : "text-gray-500"
              }`}
            >
              {label}
            </span>
            {isException && (
              <span className="absolute top-0 right-3 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}
