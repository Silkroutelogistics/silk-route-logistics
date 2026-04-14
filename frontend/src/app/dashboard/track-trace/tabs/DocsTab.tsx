"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Upload, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";

interface Props {
  load: any;
  loadId: string;
  onChange: () => void;
}

const LIFECYCLE = [
  { phase: "Pre-dispatch", docs: [
    { code: "RATE_CON",       label: "Rate confirmation / Tender" },
    { code: "BOL",            label: "Bill of lading (original)" },
  ]},
  { phase: "In transit", docs: [
    { code: "SIGNED_BOL_PU",  label: "Signed BOL (pickup)" },
    { code: "SIGNED_BOL_DEL", label: "Signed BOL (delivery)" },
  ]},
  { phase: "Post-delivery", docs: [
    { code: "POD",     label: "Proof of delivery (POD)" },
    { code: "INVOICE", label: "Invoice" },
  ]},
];

const LIFECYCLE_BAR = ["RATE_CON", "BOL", "SIGNED_BOL_PU", "POD", "INVOICE"];

export function DocsTab({ load, loadId, onChange }: Props) {
  const [preview, setPreview] = useState<any>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const docs: any[] = load.documents ?? [];

  const findDoc = (code: string) => docs.find((d) => d.docType === code);

  const upload = useMutation({
    mutationFn: async ({ file, code }: { file: File; code: string }) => {
      const form = new FormData();
      form.append("files", file);
      form.append("entityType", "LOAD");
      form.append("entityId", loadId);
      form.append("loadId", loadId);
      form.append("docType", code);
      const res = await api.post("/documents/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => { setUploading(null); onChange(); },
    onError: () => setUploading(null),
  });

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/documents/${id}`, { status })).data,
    onSuccess: onChange,
  });

  const statusPill = (doc: any) => {
    if (!doc) return <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><Clock className="w-3 h-3" /> Missing</span>;
    if (doc.status === "VERIFIED") return <span className="inline-flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="w-3 h-3" /> Verified</span>;
    if (doc.status === "REJECTED") return <span className="inline-flex items-center gap-1 text-[11px] text-red-700"><XCircle className="w-3 h-3" /> Rejected</span>;
    return <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><Clock className="w-3 h-3" /> Pending</span>;
  };

  if (preview) {
    return (
      <div className="space-y-3">
        <button onClick={() => setPreview(null)} className="text-xs text-[#854F0B] hover:underline">← Back to list</button>
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
    <div className="space-y-6 text-sm">
      {LIFECYCLE.map((phase) => (
        <div key={phase.phase}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{phase.phase}</h3>
          <div className="space-y-2">
            {phase.docs.map((d) => {
              const doc = findDoc(d.code);
              return (
                <div key={d.code} className="border border-gray-200 rounded-lg p-3 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{d.label}</div>
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
                    <label className="px-2 py-1 text-xs text-[#854F0B] border border-[#BA7517]/40 bg-[#FAEEDA]/40 rounded hover:bg-[#FAEEDA] cursor-pointer">
                      <Upload className="w-3 h-3 inline mr-1" />
                      {uploading === d.code ? "…" : "Upload"}
                      <input
                        type="file" className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) { setUploading(d.code); upload.mutate({ file: f, code: d.code }); }
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Lifecycle bar */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Lifecycle</h3>
        <div className="flex items-center gap-1">
          {LIFECYCLE_BAR.map((code, i) => {
            const done = !!findDoc(code);
            return (
              <div key={code} className="flex items-center flex-1">
                <div className={`flex-1 h-2 rounded ${done ? "bg-[#BA7517]" : "border border-dashed border-gray-300"}`} />
                {i < LIFECYCLE_BAR.length - 1 && <span className="w-1" />}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          {LIFECYCLE_BAR.map((c) => <span key={c}>{c.replace("_", " ")}</span>)}
        </div>
      </div>
    </div>
  );
}
