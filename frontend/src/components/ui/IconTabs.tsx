"use client";

import type { LucideIcon } from "lucide-react";

/**
 * Shared vertical icon-tab strip used by all right-side detail drawers
 * (Track & Trace, Waterfall, CRM). Applies the SRL gold icon system:
 *  - Active:   #FAEEDA bg, #BA7517 stroke, 2px left border, #854F0B label
 *  - Inactive: gray bg, gray stroke
 *  - Container 28px with 8px radius, icon 14px, stroke 1.5px rounded caps
 *  - 150ms transitions on hover and active-state changes
 *
 * Generic over the tab-id type so callers get exhaustive TypeScript checks
 * on their onChange handler.
 */
export interface IconTabDef<T extends string> {
  id: T;
  label: string;
  Icon: LucideIcon;
  /** Show a small red dot in the corner (e.g. open exception count) */
  alert?: boolean;
  /** Optional numeric badge top-right (not implemented as styled badge yet) */
  badge?: number;
}

interface IconTabsProps<T extends string> {
  tabs: IconTabDef<T>[];
  active: T;
  onChange: (tab: T) => void;
}

export function IconTabs<T extends string>({ tabs, active, onChange }: IconTabsProps<T>) {
  return (
    <div className="w-16 shrink-0 border-r border-gray-200 bg-gray-50 py-4 flex flex-col items-center gap-2">
      {tabs.map(({ id, label, Icon, alert }) => {
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
                className={`w-[14px] h-[14px] ${
                  isActive ? "text-[#BA7517]" : alert ? "text-red-500" : "text-gray-400"
                }`}
                strokeWidth={1.5}
              />
            </span>
            <span className={`text-[10px] font-medium ${isActive ? "text-[#854F0B]" : "text-gray-500"}`}>
              {label}
            </span>
            {alert && <span className="absolute top-0 right-3 w-1.5 h-1.5 rounded-full bg-red-500" />}
          </button>
        );
      })}
    </div>
  );
}
