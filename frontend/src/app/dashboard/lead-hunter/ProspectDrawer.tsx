"use client";

import { useState, useEffect, useCallback } from "react";
import { X, User, Activity, MessageSquare, Users, Settings } from "lucide-react";
import { IconTabs, type IconTabDef } from "@/components/ui/IconTabs";
import type { Customer } from "./types";
import { STAGE_BADGE, resolveStage } from "./types";
import { ProfileTab } from "./tabs/ProfileTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { NotesTab } from "./tabs/NotesTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { ActionsTab } from "./tabs/ActionsTab";

type DrawerTab = "profile" | "activity" | "notes" | "contacts" | "actions";

const TABS: IconTabDef<DrawerTab>[] = [
  { id: "profile",  label: "Profile",  Icon: User },
  { id: "activity", label: "Activity", Icon: Activity },
  { id: "notes",    label: "Notes",    Icon: MessageSquare },
  { id: "contacts", label: "Contacts", Icon: Users },
  { id: "actions",  label: "Actions",  Icon: Settings },
];

interface Props {
  prospect: Customer | null;
  onClose: () => void;
}

export function ProspectDrawer({ prospect, onClose }: Props) {
  const [tab, setTab] = useState<DrawerTab>("profile");

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (prospect) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      setTab("profile");
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [prospect, handleKeyDown]);

  // Browser back button closes the drawer
  useEffect(() => {
    if (!prospect) return;
    window.history.pushState({ leadHunterDrawer: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [prospect, onClose]);

  if (!prospect) return null;

  const stage = resolveStage(prospect.status);
  const badge = STAGE_BADGE[stage];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prospect-drawer-title"
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex animate-slide-in-right"
      >
        <IconTabs tabs={TABS} active={tab} onChange={setTab} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="prospect-drawer-title" className="text-lg font-semibold text-gray-900 truncate">
                  {prospect.name}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`px-2 py-0.5 text-[11px] rounded-full font-semibold ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                  {prospect.contactName && (
                    <span className="text-xs text-gray-500">{prospect.contactName}</span>
                  )}
                  {(prospect.city || prospect.state) && (
                    <span className="text-xs text-gray-700">
                      · {[prospect.city, prospect.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-700 hover:text-gray-600 transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === "profile"  && <ProfileTab  prospect={prospect} onChange={() => { /* react-query handles refetch */ }} />}
            {tab === "activity" && <ActivityTab prospectId={prospect.id} />}
            {tab === "notes"    && <NotesTab    prospectId={prospect.id} />}
            {tab === "contacts" && <ContactsTab prospectId={prospect.id} />}
            {tab === "actions"  && <ActionsTab  prospect={prospect} onClose={onClose} />}
          </div>
        </div>
      </div>
    </div>
  );
}
