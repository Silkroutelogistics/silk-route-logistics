"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Star, Edit2, Shield, Search, ExternalLink, CheckCircle2, XCircle, User } from "lucide-react";
import type { CrmCustomer } from "../types";

interface Props {
  customer: CrmCustomer;
  onChange: () => void;
}

interface SecLookupResult {
  publiclyTraded: boolean;
  legalName: string | null;
  cik: string | null;
  ticker: string | null;
  sicCode: string | null;
  sicDescription: string | null;
  latestAnnualFiling: string | null;
  filingsHealthy: boolean;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  recentFilings: { form: string; filedDate: string; description: string | null; url: string }[];
  profileUrl: string | null;
  result: "approved" | "flagged" | "not_found";
}

export function ProfileTab({ customer, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [secView, setSecView] = useState<SecLookupResult | null>(null);
  const [secError, setSecError] = useState<string | null>(null);

  const secCheck = useMutation({
    mutationFn: async () =>
      (await api.post(`/customers/${customer.id}/sec-credit-check`)).data,
    onSuccess: (data: { lookup: SecLookupResult }) => {
      setSecError(null);
      setSecView(data.lookup);
      onChange();
    },
    onError: () => setSecError("SEC credit check failed. Try again."),
  });

  const markManual = useMutation({
    mutationFn: async () =>
      (await api.post(`/customers/${customer.id}/mark-manually-reviewed`)).data,
    onSuccess: () => {
      setSecView(null);
      onChange();
    },
  });

  // SEC lookup inline swap — takes over the whole tab content, same
  // pattern as the drawer document preview across Track & Trace.
  if (secView) {
    return <SecLookupView lookup={secView} onBack={() => setSecView(null)} onMarkManual={() => markManual.mutate()} markPending={markManual.isPending} />;
  }

  if (editing) {
    return <EditProfileForm customer={customer} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChange(); }} />;
  }

  return (
    <div className="space-y-6 text-sm">
      <Section title="Company">
        <Field label="Company"      value={customer.name} />
        <Field label="Customer type" value={customer.type} />
        <Field label="Industry"     value={customer.industry ?? customer.industryType} />
        <Field label="Status"       value={customer.status} />
        <Field label="Account rep" value={
          customer.accountRep
            ? <span className="inline-flex items-center gap-1"><User className="w-3 h-3 text-gray-400" />{`${customer.accountRep.firstName ?? ""} ${customer.accountRep.lastName ?? ""}`.trim() || customer.accountRep.email}</span>
            : "—"
        } />
        <Field label="Rating" value={
          <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className={`w-3.5 h-3.5 ${i <= customer.rating ? "fill-[#BA7517] text-[#BA7517]" : "text-gray-300"}`} />
            ))}
          </span>
        } />
      </Section>

      <Section title="Primary address">
        <Field label="Address"  value={customer.address} />
        <Field label="City"     value={customer.city} />
        <Field label="State"    value={customer.state} />
        <Field label="Zip"      value={customer.zip} />
      </Section>

      <Section title="Billing">
        <Field label="Address" value={customer.billingAddress} />
        <Field label="City"    value={customer.billingCity} />
        <Field label="State"   value={customer.billingState} />
        <Field label="Zip"     value={customer.billingZip} />
      </Section>

      <Section title="Financial">
        <Field label="Credit limit" value={customer.creditLimit ? `$${customer.creditLimit.toLocaleString()}` : "—"} />
        <Field label="Payment terms" value={customer.paymentTerms} />
        <Field label="Tax ID" value={customer.taxId ? `****${customer.taxId.slice(-4)}` : "—"} />
        <Field
          label="Credit status"
          value={
            <span className="inline-flex items-center gap-1">
              <CreditStatusBadge status={customer.creditStatus} />
              {customer.creditCheckDate && (
                <span className="text-[11px] text-gray-500">
                  {new Date(customer.creditCheckDate).toLocaleDateString()}
                </span>
              )}
            </span>
          }
        />
        {customer.creditCheckSource && (
          <Field label="Check source" value={`${customer.creditCheckSource} · ${customer.creditCheckResult ?? ""}`} />
        )}
        {customer.secCikNumber && <Field label="SEC CIK" value={customer.secCikNumber} />}
      </Section>

      {secError && <div className="text-xs text-red-600">{secError}</div>}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
        >
          <Edit2 className="w-3 h-3" /> Edit profile
        </button>
        <button
          onClick={() => secCheck.mutate()}
          disabled={secCheck.isPending}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-[#BA7517] border border-[#BA7517]/40 bg-[#FAEEDA] rounded hover:bg-[#FAEEDA]/70 disabled:opacity-40"
        >
          <Shield className="w-3 h-3" />
          {secCheck.isPending ? "Checking SEC…" : "Check Credit (SEC)"}
        </button>
      </div>
    </div>
  );
}

