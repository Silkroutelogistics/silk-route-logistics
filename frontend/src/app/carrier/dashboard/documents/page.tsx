"use client";

import { useState, useRef } from "react";
import { File, Download, Search, Shield, FileText, CheckCircle, Upload, X, Loader2, Camera } from "lucide-react";
import { BTN } from "@/lib/carrierUi";

// carrier-portal-upgrade F2/G43 — the server refuses a file over 10MB
// (config/upload.ts), so the page says so before a driver on a weak signal waits
// for an upload that cannot succeed.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PAPERWORK_DOC_TYPES, PAPERWORK_DOC_LABELS } from "@shared/constants/paperwork";
import { CarrierCard } from "@/components/carrier";
import { apiHref, openPdfFromApi, extractApiError } from "@/lib/download";
import { useStepUp } from "@/hooks/useStepUp";
import { StepUpPrompt } from "@/components/carrier";

// v3.8.awt — `fileUrl` is now optional and is NOT a browser target. For stored
// documents it holds `s3://bucket/key`, which nothing in a browser can open; the
// row is reached by id through /documents/:id/download instead. `pdfPath` is the
// api-relative path for generated PDFs that have no Document row (the rate
// confirmation).
interface DocItem { id: string; fileName: string; fileUrl?: string; pdfPath?: string; docType?: string; type?: string; loadRef?: string; createdAt?: string; uploaded?: string; uploadedAt?: string }
interface LoadWithDocs { id: string; referenceNumber: string; status?: string; originCity?: string; originState?: string; destCity?: string; destState?: string; documents?: DocItem[]; rateConfirmationPdfUrl?: string; podUrl?: string; bolPdfUrl?: string }

// E4 (ruling 6, 2026-09-21) — the upload picker speaks the paperwork
// vocabulary the settlement checklist reads. Bare "BOL" is gone from the
// carrier's list: the ORIGINAL bill of lading is the AE's pre-dispatch
// attachment, and what a carrier hands in is a SIGNED copy — at pickup or at
// delivery, each its own type. The labels come from the shared table so the
// picker, the paperwork panel and the AE's checklist name a document the
// same way.
//
// RATE_CON is not offered either (v3.8.bfu): the signed rate confirmation is
// system-generated, frozen by its contentHash and signed through the token
// page, so a carrier-uploaded copy would be a second, unverified record of
// the same document. The server refuses one from a CARRIER (400) whichever
// route carries it; the generated RC still appears on the list below by its
// api path. AE roles keep the type on their own upload surface.
const DOC_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  ...PAPERWORK_DOC_TYPES.map((value) => ({ value, label: PAPERWORK_DOC_LABELS[value] })),
  { value: "W9", label: "W-9 Form" },
  { value: "COI", label: "Insurance Certificate" },
  { value: "AUTHORITY", label: "Authority Document" },
  { value: "OTHER", label: "Other" },
];

const COMPLIANCE_TYPES = ["W9", "COI", "AUTHORITY", "OTHER"];

