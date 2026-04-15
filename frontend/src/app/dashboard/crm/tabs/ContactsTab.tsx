"use client";

import { ContactsPanel } from "@/components/contacts/ContactsPanel";

interface Props {
  customerId: string;
  onChange: () => void;
}

export function ContactsTab({ customerId, onChange }: Props) {
  return <ContactsPanel customerId={customerId} onChange={onChange} />;
}
