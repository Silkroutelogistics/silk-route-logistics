"use client";

import { ContactsPanel } from "@/components/contacts/ContactsPanel";

interface Props {
  prospectId: string;
}

export function ContactsTab({ prospectId }: Props) {
  return <ContactsPanel customerId={prospectId} />;
}