export default function CarrierDocumentsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  // One gate for every way a file arrives (picker, camera, drop).
  const choose = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setSelectedFile(null);
      setSizeError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB; take a smaller photo or scan at a lower resolution.`);
      return;
    }
    setSizeError(null);
    setSelectedFile(file);
  };
  const [showUpload, setShowUpload] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("POD");
  const [uploadLoadId, setUploadLoadId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // v3.8.awt — opening a generated PDF is a fetch now, so its failures need a
  // surface. Previously a broken link simply opened a tab onto a 404 page.
  const [docError, setDocError] = useState<string | null>(null);
  // B7b — replacing a compliance document takes a fresh authenticator code.
  // The SERVER decides which types (W-9, COI, authority, workers' comp,
  // BOC-3); this only turns its 403 into a prompt and replays. PODs and BOLs
  // go to /carrier-loads and never see it.
  const stepUp = useStepUp("compliance-document");

  const { data: compliance } = useQuery({
    queryKey: ["carrier-compliance-docs"],
    queryFn: () => api.get("/carrier-compliance/documents").then((r) => r.data),
  });

  const { data: myLoads } = useQuery({
    queryKey: ["carrier-my-loads-docs"],
    queryFn: () => api.get("/carrier-loads/my-loads?limit=100").then((r) => r.data),
  });

  const uploadMutation = useMutation({
    mutationFn: async (): Promise<"done" | "cancelled"> => {
      if (!selectedFile) throw new Error("No file selected");

      // v3.8.aqn — the two destinations expect DIFFERENT multer field names, so
      // the FormData must be built per branch. It was previously built once with
      // "file", which is correct for /carrier-loads/:id/documents
      // (upload.single("file")) but wrong for /documents/upload
      // (upload.array("files")). Multer rejects an unexpected field name outright
      // — verified: LIMIT_UNEXPECTED_FILE / HTTP 400 — so EVERY carrier
      // compliance-document upload (W-9, COI, authority) failed from the portal.
      const isLoadDoc = !COMPLIANCE_TYPES.includes(uploadDocType);

      if (isLoadDoc && uploadLoadId) {
        const formData = new FormData();
        formData.append("file", selectedFile); // upload.single("file")
        formData.append("docType", uploadDocType);
        await api.post(`/carrier-loads/${uploadLoadId}/documents`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        return "done";
      }

      // B7b — the FormData is rebuilt inside the callback because a step-up
      // replay re-sends the bytes. A failure that is NOT the step-up ask is
      // recorded here and rethrown so run() sees it; run() resolves false for
      // both that and a cancelled prompt, and only one of them is an error.
      let failure: string | null = null;
      const ok = await stepUp.run((headers) => {
        const formData = new FormData();
        formData.append("files", selectedFile); // upload.array("files")
        formData.append("docType", uploadDocType);
        formData.append("type", uploadDocType);
        return api.post("/documents/upload", formData, {
          headers: { "Content-Type": "multipart/form-data", ...headers },
        }).catch((e) => {
          if (!(e?.response?.status === 403 && e?.response?.data?.code === "STEP_UP_REQUIRED")) {
            failure = e?.response?.data?.error || "Upload failed";
          }
          throw e;
        });
      });
      if (ok) return "done";
      if (failure) throw new Error(failure);
      return "cancelled";
    },
    onSuccess: (outcome) => {
      if (outcome === "cancelled") return; // nothing happened; leave the form as it was
      queryClient.invalidateQueries({ queryKey: ["carrier-compliance-docs"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-loads-docs"] });
      setSelectedFile(null);
      setShowUpload(false);
      setUploadDocType("POD");
      setUploadLoadId("");
    },
  });

  const complianceDocs = compliance?.documents || [];
  const loads = myLoads?.loads || [];

  // Collect all documents from loads
  const loadDocs: DocItem[] = [];
  loads.forEach((load: LoadWithDocs) => {
    if (load.documents) {
      load.documents.forEach((doc: DocItem) => {
        loadDocs.push({ ...doc, loadRef: load.referenceNumber });
      });
    }
    // v3.8.awt — the rate confirmation is a GENERATED pdf, not an uploaded file,
    // so it has no Document row and is reached by its api path. `pdfPath` marks
    // it as fetch-and-open rather than navigate.
    if (load.rateConfirmationPdfUrl) {
      loadDocs.push({ id: `rc-${load.id}`, fileName: `RateCon_${load.referenceNumber}.pdf`, pdfPath: load.rateConfirmationPdfUrl, docType: "RATE_CON", loadRef: load.referenceNumber });
    }
    // The synthetic POD row is gone. It was built from Load.podUrl, which holds
    // `s3://bucket/key` in production — a scheme no browser can load, so the row
    // rendered a View/Download pair that could never resolve. It was also
    // redundant: the POD upload creates a real Document row (carrierLoads.ts:545)
    // and the loads query already includes docType POD, so the same file is in
    // load.documents above with an id that /documents/:id/download can serve.
  });

  const allDocs = [...complianceDocs, ...loadDocs];
  const typeCounts = new Map<string, number>();
  allDocs.forEach((d) => {
    const t = d.docType || d.type || "OTHER";
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  });

  const typeLabels: Record<string, string> = {
    ...PAPERWORK_DOC_LABELS,
    // Bare BOL still labels the AE's original on the list, and RATE_CON the
    // generated rate confirmation row; only the picker dropped them.
    BOL: "Bill of Lading (original)", RATE_CON: "Rate Confirmation",
    W9: "W-9 Form", COI: "Insurance Cert", AUTHORITY: "Authority Doc", OTHER: "Other",
  };

  const isLoadDocType = !COMPLIANCE_TYPES.includes(uploadDocType);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    choose(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-[#0A2540] mb-1">Documents</h1>
          <p className="text-[13px] text-[#5B6B7D]">All your compliance documents, rate confirmations, BOLs, and PODs</p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(!showUpload)}
          aria-expanded={showUpload}
          className={BTN.primary}
        >
          <Upload size={14} aria-hidden="true" /> Upload Document
        </button>
      </div>

      {/* Upload Panel */}
      {showUpload && (
        <CarrierCard padding="p-5" className="mb-5 border-[#C5A572]/30">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-[#0A2540] flex items-center gap-2">
              <Upload size={16} className="text-[#BA7517]" /> Upload Document
            </h3>
            <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null); setSizeError(null); }} aria-label="Close upload" className={`inline-flex h-11 w-11 items-center justify-center rounded text-[#5B6B7D] hover:bg-[#F5EEE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]`}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label htmlFor="doc-type" className="text-xs text-[#3A4A5F] block mb-1">Document Type</label>
              <select
                id="doc-type"
                value={uploadDocType}
                onChange={(e) => { setUploadDocType(e.target.value); setUploadLoadId(""); }}
                className="w-full min-h-[44px] px-3 py-2 border border-[#EFE6D3] rounded text-sm bg-white transition-colors duration-150 motion-reduce:transition-none focus:border-[#BA7517] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]/40"
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {isLoadDocType && (
              <div>
                <label htmlFor="doc-load" className="text-xs text-[#3A4A5F] block mb-1">Load Reference</label>
                <select
                  id="doc-load"
                  value={uploadLoadId}
                  onChange={(e) => setUploadLoadId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-[#EFE6D3] rounded text-sm bg-white transition-colors duration-150 motion-reduce:transition-none focus:border-[#BA7517] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]/40"
                >
                  <option value="">Select a load...</option>
                  {loads.map((load: LoadWithDocs) => (
                    <option key={load.id} value={load.id}>{load.referenceNumber}: {load.originCity} → {load.destCity}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label={selectedFile ? `Selected file ${selectedFile.name}. Choose a different file` : "Choose a file to upload"}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileRef.current?.click(); } }}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517] ${
              dragOver ? "border-[#C5A572] bg-[#BA7517]/5" : "border-[#EFE6D3] hover:border-[#C5A572]/50"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileText size={18} className="text-[#BA7517]" />
                <span className="text-sm font-medium text-[#0A2540]">{selectedFile.name}</span>
                <span className="text-[11px] text-[#3A4A5F]">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} aria-label="Remove the selected file" className={`inline-flex h-11 w-11 items-center justify-center rounded text-[#5B6B7D] hover:text-[#9B2C2C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]`}>
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <Upload size={24} className="mx-auto mb-2 text-[#5B6B7D]" />
                <p className="text-xs text-[#5B6B7D]">Drag and drop, or tap to choose a file</p>
                <p className="text-[11px] text-[#3A4A5F] mt-1">PDF, JPEG, PNG up to 10 MB</p>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
            <button type="button" onClick={() => cameraRef.current?.click()} className={BTN.secondary}>
              <Camera size={14} aria-hidden="true" /> Take a photo
            </button>
            <span className="text-[11px] text-[#5B6B7D]">Opens the camera on a phone.</span>
          </div>
          {sizeError && <p role="alert" className="text-xs text-[#9B2C2C] mt-2">{sizeError}</p>}

          {uploadMutation.isError && (
            <p role="alert" className="text-xs text-[#9B2C2C] mt-2">{(uploadMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error || (uploadMutation.error as Error)?.message || "Upload failed"}</p>
          )}

          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => { if (!uploadMutation.isPending) uploadMutation.mutate(); }}
              disabled={!selectedFile || (isLoadDocType && !uploadLoadId) || uploadMutation.isPending}
              title={!selectedFile ? "Choose a file first" : isLoadDocType && !uploadLoadId ? "Choose the load this document belongs to" : undefined}
              className={BTN.primary}
            >
              {uploadMutation.isPending ? <><Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Uploading...</> : "Upload"}
            </button>
          </div>
        </CarrierCard>
      )}

      {/* Type counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[...typeCounts.entries()].slice(0, 4).map(([type, count]) => (
          <CarrierCard key={type} padding="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#BA7517]/10 flex items-center justify-center">
                <FileText size={18} className="text-[#BA7517]" />
              </div>
              <div>
                <div className="text-lg font-bold text-[#0A2540]">{count}</div>
                <div className="text-[11px] text-[#3A4A5F]">{typeLabels[type] || type}</div>
              </div>
            </div>
          </CarrierCard>
        ))}
      </div>

      {/* Compliance Documents */}
      {complianceDocs.length > 0 && (
        <CarrierCard padding="p-0" className="mb-5">
          <div className="px-5 py-4 border-b border-[#F5EEE0]">
            <h3 className="text-[15px] font-bold text-[#0A2540] flex items-center gap-2">
              <Shield size={16} className="text-[#2A5B8B]" /> Compliance Documents
            </h3>
          </div>
          {complianceDocs.map((doc: DocItem, i: number) => (
            <div key={doc.id || i} className="px-4 sm:px-5 py-3.5 border-b border-[#F5EEE0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-md bg-[#2A5B8B]/10 flex items-center justify-center">
                  <Shield size={16} className="text-[#2A5B8B]" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0A2540] break-all">{doc.fileName || doc.type}</div>
                  <div className="text-[11px] text-[#3A4A5F]">{doc.docType || doc.type}</div>
                </div>
              </div>
              {doc.uploaded || doc.fileUrl ? (
                <CheckCircle size={16} className="text-[#2F7A4F]" />
              ) : (
                <span className="text-[11px] text-[#9B2C2C] font-medium">Missing</span>
              )}
            </div>
          ))}
        </CarrierCard>
      )}

      {/* Load Documents */}
      <CarrierCard padding="p-0">
        <div className="px-5 py-4 border-b border-[#F5EEE0]">
          <h3 className="text-[15px] font-bold text-[#0A2540]">Load Documents</h3>
        </div>
        {docError && (
          <div className="mx-5 mt-3 text-[12px] text-[#9B2C2C] bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded px-3 py-2">
            {docError}
          </div>
        )}
        {loadDocs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[#3A4A5F]">No load documents yet. Rate confirmations, bills of lading and proofs of delivery appear here once a load is booked.</div>
        ) : (
          loadDocs.slice(0, 20).map((doc: DocItem) => (
            <div key={doc.id} className="px-4 sm:px-5 py-3.5 border-b border-[#F5EEE0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-md bg-[#9B2C2C]/10 flex items-center justify-center">
                  <File size={16} className="text-[#9B2C2C]" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0A2540] break-all">{doc.fileName}</div>
                  <div className="text-[11px] text-[#3A4A5F]">{doc.docType || "DOC"} &middot; {doc.loadRef}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {/* v3.8.awt — two mechanisms, because the two kinds of row are
                    reached differently. A generated PDF (pdfPath) is fetched
                    through the api client and opened as a blob, so its errors
                    are readable. A stored document is NAVIGATED to on the API
                    host, because /documents/:id/download 302s to presigned
                    storage and an XHR cannot follow that hop — connect-src
                    lists no storage host. Neither is a bare fileUrl any more:
                    that held `s3://…`, which a browser cannot open at all. */}
                {doc.pdfPath && (
                  <button
                    type="button"
                    onClick={async () => {
                      setDocError(null);
                      try {
                        await openPdfFromApi(doc.pdfPath!);
                      } catch (err) {
                        setDocError(await extractApiError(err, "Could not open this document."));
                      }
                    }}
                    aria-label={`View ${doc.fileName}`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded px-2 text-[#3A4A5F] text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 motion-reduce:transition-none hover:text-[#854F0B] hover:bg-[#F5EEE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]"
                  >
                    <Search size={14} aria-hidden="true" /> View
                  </button>
                )}
                {!doc.pdfPath && !doc.id.startsWith("rc-") && (
                  <>
                    <a href={apiHref(`/documents/${doc.id}/download`)} target="_blank" rel="noopener noreferrer" aria-label={`View ${doc.fileName}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded px-2 text-[#3A4A5F] text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 motion-reduce:transition-none hover:text-[#854F0B] hover:bg-[#F5EEE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]">
                      <Search size={14} aria-hidden="true" /> View
                    </a>
                    <a href={apiHref(`/documents/${doc.id}/download`)} aria-label={`Download ${doc.fileName}`} title="Download" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded px-2 text-[#3A4A5F] text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 motion-reduce:transition-none hover:text-[#854F0B] hover:bg-[#F5EEE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]">
                      <Download size={14} aria-hidden="true" />
                    </a>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </CarrierCard>
      {/* B7b — without this mounted, useStepUp opens a prompt nobody renders and
          the upload resolves false in silence: the carrier clicks Upload and
          nothing happens, with no error to read. */}
      <StepUpPrompt
        open={stepUp.prompting}
        title="Confirm this document"
        description="Your compliance documents decide which loads you can be tendered, so we ask for a code from your authenticator app before replacing one. Bills of lading and proofs of delivery never need this."
        verifying={stepUp.verifying}
        error={stepUp.error}
        onSubmit={stepUp.submitCode}
        onCancel={stepUp.cancel}
      />
    </div>
  );
}
