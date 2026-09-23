"use client";

import { useState, useEffect } from "react";
import { MapPin, Phone, FileText, CheckCircle, Clock, AlertCircle, Printer, Zap, Lock, Loader2, ArrowRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge, DriverAssignmentPanel, PaperworkPanel } from "@/components/carrier";
import { money, carrierPay } from "@/lib/rateDisplay";
import { openPdfFromApi, extractApiError, apiHref } from "@/lib/download";
// E2 — the next-step strip and the BOL button state come from the same
// selector the AE board reads (deriveLoadStatus, projected for a carrier), so
// the two surfaces cannot disagree about where a load is.
import { carrierNextStep } from "@/lib/loadDerivedStatus";
// E4 — the paperwork panel renders from the ruling-6 table the settlement gate
// reads (shared/constants/paperwork); `paperworkOpenAt` on the DERIVED key is
// "from CONFIRMED" in the selector's vocabulary, so a load whose RC is unsigned
// is not yet asked for paperwork and a directly-assigned load is asked once it
// is dispatched.
import { paperworkOpenAt, type PaperworkDocType } from "@shared/constants/paperwork";

const statusFilters = ["All", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "Completed"];
// E6 — a chip is a QUESTION, not a status. "Completed" to a carrier is
// delivered with the paperwork in, which the pipeline spells three ways; the
// list read takes the set as a comma list (v3.8.bfc). Every other chip is its
// own status.
const FILTER_QUERY: Record<string, string> = {
  Completed: "POD_RECEIVED,INVOICED,COMPLETED",
};
const statusTransitions: Record<string, string[]> = {
  BOOKED: ["AT_PICKUP"],
  DISPATCHED: ["AT_PICKUP"],
  AT_PICKUP: ["LOADED"],
  LOADED: ["IN_TRANSIT"],
  IN_TRANSIT: ["AT_DELIVERY"],
  AT_DELIVERY: ["DELIVERED"],
};