function SecLookupView({
  lookup, onBack, onMarkManual, markPending,
}: {
  lookup: SecLookupResult;
  onBack: () => void;
  onMarkManual: () => void;
  markPending: boolean;
}) {
  if (!lookup.publiclyTraded) {
    return (
      <div className="space-y-4 text-sm">
        <button onClick={onBack} className="text-xs text-[#C5A572] hover:underline">← Back to profile</button>
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Search className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-900">Company not found in SEC EDGAR</h3>
              <p className="text-xs text-amber-700 mt-1">
                This appears to be a private company. SEC credit check only covers publicly traded entities.
                Manual credit review required.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={onMarkManual}
          disabled={markPending}
          className="w-full py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded disabled:opacity-40"
        >
          {markPending ? "Saving…" : "Mark as manually reviewed"}
        </button>
      </div>
    );
  }

  const riskCls =
    lookup.risk === "LOW" ? "bg-green-100 text-green-700"
  : lookup.risk === "MEDIUM" ? "bg-amber-100 text-amber-700"
  : lookup.risk === "HIGH" ? "bg-red-100 text-red-700"
  : "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-4 text-sm">
      <button onClick={onBack} className="text-xs text-[#C5A572] hover:underline">← Back to profile</button>

      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{lookup.legalName ?? "—"}</h3>
            <div className="text-xs text-gray-500 mt-0.5">
              {lookup.ticker && <span>{lookup.ticker} · </span>}
              CIK {lookup.cik}
              {lookup.sicCode && <> · SIC {lookup.sicCode}</>}
            </div>
            {lookup.sicDescription && (
              <div className="text-[11px] text-gray-500">{lookup.sicDescription}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 text-[11px] rounded ${riskCls}`}>{lookup.risk} risk</span>
            {lookup.filingsHealthy ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] rounded bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3" /> Current
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] rounded bg-red-100 text-red-700">
                <XCircle className="w-3 h-3" /> Delinquent
              </span>
            )}
          </div>
        </div>

        {lookup.profileUrl && (
          <a
            href={lookup.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#C5A572] hover:underline"
          >
            View on SEC.gov <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Recent filings</h4>
        <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
          {lookup.recentFilings.length === 0 && (
            <div className="p-4 text-xs text-gray-700 text-center">No recent filings found.</div>
          )}
          {lookup.recentFilings.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-[#C5A572]">{f.form}</span>
                  <span className="text-xs text-gray-600">{f.filedDate}</span>
                </div>
                {f.description && <div className="text-[11px] text-gray-500 truncate mt-0.5">{f.description}</div>}
              </div>
              <ExternalLink className="w-3 h-3 text-gray-700 shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

interface RepOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

function EditProfileForm({
  customer, onCancel, onSaved,
}: { customer: CrmCustomer; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: customer.name,
    status: customer.status,
    industry: customer.industry ?? "",
    rating: customer.rating,
    address: customer.address ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    zip: customer.zip ?? "",
    creditLimit: customer.creditLimit ?? 0,
    paymentTerms: customer.paymentTerms ?? "Net 30",
    taxId: customer.taxId ?? "",
    accountRepId: customer.accountRepId ?? "",
  });

  const repOptions = useQuery<{ users: RepOption[] }>({
    queryKey: ["crm-rep-options"],
    queryFn: async () => (await api.get("/customers/account-rep-options")).data,
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch(`/customers/${customer.id}`, {
        ...form,
        accountRepId: form.accountRepId || null,
      })).data,
    onSuccess: onSaved,
  });

  return (
    <div className="space-y-4 text-sm">
      <Input label="Company"       value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Input label="Status"        value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
      <Input label="Industry"      value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />

      <label className="block">
        <span className="text-[11px] text-gray-500">Account rep</span>
        <select
          value={form.accountRepId}
          onChange={(e) => setForm({ ...form, accountRepId: e.target.value })}
          className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
        >
          <option value="">— Unassigned —</option>
          {(repOptions.data?.users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email} · {u.role}
            </option>
          ))}
        </select>
      </label>

      <Input label="Address"       value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
      <div className="grid grid-cols-3 gap-2">
        <Input label="City"  value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Input label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
        <Input label="Zip"   value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
      </div>
      <Input label="Credit limit" value={String(form.creditLimit)} onChange={(v) => setForm({ ...form, creditLimit: Number(v) || 0 })} />
      <Input label="Payment terms" value={form.paymentTerms} onChange={(v) => setForm({ ...form, paymentTerms: v })} />
      <Input label="Tax ID"       value={form.taxId} onChange={(v) => setForm({ ...form, taxId: v })} />

      <div className="flex gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex-1 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="flex-1 py-2 border border-gray-200 rounded text-sm">Cancel</button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-gray-200 rounded-lg p-4 bg-gray-50">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-sm text-white">{value ?? "—"}</div>
    </div>
  );
}

function CreditStatusBadge({ status }: { status: string }) {
  const cls =
    status === "APPROVED" ? "bg-green-100 text-green-700"
  : status === "CONDITIONAL" ? "bg-amber-100 text-amber-700"
  : status === "DENIED" ? "bg-red-100 text-red-700"
  : status === "PENDING_REVIEW" ? "bg-blue-100 text-blue-700"
  : "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 text-[11px] rounded ${cls}`}>{status}</span>;
}
