"use client";

import { useState, useRef } from "react";
import { File, Download, Search, Shield, FileText, CheckCircle, Upload, X, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";

const DOC_TYPE_OPTIONS = [
  { value: "BOL", label: "Bill of Lading" },
  { value: "POD", label: "Proof of Delivery" },
  { value: "RATE_CON", label: "Rate Confirmation" },
  { value: "W9", label: "W-9 Form" },
  { value: "COI", label: "Insurance Certificate" },
  { value: "AUTHORITY", label: "Authority Document" },
  { value: "OTHER", label: "Other" },
];

const COMPLIANCE_TYPES = ["W9", "COI", "AUTHORITY", "OTHER"];

export default function CarrierDocumentsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("POD");
  const [uploadLoadId, setUploadLoadId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: compliance } = useQuery({
    queryKey: ["carrier-compliance-docs"],
    queryFn: () => api.get("/carrier-compliance/documents").then((r) => r.data),
  });

  const { data: myLoads } = useQuery({
    queryKey: ["carrier-my-loads-docs"],
    queryFn: () => api.get("/carrier-loads/my-loads?limit=100").then((r) => r.data),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("docType", uploadDocType);

      const isLoadDoc = !COMPLIANCE_TYPES.includes(uploadDocType);
      if (isLoadDoc && uploadLoadId) {
        return api.post(`/carrier-loads/${uploadLoadId}/documents`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        formData.append("type", uploadDocType);
        return api.post("/documents/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
    },
    onSuccess: () => {
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
  const loadDocs: any[] = [];
  loads.forEach((load: any) => {
    if (load.documents) {
      load.documents.forEach((doc: any) => {
        loadDocs.push({ ...doc, loadRef: load.referenceNumber });
      });
    }
    if (load.rateConfirmationPdfUrl) {
      loadDocs.push({ id: `rc-${load.id}`, fileName: `RateCon_${load.referenceNumber}.pdf`, fileUrl: load.rateConfirmationPdfUrl, docType: "RATE_CON", loadRef: load.referenceNumber });
    }
    if (load.podUrl) {
      loadDocs.push({ id: `pod-${load.id}`, fileName: `POD_${load.referenceNumber}.pdf`, fileUrl: load.podUrl, docType: "POD", loadRef: load.referenceNumber });
    }
  });

  const allDocs = [...complianceDocs, ...loadDocs];
  const typeCounts = new Map<string, number>();
  allDocs.forEach((d) => {
    const t = d.docType || d.type || "OTHER";
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  });

  const typeLabels: Record<string, string> = {
    BOL: "Bill of Lading", POD: "Proof of Delivery", RATE_CON: "Rate Confirmation",
    W9: "W-9 Form", COI: "Insurance Cert", AUTHORITY: "Authority Doc", OTHER: "Other",
  };

  const isLoadDocType = !COMPLIANCE_TYPES.includes(uploadDocType);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Documents</h1>
          <p className="text-[13px] text-gray-500">All your compliance documents, rate confirmations, BOLs, and PODs</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-white text-xs font-semibold rounded-md hover:shadow-lg transition-shadow"
        >
          <Upload size={14} /> Upload Document
        </button>
      </div>

      {/* Upload Panel */}
      {showUpload && (
        <CarrierCard padding="p-5" className="mb-5 border-[#C9A84C]/30">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-[#0D1B2A] flex items-center gap-2">
              <Upload size={16} className="text-[#C9A84C]" /> Upload Document
            </h3>
            <button onClick={() => { setShowUpload(false); setSelectedFile(null); }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Document Type</label>
              <select
                value={uploadDocType}
                onChange={(e) => { setUploadDocType(e.target.value); setUploadLoadId(""); }}
                className="w-full px-3 py-2 border border-gray-200 rounded text-xs focus:border-[#C9A84C] focus:outline-none bg-white"
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {isLoadDocType && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Load Reference</label>
                <select
                  value={uploadLoadId}
                  onChange={(e) => setUploadLoadId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded text-xs focus:border-[#C9A84C] focus:outline-none bg-white"
                >
                  <option value="">Select a load...</option>
                  {loads.map((load: any) => (
                    <option key={load.id} value={load.id}>{load.referenceNumber} — {load.originCity} → {load.destCity}</option>
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
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver ? "border-[#C9A84C] bg-[#C9A84C]/5" : "border-gray-200 hover:border-[#C9A84C]/50"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileText size={18} className="text-[#C9A84C]" />
                <span className="text-sm font-medium text-[#0D1B2A]">{selectedFile.name}</span>
                <span className="text-[11px] text-gray-400">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-gray-400 hover:text-red-500 ml-1">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <Upload size={24} className="mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-500">Drag & drop or click to select</p>
                <p className="text-[10px] text-gray-400 mt-1">PDF, JPEG, PNG up to 10MB</p>
              </>
            )}
          </div>

          {uploadMutation.isError && (
            <p className="text-xs text-red-500 mt-2">{(uploadMutation.error as any)?.response?.data?.error || "Upload failed"}</p>
          )}

          <div className="flex justify-end mt-4">
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || (isLoadDocType && !uploadLoadId) || uploadMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0D1B2A] text-white text-xs font-semibold rounded-md disabled:opacity-40"
            >
              {uploadMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Uploading...</> : "Upload"}
            </button>
          </div>
        </CarrierCard>
      )}

      {/* Type counts */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[...typeCounts.entries()].slice(0, 4).map(([type, count]) => (
          <CarrierCard key={type} padding="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
                <FileText size={18} className="text-[#C9A84C]" />
              </div>
              <div>
                <div className="text-lg font-bold text-[#0D1B2A]">{count}</div>
                <div className="text-[11px] text-gray-400">{typeLabels[type] || type}</div>
              </div>
            </div>
          </CarrierCard>
        ))}
      </div>

      {/* Compliance Documents */}
      {complianceDocs.length > 0 && (
        <CarrierCard padding="p-0" className="mb-5">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-[15px] font-bold text-[#0D1B2A] flex items-center gap-2">
              <Shield size={16} className="text-violet-500" /> Compliance Documents
            </h3>
          </div>
          {complianceDocs.map((doc: any, i: number) => (
            <div key={doc.id || i} className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-violet-500/10 flex items-center justify-center">
                  <Shield size={16} className="text-violet-500" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0D1B2A]">{doc.fileName || doc.type}</div>
                  <div className="text-[11px] text-gray-400">{doc.docType || doc.type}</div>
                </div>
              </div>
              {doc.uploaded || doc.fileUrl ? (
                <CheckCircle size={16} className="text-emerald-500" />
              ) : (
                <span className="text-[11px] text-red-500 font-medium">Missing</span>
              )}
            </div>
          ))}
        </CarrierCard>
      )}

      {/* Load Documents */}
      <CarrierCard padding="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-[15px] font-bold text-[#0D1B2A]">Load Documents</h3>
        </div>
        {loadDocs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">No load documents yet</div>
        ) : (
          loadDocs.slice(0, 20).map((doc: any) => (
            <div key={doc.id} className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-red-500/10 flex items-center justify-center">
                  <File size={16} className="text-red-500" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0D1B2A]">{doc.fileName}</div>
                  <div className="text-[11px] text-gray-400">{doc.docType || "DOC"} &middot; {doc.loadRef}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {doc.fileUrl && (
                  <>
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
                      <Search size={14} /> View
                    </a>
                    <a href={doc.fileUrl} download className="inline-flex items-center gap-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
                      <Download size={14} />
                    </a>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </CarrierCard>
    </div>
  );
}
