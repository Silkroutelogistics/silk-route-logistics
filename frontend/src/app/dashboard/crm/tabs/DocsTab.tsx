"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FileText, Upload, CheckCircle2, XCircle, Clock } from "lucide-react";

// Shipper/customer document categories (v3.5.c). Carrier-side docs
// (COI from carrier, broker-carrier agreement) live in the Carrier Pool
// module and are intentionally excluded here.
const CATEGORIES = [
  { code: "W9",                    label: "W-9" },
  { code: "CREDIT_APP",            label: "Credit application" },
  { code: "RATE_AGREEMENT",        label: "Rate agreement" },
  { code: "CUSTOMER_CONTRACT",     label: "Customer contract" },
  { code: "TAX_EXEMPTION",         label: "Tax exemption certificate" },
  { code: "SRL_COI",               label: "COI (provided by SRL)" },
  { code: "PAYMENT_AUTHORIZATION", label: "Payment authorization" },
  { code: "OTHER",                 label: "Other" },
];

export function DocsTab({ customerId, onChange }: { customerId: string; onChange: () => void }) {
  const [preview, setPreview] = useState<any>(null);
  const [uploadingCode, setUploadingCode] = useState<string | null>(null);

  const q = useQuery<{ documents: any[] }>({
    queryKey: ["crm-docs", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/documents`)).data,
  });

  const upload = useMutation({
    mutationFn: async ({ file, code }: { file: File; code: string }) => {
      const form = new FormData();
      form.append("files", file);
      form.append("entityType", "CUSTOMER");
      form.append("entityId", customerId);
      form.append("docType", code);
      return (await api.post("/documents/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })).data;
    },
    onSuccess: () => { setUploadingCode(null); q.refetch(); onChange(); },
    onError: () => setUploadingCode(null),
  });

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/documents/${id}`, { status })).data,
    onSuccess: () => q.refetch(),
  });

  const docs = q.data?.documents ?? [];
  const findDoc = (code: string) => docs.find((d) => d.docType === code);

  const statusPill = (d: any) => {
    if (!d) return <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><Clock className="w-3 h-3" /> Missing</span>;
    if (d.status === "VERIFIED") return <span className="inline-flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="w-3 h-3" /> On file</span>;
    if (d.status === "REJECTED") return <span className="inline-flex items-center gap-1 text-[11px] text-red-700"><XCircle className="w-3 h-3" /> Rejected</span>;
    return <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><Clock className="w-3 h-3" /> Pending</span>;
  };

  if (preview) {
    return (
      <div className="space-y-3">
        <button onClick={() => setPreview(null)} className="text-xs text-[#C5A572] hover:underline">← Back to list</button>
        <div className="font-medium text-gray-900">{preview.fileName}</div>
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
          {preview.fileType?.includes("pdf") ? (
            <iframe src={preview.fileUrl} className="w-full h-[520px]" title={preview.fileName} />
          ) : (
            <img src={preview.fileUrl} alt={preview.fileName} className="w-full" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {CATEGORIES.map((cat) => {
        const doc = findDoc(cat.code);
        return (
          <div key={cat.code} className="border border-gray-200 rounded-lg p-3 bg-white flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{cat.label}</div>
                <div>{statusPill(doc)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {doc && (
                <>
                  <button onClick={() => setPreview(doc)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">View</button>
                  {doc.status !== "VERIFIED" && (
                    <button
                      onClick={() => patchStatus.mutate({ id: doc.id, status: "VERIFIED" })}
                      className="px-2 py-1 text-xs text-green-700 border border-green-200 rounded hover:bg-green-50"
                    >Verify</button>
                  )}
                </>
              )}
              <label className="px-2 py-1 text-xs text-[#BA7517] border border-[#BA7517]/40 bg-[#FAEEDA]/40 rounded hover:bg-[#FAEEDA] cursor-pointer">
                <Upload className="w-3 h-3 inline mr-1" />
                {uploadingCode === cat.code ? "…" : "Upload"}
                <input
                  type="file" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setUploadingCode(cat.code); upload.mutate({ file: f, code: cat.code }); }
                  }}
                />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
