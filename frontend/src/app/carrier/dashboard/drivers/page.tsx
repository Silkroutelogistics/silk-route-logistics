"use client";

// v3.8.amw — SRL Driver Academy Sprint T1: carrier-managed driver roster.
// The roster is the foundation surface for the Academy epic: drivers added
// here receive training-portal logins (phone + PIN, Sprint T2) and appear
// in the per-course completion tracking (Sprints T3-T5). Mirrors the
// documents-page idiom (CarrierCard panels, gold gradient CTA, TanStack
// Query + api client). No hard delete — deactivate keeps training history.

import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, X, Pencil, UserX, UserCheck, GraduationCap, Loader2, Phone, IdCard,
  Send, Copy, Check, KeyRound, Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";

interface RosterDriver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  licenseType: string;
  licenseNumber: string | null;
  licenseState: string | null;
  licenseExpiry: string | null;
  medicalCardExpiry: string | null;
  status: string;
  createdAt: string;
  // v3.8.amz — Driver Academy T2 invite/activation state.
  trainingPinSetAt: string | null;
  trainingInviteSentAt: string | null;
}

// "activated" = driver set their PIN; "invited" = link sent, not yet used;
// "none" = no invite sent yet.
function trainingState(d: RosterDriver): "activated" | "invited" | "none" {
  if (d.trainingPinSetAt) return "activated";
  if (d.trainingInviteSentAt) return "invited";
  return "none";
}

const LICENSE_TYPES = ["CDL-A", "CDL-B", "CDL-C", "Non-CDL"];

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  licenseType: "CDL-A",
  licenseNumber: "",
  licenseState: "",
  licenseExpiry: "",
  medicalCardExpiry: "",
};

type DriverForm = typeof EMPTY_FORM;

const INACTIVE_STATUSES = ["INACTIVE", "TERMINATED"];