export default function MyLoadsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkCallForm, setCheckCallForm] = useState({ city: "", state: "", notes: "" });
  // v3.8.awu — showBOL/BOLTemplate removed with the HTML BOL renderer.
  const [bolError, setBolError] = useState<string | null>(null);
  const [bolOpening, setBolOpening] = useState(false);
  // v3.8.awt — the rate-confirmation link is fetched, not navigated to, so its
  // failures need somewhere to land. The endpoint answers 403
  // DRIVER_NOT_VERIFIED with an instruction the carrier has to follow; before
  // this the link went to the Pages host and 404'd with nothing to read.
  const [rcError, setRcError] = useState<string | null>(null);
  const [rcOpening, setRcOpening] = useState(false);
  const queryClient = useQueryClient();

  // E2 — `?load=<id>` opens that load's detail, so the accept confirmation on
  // the Tenders page can point at the load it just booked. Read off
  // window.location rather than useSearchParams: this is a static export and
  // that hook needs a Suspense boundary the page does not otherwise want.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("load");
    if (id) setSelectedId(id);
  }, []);

  const query = new URLSearchParams();
  if (activeFilter !== "All") query.set("status", FILTER_QUERY[activeFilter] ?? activeFilter);
  query.set("page", String(page));
  query.set("limit", "20");

  const { data, isLoading } = useQuery({
    queryKey: ["carrier-my-loads", activeFilter, page],
    queryFn: () => api.get(`/carrier-loads/my-loads?${query.toString()}`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ["carrier-my-load-detail", selectedId],
    queryFn: () => api.get(`/carrier-loads/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const statusMutation = useMutation({
    mutationFn: ({ loadId, status }: { loadId: string; status: string }) =>
      api.post(`/carrier-loads/${loadId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-my-loads"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-load-detail", selectedId] });
    },
  });

  const checkCallMutation = useMutation({
    mutationFn: ({ loadId, data }: { loadId: string; data: any }) =>
      api.post(`/carrier-loads/${loadId}/check-call`, data),
    onSuccess: () => {
      setCheckCallForm({ city: "", state: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-load-detail", selectedId] });
    },
  });

  // E4 — one upload for every paperwork slot; the type is the slot's, chosen
  // in the panel. Was POD-only, on a card that existed at two statuses.
  const [paperworkError, setPaperworkError] = useState<string | null>(null);
  const docUploadMutation = useMutation({
    mutationFn: ({ loadId, file, docType }: { loadId: string; file: File; docType: PaperworkDocType }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", docType);
      return api.post(`/carrier-loads/${loadId}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onMutate: () => setPaperworkError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-my-loads"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-load-detail", selectedId] });
    },
    onError: async (err) => setPaperworkError(await extractApiError(err, "Upload failed. Please try again.")),
  });

  const loads = data?.loads || [];
  const nextStatuses = detail ? statusTransitions[detail.status] || [] : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-[#0A2540] mb-1">My Loads</h1>
        <p className="text-[13px] text-gray-500">Manage your assigned loads and update shipment status</p>
      </div>

      {/* Filters */}
      <CarrierCard padding="p-3" className="mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
                f === activeFilter ? "bg-[#0A2540] text-[#FBF7F0]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >{f === "All" ? "All" : f.replace(/_/g, " ")}</button>
          ))}
        </div>
      </CarrierCard>

      <div className="grid grid-cols-[1fr_400px] gap-5">
        {/* Load list */}
        <div className="space-y-2">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <CarrierCard key={i} padding="p-4"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CarrierCard>
            ))
          ) : loads.length === 0 ? (
            <CarrierCard padding="p-12">
              <div className="text-center text-gray-700 text-sm">No loads found</div>
            </CarrierCard>
          ) : (
            loads.map((load: Record<string, any>) => (
              <CarrierCard
                key={load.id}
                hover
                padding="p-4"
                onClick={() => setSelectedId(load.id)}
                className={selectedId === load.id ? "!border-[#C5A572]" : ""}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#0A2540]">{load.referenceNumber}</span>
                      <CarrierBadge status={load.status} />
                    </div>
                    <div className="text-xs text-gray-600">
                      {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                    </div>
                    <div className="text-[10px] text-gray-700 mt-1">
                      {load.equipmentType} &middot; Pick: {new Date(load.pickupDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    {(() => {
                      const step = carrierNextStep(load as any);
                      return step.text ? (
                        <div data-testid="next-step" className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${step.tone}`}>
                          <ArrowRight size={11} /> {step.text}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <span className="text-sm font-bold text-[#0A2540]">{money(carrierPay(load))}</span>
                </div>
              </CarrierCard>
            ))
          )}
          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {page > 1 && <button onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-xs rounded bg-gray-100">Prev</button>}
              <span className="px-3 py-1.5 text-xs text-gray-500">Page {page}/{data.totalPages}</span>
              {page < data.totalPages && <button onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-xs rounded bg-gray-100">Next</button>}
            </div>
          )}
        </div>

        {/* Detail + Actions */}
        <div className="space-y-4">
          {selectedId && detail ? (
            <>
              {/* Load info */}
              <CarrierCard padding="p-5">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-sm font-bold text-[#0A2540]">{detail.referenceNumber}</h3>
                  <CarrierBadge status={detail.status} size="md" />
                </div>
                {(() => {
                  const step = carrierNextStep(detail);
                  return (
                    <>
                      {step.text ? (
                        <div data-testid="next-step-detail" className={`flex items-start gap-1.5 mb-4 px-3 py-2 rounded-md text-xs font-medium ${step.tone}`}>
                          <ArrowRight size={13} className="mt-0.5 shrink-0" /> <span>{step.text}</span>
                        </div>
                      ) : null}
                      {step.key === "RC_SENT" && <RcSignPanel key={detail.id} loadId={detail.id} />}
                    </>
                  );
                })()}
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-[#BA7517] mt-0.5" />
                    <div>
                      <div className="font-medium">{detail.originCity}, {detail.originState} {detail.originZip || ""}</div>
                      <div className="text-gray-700">&darr;</div>
                      <div className="font-medium">{detail.destCity}, {detail.destState} {detail.destZip || ""}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100">
                    <div><span className="text-gray-700">Equipment</span><br />{detail.equipmentType}</div>
                    <div><span className="text-gray-700">Weight</span><br />{detail.weight ? `${Number(detail.weight).toLocaleString()} lbs` : "—"}</div>
                    <div><span className="text-gray-700">Pickup</span><br />{new Date(detail.pickupDate).toLocaleDateString()}</div>
                    <div><span className="text-gray-700">Delivery</span><br />{detail.deliveryDate ? new Date(detail.deliveryDate).toLocaleDateString() : "—"}</div>
                    <div><span className="text-gray-700">Rate</span><br /><span className="text-[#BA7517] font-bold">{money(carrierPay(detail))}</span></div>
                    <div><span className="text-gray-700">Distance</span><br />{detail.distance ? `${detail.distance} mi` : "—"}</div>
                  </div>
                  {detail.poster && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <Phone size={14} className="text-gray-700" />
                      <span>{detail.poster.company || `${detail.poster.firstName} ${detail.poster.lastName}`}</span>
                    </div>
                  )}
                  {detail.rateConfirmationPdfUrl && (
                    <>
                      <button
                        type="button"
                        disabled={rcOpening}
                        onClick={async () => {
                          setRcError(null);
                          setRcOpening(true);
                          try {
                            await openPdfFromApi(detail.rateConfirmationPdfUrl!);
                          } catch (err) {
                            setRcError(await extractApiError(err, "Couldn't open the rate confirmation."));
                          } finally {
                            setRcOpening(false);
                          }
                        }}
                        className="flex items-center gap-1.5 text-[#BA7517] font-semibold mt-2 hover:underline disabled:opacity-60"
                      >
                        <FileText size={14} /> {rcOpening ? "Opening…" : "View Rate Confirmation"}
                      </button>
                      {rcError && (
                        <p className="mt-1.5 text-[11px] text-[#9B2C2C] bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded px-2 py-1.5">
                          {rcError}
                        </p>
                      )}
                    </>
                  )}
                  {/* v3.8.awu — was a client-side HTML re-render of the BOL.
                      That component was a SECOND renderer for a legal document:
                      off-brand, carrying a hardcoded whaider@ and a banner
                      admitting it was pre-v2.9, while the real BOL is generated
                      by pdfService. Two renderers for one instrument is the
                      Load.rate defect in document form — nobody knows which is
                      authoritative until the two disagree in front of a shipper.
                      This now fetches the same PDF the AE sends.

                      E2 — the button is DISABLED with the reason shown until
                      the backend would allow it. Before this it rendered live
                      at every status and the refusal was a 403 after the tap.
                      The gate itself is unchanged: this is the same answer,
                      given in advance.

                      C6 — and the answer it gives is now the same answer. This
                      read `a tender at CONFIRMED` while bgs had moved the
                      backend onto the ACCEPTANCE, so a carrier who had accepted
                      their load was shown a disabled button on a document SRL
                      would have handed them, telling them to sign something
                      they had already agreed to. A mirror that has drifted from
                      the thing it mirrors is worse than no mirror: it is wrong
                      with the authority of looking deliberate. */}
                  {(() => {
                    const step = carrierNextStep(detail);
                    return (
                      <>
                        <button
                          type="button"
                          disabled={bolOpening || !step.bolReady}
                          aria-disabled={!step.bolReady}
                          title={step.bolReason ?? undefined}
                          onClick={async () => {
                            setBolError(null);
                            setBolOpening(true);
                            try {
                              await openPdfFromApi(`/pdf/bol-load/${detail.id}`);
                            } catch (err) {
                              setBolError(await extractApiError(err, "Couldn't open the bill of lading."));
                            } finally {
                              setBolOpening(false);
                            }
                          }}
                          className="flex items-center gap-1.5 text-[#BA7517] font-semibold mt-2 hover:underline text-xs disabled:opacity-60 disabled:no-underline disabled:cursor-not-allowed"
                        >
                          {step.bolReady ? <Printer size={14} /> : <Lock size={14} />} {bolOpening ? "Opening…" : "Bill of Lading"}
                        </button>
                        {!step.bolReady && step.bolReason && (
                          <p data-testid="bol-reason" className="mt-1 text-[11px] text-gray-600">{step.bolReason}</p>
                        )}
                      </>
                    );
                  })()}
                  {bolError && (
                    <p className="mt-1.5 text-[11px] text-[#9B2C2C] bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded px-2 py-1.5">
                      {bolError}
                    </p>
                  )}
                </div>
              </CarrierCard>

              {/* Driver and equipment, and the handset verification the rate
                  confirmation gate requires. Both endpoints existed since Arc 19
                  with no caller. Phase 0 of the mandatory-ELD arc. */}
              <DriverAssignmentPanel load={detail} />

              {/* Quick Pay election — the carrier's own choice on this load,
                  open until the rate confirmation is issued. */}
              <QuickPayElection loadId={selectedId} loadRate={carrierPay(detail) ?? 0} />

              {/* Status Update */}
              {nextStatuses.length > 0 && (
                <CarrierCard padding="p-4">
                  <h4 className="text-xs font-bold text-[#0A2540] mb-3 flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-[#BA7517]" /> Update Status
                  </h4>
                  <div className="flex gap-2">
                    {nextStatuses.map((ns) => (
                      <button
                        key={ns}
                        onClick={() => statusMutation.mutate({ loadId: selectedId, status: ns })}
                        disabled={statusMutation.isPending}
                        className="px-4 py-2 bg-[#BA7517] text-[#FBF7F0] text-xs font-semibold rounded-md disabled:opacity-60"
                      >
                        {ns.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                  {statusMutation.isError && (
                    <p className="text-xs text-[#9B2C2C] mt-2">{(statusMutation.error as any)?.response?.data?.error || "Update failed"}</p>
                  )}
                </CarrierCard>
              )}

              {/* E4 — paperwork, one row per ruling-6 slot, from CONFIRMED. Replaces
                  the POD-only card that rendered at DELIVERED/AT_DELIVERY and keyed
                  on Load.podUrl: the slots read the Document rows the detail now
                  carries, so what the carrier sees is what the AE's checklist reads. */}
              {paperworkOpenAt(carrierNextStep(detail).key) && (
                <PaperworkPanel
                  load={detail}
                  documents={detail.documents ?? []}
                  pending={docUploadMutation.isPending}
                  error={paperworkError}
                  onUpload={(docType, file) => { if (selectedId) docUploadMutation.mutate({ loadId: selectedId, file, docType }); }}
                />
              )}

              {/* Check Call */}
              {!["DELIVERED", "POD_RECEIVED", "COMPLETED", "CANCELLED"].includes(detail.status) && (
                <CarrierCard padding="p-4">
                  <h4 className="text-xs font-bold text-[#0A2540] mb-3 flex items-center gap-1.5">
                    <Clock size={14} className="text-[#B07A1A]" /> Submit Check Call
                  </h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      placeholder="City"
                      value={checkCallForm.city}
                      onChange={(e) => setCheckCallForm({ ...checkCallForm, city: e.target.value })}
                      className="px-3 py-2 border border-[#EFE6D3] rounded text-xs focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                    />
                    <input
                      placeholder="State"
                      value={checkCallForm.state}
                      onChange={(e) => setCheckCallForm({ ...checkCallForm, state: e.target.value })}
                      className="px-3 py-2 border border-[#EFE6D3] rounded text-xs focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                    />
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={checkCallForm.notes}
                    onChange={(e) => setCheckCallForm({ ...checkCallForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-[#EFE6D3] rounded text-xs mb-2 focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none resize-none"
                    rows={2}
                  />
                  <button
                    onClick={() => checkCallMutation.mutate({ loadId: selectedId, data: checkCallForm })}
                    disabled={checkCallMutation.isPending}
                    className="px-4 py-2 bg-[#BA7517] text-[#FBF7F0] text-xs font-semibold rounded-md disabled:opacity-60"
                  >
                    {checkCallMutation.isPending ? "Submitting..." : "Submit Check Call"}
                  </button>
                </CarrierCard>
              )}
            </>
          ) : (
            <CarrierCard padding="p-8">
              <div className="text-center text-gray-700 text-sm">
                <Truck size={32} className="mx-auto mb-3 text-gray-500" />
                Select a load to manage
              </div>
            </CarrierCard>
          )}
        </div>
      </div>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Quick Pay — how you want THIS load paid
// ═══════════════════════════════════════════════════════════════════════════
//
// The Caravan Quick Pay Agreement says twice that Quick Pay does not apply
// automatically: the carrier elects it on the loads they want it on and skips
// it on the ones they do not. GET/PUT /carrier-payments/loads/:loadId/
// quickpay-speed is the only writer of that election, and nothing in the portal
// called it — so no carrier could actually elect anything, and no carrier could
// decline. This is that control, on the screen where a carrier is already
// looking at the load.
//
// WHEN IT CLOSES. The fee is recorded on the load when its rate confirmation is
// issued, and after that it is what the paperwork says. The endpoint reports
// `locked` and this shows the frozen figure rather than a control that cannot
// win.
//
// The dollar figures are the fee against the load's rate, shown so the choice
// is between three prices rather than three words. At settlement the fee is
// charged on line haul plus fuel plus approved accessorials and NOT on anything
// reimbursed at cost, so it is described as approximate rather than quoted as
// final.

interface QpOption { speed: string; feePercent: number; label: string }
interface QpElection {
  speed: string | null;
  feePercent: number | null;
  locked: boolean;
  eligible: boolean;
  tier: string;
  options: QpOption[];
  /** Server-rendered attestation line, null when the carrier is not eligible. */
  attestation: string | null;
  /** The Quick Pay Agreement version the attestation is made under. */
  quickPayVersion: string | null;
}

const QP_SPEED_LABEL: Record<string, string> = {
  STANDARD: "Standard terms, no fee",
  SEVEN_DAY: "7-day Quick Pay",
  SAME_DAY: "Same-day Quick Pay",
};

// B2/6.5 — the local money() took a plain number and so could not express
// "no rate agreed yet". Replaced by the shared helper, which rounds the same
// way and returns an em-dash for null.

function QuickPayElection({ loadId, loadRate }: { loadId: string; loadRate: number }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{ label: string; href: string } | null>(null);

  const { data, isLoading } = useQuery<QpElection>({
    queryKey: ["carrier-load-quickpay", loadId],
    queryFn: () => api.get(`/carrier-payments/loads/${loadId}/quickpay-speed`).then((r) => r.data),
  });

  const elect = useMutation({
    mutationFn: (speed: string) => api.put(`/carrier-payments/loads/${loadId}/quickpay-speed`, { speed }),
    onSuccess: () => {
      setError(null);
      setAction(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-load-quickpay", loadId] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-load-detail", loadId] });
    },
    onError: (err: unknown) => {
      const res = (err as { response?: { data?: { error?: string; action?: { label: string; href: string } } } })?.response?.data;
      setError(res?.error || "Couldn't save your choice. Please try again.");
      setAction(res?.action ?? null);
    },
  });

  if (isLoading || !data) return null;

  // Nothing elected reads as standard terms: free, on your tier's net days.
  const current = data.speed ?? "STANDARD";

  // Locked — the rate confirmation has been issued, so the number on this load
  // is the number on their paperwork. Show it and say why it cannot move.
  if (data.locked) {
    const frozen = data.feePercent && data.feePercent > 0;
    return (
      <CarrierCard padding="p-4">
        <h4 className="text-xs font-bold text-[#0A2540] mb-2 flex items-center gap-1.5">
          <Lock size={14} className="text-gray-500" /> Quick Pay on this load
        </h4>
        <p className="text-xs text-gray-700">
          {frozen
            ? `${QP_SPEED_LABEL[current] ?? current} at ${data.feePercent}%${loadRate > 0 ? ` — about ${money((loadRate * (data.feePercent as number)) / 100)}` : ""}.`
            : "Standard terms, no fee."}
        </p>
        <p className="text-[11px] text-gray-500 mt-1.5">
          Set on your rate confirmation, so it cannot change here. Call your rep if it needs to.
        </p>
      </CarrierCard>
    );
  }

  // Not in the pilot, or in it without a signed agreement. Say what they are
  // paid instead, because that is the part that matters, and point at the one
  // page where anything can be done about it.
  if (!data.eligible) {
    return (
      <CarrierCard padding="p-4">
        <h4 className="text-xs font-bold text-[#0A2540] mb-2 flex items-center gap-1.5">
          <Zap size={14} className="text-gray-500" /> Quick Pay on this load
        </h4>
        <p className="text-xs text-gray-700">
          This load pays your standard tier terms, at no fee. Quick Pay is a limited pilot and is not on for your account.
        </p>
        <a href="/carrier/dashboard/activation" className="text-[11px] text-[#BA7517] font-semibold hover:underline mt-1.5 inline-block">
          See Quick Pay
        </a>
      </CarrierCard>
    );
  }

  return (
    <CarrierCard padding="p-4">
      <h4 className="text-xs font-bold text-[#0A2540] mb-1 flex items-center gap-1.5">
        <Zap size={14} className="text-[#BA7517]" /> How do you want this load paid?
      </h4>
      <p className="text-[11px] text-gray-500 mb-3">
        Your choice on this load only. Change it any time before we issue the rate confirmation.
      </p>

      {/* row 7d — the attestation, above the control that commits the choice.
          Server-rendered copy: the wording lives beside the agreement it
          quotes, and the version says which text the carrier is electing under
          rather than implying the current one. */}
      {data.attestation ? (
        <p className="text-[11px] leading-relaxed text-[#3A4A5F] bg-[#F5EEE0] border border-[rgba(10,37,64,0.10)] rounded-md px-3 py-2 mb-3">
          {data.attestation}
        </p>
      ) : null}

      <div className="space-y-1.5">
        {data.options.map((opt) => {
          const selected = opt.speed === current;
          const fee = opt.feePercent > 0 && loadRate > 0 ? (loadRate * opt.feePercent) / 100 : 0;
          return (
            <button
              key={opt.speed}
              onClick={() => elect.mutate(opt.speed)}
              disabled={elect.isPending}
              className={`w-full text-left px-3 py-2 rounded-md border text-xs transition disabled:opacity-60 ${
                selected
                  ? "border-[#BA7517] bg-[#FAEEDA] text-[#0A2540]"
                  : "border-[#EFE6D3] bg-white text-gray-700 hover:border-[#C5A572]"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{opt.label}</span>
                <span className={selected ? "text-[#BA7517] font-semibold" : "text-gray-500"}>
                  {opt.feePercent > 0 ? (fee > 0 ? `about ${money(fee)}` : `${opt.feePercent}%`) : "no fee"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {elect.isPending && (
        <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> Saving your choice...
        </p>
      )}

      {error && (
        <div className="mt-2 px-3 py-2 bg-[#F6E3E3] border-l-4 border-[#9B2C2C] text-[#9B2C2C] text-[11px] rounded">
          {error}
          {action && (
            <a href={action.href} className="block mt-1 font-semibold underline">
              {action.label}
            </a>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-500 mt-2">
        Fees are charged on what we pay you for the load, never on money we reimburse you at cost. The fee is confirmed in
        writing on your rate confirmation before you haul.
      </p>
    </CarrierCard>
  );
}

function Truck(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" />
    </svg>
  );
}

/**
 * E3 (ruling 3, 2026-09-21) -- the carrier signs the rate confirmation from
 * here, or asks for a fresh link, without an AE in the loop.
 *
 * "Sign the rate confirmation" is a REAL form POST, not an axios call. The
 * route answers a 303 to the single-use token page, which is a browser
 * navigation: an XHR follows the redirect invisibly and cannot hand the
 * resulting page to the tab, and returning the token to script would put a
 * stored secret in JSON. A native form is the one primitive that navigates and
 * carries the httpOnly cookie (the API is same-site with this app). Each POST
 * mints a fresh token and kills the previous link; that is the design, so
 * there is nothing to cache here.
 *
 * "Email me a new link" mints the same way and the server sends it to the
 * carrier email on file -- this button sends no address, and the server would
 * ignore one. The result and any refusal (rate-limited, RC not out yet) render
 * inline; the panel is keyed by load id so state never survives a switch.
 */
function RcSignPanel({ loadId }: { loadId: string }) {
  const [mail, setMail] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent"; to: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  return (
    <div data-testid="rc-sign-panel" className="mb-4 rounded-md border border-[#C5A572]/60 bg-[#FAEEDA] px-3 py-3">
      <form method="POST" action={apiHref(`/carrier-loads/${loadId}/rc-sign-link`)} data-testid="rc-sign-form">
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#BA7517] text-[#FBF7F0] text-xs font-semibold hover:brightness-110"
        >
          <FileText size={14} /> Sign the rate confirmation
        </button>
      </form>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="rc-sign-email"
          disabled={mail.kind === "sending"}
          onClick={async () => {
            setMail({ kind: "sending" });
            try {
              const r = await api.post(`/carrier-loads/${loadId}/rc-sign-link/email`);
              setMail({ kind: "sent", to: String(r.data?.sentTo ?? "the email on file") });
            } catch (err) {
              setMail({ kind: "error", message: await extractApiError(err, "Couldn't send a new link.") });
            }
          }}
          className="text-[11px] text-[#0A2540] underline disabled:opacity-60"
        >
          {mail.kind === "sending" ? "Sending…" : "Email me a new link"}
        </button>
        <span className="text-[11px] text-gray-600">Each new link replaces the last one.</span>
      </div>
      {mail.kind === "sent" && (
        <p data-testid="rc-sign-email-result" className="mt-1.5 text-[11px] text-[#2F7A4F] bg-[#E6F0E9] border border-[#2F7A4F]/30 rounded px-2 py-1.5">
          Sent to {mail.to}. The earlier link no longer works.
        </p>
      )}
      {mail.kind === "error" && (
        <p data-testid="rc-sign-email-result" className="mt-1.5 text-[11px] text-[#9B2C2C] bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded px-2 py-1.5">
          {mail.message}
        </p>
      )}
    </div>
  );
}
