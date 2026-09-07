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

/**
 * `lockedReason` locks every tab except Profile.
 *
 * The New Customer form has no customer id yet, and Contacts / Facilities /
 * Notes / Documents / Rates all POST to /customers/:id/... — there is nothing
 * for them to attach to until the record is saved. Before this, those tabs
 * were live buttons: clicking one moved the gold active indicator and left the
 * create form on screen, so the click registered and produced nothing. That
 * reads as a broken page, when the truth is a precondition.
 */
export function CrmIconTabs({
  active, onChange, lockedReason,
}: {
  active: CrmTab;
  onChange: (t: CrmTab) => void;
  lockedReason?: string;
}) {
  const tabs = lockedReason
    ? TABS.map((t) =>
        t.id === "profile" ? t : { ...t, disabled: true, disabledReason: lockedReason },
      )
    : TABS;
  return <SharedIconTabs tabs={tabs} active={active} onChange={onChange} />;
}