// Stored E.164 (+12692206760) → (269) 220-6760 for display
function fmtPhone(p: string | null): string {
  if (!p) return "—";
  const digits = p.replace(/\D/g, "").replace(/^1/, "");
  if (digits.length !== 10) return p;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Expiry tone: red past-due, amber inside 30 days, default otherwise
function expiryTone(dateStr: string | null): string {
  if (!dateStr) return "text-gray-400";
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "text-red-600 font-semibold";
  if (days < 30) return "text-amber-600 font-semibold";
  return "text-gray-600";
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback;
}

export default function CarrierDriversPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DriverForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["carrier-drivers"],
    queryFn: () => api.get("/carrier-drivers").then((r) => r.data),
  });

  const drivers: RosterDriver[] = data?.drivers || [];
  const activeCount = data?.active ?? 0;
  const inactiveCount = data?.inactive ?? 0;

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  // Empty optional fields are OMITTED from the payload (EditLoadModal
  // precedent) so the backend Zod optionals pass cleanly.
  const buildPayload = () => {
    const payload: Record<string, string> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      licenseType: form.licenseType,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.licenseNumber.trim()) payload.licenseNumber = form.licenseNumber.trim();
    if (form.licenseState.trim()) payload.licenseState = form.licenseState.trim();
    if (form.licenseExpiry) payload.licenseExpiry = form.licenseExpiry;
    if (form.medicalCardExpiry) payload.medicalCardExpiry = form.medicalCardExpiry;
    return payload;
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId
        ? api.patch(`/carrier-drivers/${editingId}`, buildPayload())
        : api.post("/carrier-drivers", buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-drivers"] });
      closeForm();
    },
    onError: (err) => setFormError(extractError(err, "Could not save the driver. Try again.")),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "deactivate" | "reactivate" }) =>
      api.patch(`/carrier-drivers/${id}/${action}`),
    onSuccess: () => {
      setRowError(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-drivers"] });
    },
    onError: (err) => setRowError(extractError(err, "Could not update the driver's status.")),
  });

  // Permanent delete — backend hard-deletes only when the driver has no history
  // (training/loads/shipments); otherwise it 409s with "deactivate instead" which
  // extractError surfaces as the row error.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/carrier-drivers/${id}`),
    onSuccess: () => {
      setRowError(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-drivers"] });
    },
    onError: (err) => setRowError(extractError(err, "Could not delete the driver.")),
  });

  // v3.8.amz — Training invite. Always returns the invite URL (copy-link
  // fallback) alongside the SMS-sent flag, so the carrier has a working
  // path even when OpenPhone is unavailable.
  const [inviteResult, setInviteResult] = useState<Record<string, { url: string; smsSent: boolean; smsError: string | null }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: ({ id, reset }: { id: string; reset?: boolean }) =>
      api.post(`/carrier-drivers/${id}/invite`, { reset: !!reset }).then((r) => r.data),
    onSuccess: (data, vars) => {
      setRowError(null);
      setInviteResult((prev) => ({ ...prev, [vars.id]: { url: data.inviteUrl, smsSent: data.smsSent, smsError: data.smsError } }));
      queryClient.invalidateQueries({ queryKey: ["carrier-drivers"] });
    },
    onError: (err) => setRowError(extractError(err, "Could not send the training invite.")),
  });

  const copyLink = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
    } catch {
      setRowError("Couldn't copy automatically — select and copy the link manually.");
    }
  };

  const startEdit = (d: RosterDriver) => {
    setEditingId(d.id);
    setForm({
      firstName: d.firstName,
      lastName: d.lastName,
      phone: fmtPhone(d.phone) === "—" ? "" : fmtPhone(d.phone),
      email: d.email || "",
      licenseType: d.licenseType || "CDL-A",
      licenseNumber: d.licenseNumber || "",
      licenseState: d.licenseState || "",
      licenseExpiry: d.licenseExpiry ? d.licenseExpiry.slice(0, 10) : "",
      medicalCardExpiry: d.medicalCardExpiry ? d.medicalCardExpiry.slice(0, 10) : "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const canSave = form.firstName.trim() && form.lastName.trim() && form.phone.replace(/\D/g, "").length >= 10;

  const inputCls = "w-full px-3 py-2 border border-gray-200 rounded text-xs focus:border-[#C9A84C] focus:outline-none bg-white";
  const labelCls = "text-xs text-gray-700 block mb-1";

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0F1117] mb-1">Drivers</h1>
          <p className="text-[13px] text-gray-500">
            Your driver roster. Drivers added here get access to SRL Driver Academy training.
          </p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-xs font-semibold rounded-md hover:shadow-lg transition-shadow"
        >
          <Plus size={14} /> Add Driver
        </button>
      </div>

      {/* Roster counts */}
      <div className="flex gap-2 mb-5">
        <span className="px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
          {activeCount} active
        </span>
        <span className="px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium">
          {inactiveCount} inactive
        </span>
      </div>

      {/* Add / Edit panel */}
      {showForm && (
        <CarrierCard padding="p-5" className="mb-5 border-[#C9A84C]/30">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-[#0F1117] flex items-center gap-2">
              <Users size={16} className="text-[#BA7517]" /> {editingId ? "Edit Driver" : "Add Driver"}
            </h3>
            <button onClick={closeForm} className="text-gray-700 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className={labelCls}>First Name *</label>
              <input className={inputCls} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="John" />
            </div>
            <div>
              <label className={labelCls}>Last Name *</label>
              <input className={inputCls} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Smith" />
            </div>
            <div>
              <label className={labelCls}>Mobile Phone *</label>
              <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(269) 555-0123" />
              <p className="text-[10px] text-gray-400 mt-0.5">Training login invites go to this number</p>
            </div>
            <div>
              <label className={labelCls}>Email (optional)</label>
              <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="driver@email.com" />
            </div>
            <div>
              <label className={labelCls}>License Type</label>
              <select className={inputCls} value={form.licenseType} onChange={(e) => setForm({ ...form, licenseType: e.target.value })}>
                {LICENSE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>CDL Number</label>
              <input className={inputCls} value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} placeholder="S530-1234-5678" />
              <p className="mt-1 text-[11px] text-amber-700">Required before this driver can start SRL Driver Academy training.</p>
            </div>
            <div>
              <label className={labelCls}>License State</label>
              <input className={inputCls} maxLength={2} value={form.licenseState} onChange={(e) => setForm({ ...form, licenseState: e.target.value.toUpperCase() })} placeholder="MI" />
            </div>
            <div>
              <label className={labelCls}>License Expiry</label>
              <input className={inputCls} type="date" value={form.licenseExpiry} onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })} />
              <p className="mt-1 text-[11px] text-slate-500">An expired CDL also blocks Academy training.</p>
            </div>
            <div>
              <label className={labelCls}>Medical Card Expiry</label>
              <input className={inputCls} type="date" value={form.medicalCardExpiry} onChange={(e) => setForm({ ...form, medicalCardExpiry: e.target.value })} />
            </div>
          </div>

          {formError && (
            <div className="mb-3 px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">
              {formError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-xs font-semibold rounded-md hover:shadow-lg transition-shadow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saveMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              {editingId ? "Save Changes" : "Add to Roster"}
            </button>
            <button onClick={closeForm} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </CarrierCard>
      )}

      {rowError && (
        <div className="mb-4 px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">
          {rowError}
        </div>
      )}

      {/* Roster */}
      {isLoading ? (
        <CarrierCard padding="p-8">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading roster...
          </div>
        </CarrierCard>
      ) : drivers.length === 0 ? (
        <CarrierCard padding="p-10">
          <div className="text-center">
            <GraduationCap size={32} className="mx-auto text-[#C9A84C] mb-3" />
            <h3 className="text-sm font-bold text-[#0F1117] mb-1">No drivers on your roster yet</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Add your drivers to build your roster. Each driver will get their own SRL Driver
              Academy login for training on IRP, IFTA, ELD, HOS, and more — with completion
              certificates you can track here.
            </p>
          </div>
        </CarrierCard>
      ) : (
        <CarrierCard padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">License</th>
                  <th className="px-4 py-3 font-medium">License Expiry</th>
                  <th className="px-4 py-3 font-medium">Med Card</th>
                  <th className="px-4 py-3 font-medium">Training</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const inactive = INACTIVE_STATUSES.includes(d.status);
                  const tState = trainingState(d);
                  const result = inviteResult[d.id];
                  return (
                    <Fragment key={d.id}>
                    <tr className={`border-b border-gray-50 ${result ? "" : "last:border-0"} ${inactive ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-semibold text-[#0F1117]">
                          {d.firstName} {d.lastName}
                        </div>
                        {d.email && <div className="text-[11px] text-gray-400">{d.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <span className="flex items-center gap-1.5">
                          <Phone size={12} className="text-gray-300" /> {fmtPhone(d.phone)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <span className="flex items-center gap-1.5">
                          <IdCard size={12} className="text-gray-300" />
                          {d.licenseType}
                          {d.licenseNumber ? ` · ${d.licenseNumber}` : ""}
                          {d.licenseState ? ` (${d.licenseState})` : ""}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-xs ${expiryTone(d.licenseExpiry)}`}>{fmtDate(d.licenseExpiry)}</td>
                      <td className={`px-4 py-3 text-xs ${expiryTone(d.medicalCardExpiry)}`}>{fmtDate(d.medicalCardExpiry)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                            tState === "activated"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : tState === "invited"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {tState === "activated" ? "Activated" : tState === "invited" ? "Invited" : "Not invited"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                            inactive
                              ? "bg-gray-100 text-gray-500"
                              : "bg-green-50 text-green-700 border border-green-200"
                          }`}
                        >
                          {inactive ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Training invite — only for active drivers */}
                          {!inactive && tState !== "activated" && (
                            <button
                              onClick={() => inviteMutation.mutate({ id: d.id })}
                              disabled={inviteMutation.isPending}
                              title={tState === "invited" ? "Resend training invite" : "Send training invite"}
                              className="px-2 py-1.5 flex items-center gap-1 text-[11px] font-medium text-[#BA7517] hover:bg-[#C9A84C]/10 rounded transition-colors"
                            >
                              <Send size={13} /> {tState === "invited" ? "Resend" : "Invite"}
                            </button>
                          )}
                          {!inactive && tState === "activated" && (
                            <button
                              onClick={() => {
                                if (confirm(`Reset ${d.firstName}'s training PIN? They'll get a fresh setup link and must choose a new PIN.`)) {
                                  inviteMutation.mutate({ id: d.id, reset: true });
                                }
                              }}
                              disabled={inviteMutation.isPending}
                              title="Reset PIN & re-invite"
                              className="p-1.5 text-gray-400 hover:text-[#BA7517] hover:bg-[#C9A84C]/10 rounded transition-colors"
                            >
                              <KeyRound size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => startEdit(d)}
                            title="Edit driver"
                            className="p-1.5 text-gray-400 hover:text-[#BA7517] hover:bg-[#C9A84C]/10 rounded transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          {inactive ? (
                            <button
                              onClick={() => statusMutation.mutate({ id: d.id, action: "reactivate" })}
                              disabled={statusMutation.isPending}
                              title="Reactivate driver"
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            >
                              <UserCheck size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (confirm(`Deactivate ${d.firstName} ${d.lastName}? Their training history is kept and they can be reactivated anytime.`)) {
                                  statusMutation.mutate({ id: d.id, action: "deactivate" });
                                }
                              }}
                              disabled={statusMutation.isPending}
                              title="Deactivate driver"
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <UserX size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${d.firstName} ${d.lastName} from your roster? This permanently removes the driver. It only works if they have no training or load history — otherwise deactivate them instead.`)) {
                                deleteMutation.mutate(d.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            title="Delete driver"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {result && (
                      <tr className="border-b border-gray-50 last:border-0 bg-[#C9A84C]/5">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[11px] font-semibold text-[#0F1117]">
                              {result.smsSent ? "✓ Texted the setup link to the driver." : "Setup link ready — text or share it with the driver:"}
                            </span>
                            <code className="flex-1 min-w-[200px] text-[11px] text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 truncate">
                              {result.url}
                            </code>
                            <button
                              onClick={() => copyLink(d.id, result.url)}
                              className="px-2.5 py-1 flex items-center gap-1 text-[11px] font-medium text-[#BA7517] border border-[#C9A84C]/40 hover:bg-[#C9A84C]/10 rounded transition-colors"
                            >
                              {copiedId === d.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy link</>}
                            </button>
                          </div>
                          {!result.smsSent && (
                            <p className="text-[10px] text-amber-700 mt-1.5">
                              Text couldn&apos;t send to this number{result.smsError ? <> — <span className="text-gray-500">{result.smsError}</span></> : ""}. The copy link above still works — share it with the driver.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CarrierCard>
      )}

      {/* Academy strip — links to the live Training dashboard (T5). */}
      {drivers.length > 0 && (
        <a href="/carrier/dashboard/training"
          className="mt-5 px-4 py-3 bg-[#C9A84C]/5 border border-[#C9A84C]/20 rounded-lg flex items-center gap-3 hover:bg-[#C9A84C]/10 transition-colors">
          <GraduationCap size={18} className="text-[#BA7517] shrink-0" />
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-[#0F1117]">SRL Driver Academy is live.</span>{" "}
            Invite drivers above, then track completion across IRP, IFTA, ELD &amp; HOS, inspections,
            detention documentation, and fraud awareness — with downloadable certificates.{" "}
            <span className="font-semibold text-[#BA7517]">View the Training dashboard →</span>
          </p>
        </a>
      )}
    </div>
  );
}
