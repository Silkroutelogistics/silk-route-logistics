"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ImageIcon, Upload, Send } from "lucide-react";

interface Props {
  load: any;
  loadId: string;
  onChange: () => void;
}

const CATEGORIES = [
  {
    group: "Pickup photos",
    photos: [
      { code: "PHOTO_LOADED", label: "Loaded trailer" },
      { code: "PHOTO_SEAL",   label: "Seal photo" },
    ],
  },
  {
    group: "Receipts & tickets",
    photos: [
      { code: "RECEIPT_MECHANICAL", label: "Mechanical repair receipt" },
      { code: "RECEIPT_LUMPER",     label: "Lumper receipt" },
      { code: "RECEIPT_SCALE",      label: "Scale ticket" },
      { code: "PHOTO_DAMAGE",       label: "Damage photo" },
    ],
  },
  {
    group: "Delivery photos",
    photos: [
      { code: "PHOTO_EMPTY", label: "Empty trailer" },
    ],
  },
];

export function PhotosTab({ load, loadId, onChange }: Props) {
  const [preview, setPreview] = useState<any>(null);

  const docs: any[] = load.documents ?? [];
  const photoDocs = docs.filter((d) =>
    d.docType?.startsWith("PHOTO_") || d.docType?.startsWith("RECEIPT_")
  );

  const upload = useMutation({
    mutationFn: async ({ file, code }: { file: File; code: string }) => {
      const form = new FormData();
      form.append("files", file);
      form.append("entityType", "LOAD");
      form.append("entityId", loadId);
      form.append("loadId", loadId);
      form.append("docType", code);
      return (await api.post("/documents/upload", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: onChange,
  });

  if (preview) {
    return (
      <div className="space-y-3">
        <button onClick={() => setPreview(null)} className="text-xs text-[#C5A572] hover:underline">← Back</button>
        <div className="font-medium">{preview.fileName}</div>
        <img src={preview.fileUrl} alt={preview.fileName} className="w-full border border-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-sm">
      <button className="w-full flex items-center justify-center gap-2 py-2 border border-[#BA7517]/40 bg-[#FAEEDA]/30 text-[#BA7517] rounded-lg hover:bg-[#FAEEDA]/60">
        <Send className="w-4 h-4" /> Request from driver
      </button>

      {CATEGORIES.map((g) => (
        <div key={g.group}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{g.group}</h3>
          <div className="grid grid-cols-3 gap-2">
            {g.photos.map((p) => {
              const existing = photoDocs.find((d) => d.docType === p.code);
              return (
                <div key={p.code} className="border border-gray-200 rounded-lg p-2 bg-white">
                  {existing ? (
                    <button onClick={() => setPreview(existing)} className="block w-full">
                      <div className="aspect-square bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                        <img src={existing.fileUrl} alt={p.label} className="object-cover w-full h-full" />
                      </div>
                    </button>
                  ) : (
                    <label className="block cursor-pointer">
                      <div className="aspect-square bg-gray-50 border border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-400 hover:text-[#BA7517] hover:border-[#BA7517]">
                        <Upload className="w-5 h-5" />
                        <span className="text-[10px] mt-0.5">Upload</span>
                      </div>
                      <input
                        type="file" accept="image/*" className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) upload.mutate({ file: f, code: p.code });
                        }}
                      />
                    </label>
                  )}
                  <div className="mt-1 text-[10px] text-gray-600 truncate">{p.label}</div>
                  {existing && (
                    <div className="text-[9px] text-gray-700">
                      {new Date(existing.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {photoDocs.length === 0 && (
        <div className="text-center py-6 text-gray-400 flex flex-col items-center gap-2">
          <ImageIcon className="w-8 h-8" />
          <div className="text-xs">No photos yet.</div>
        </div>
      )}
    </div>
  );
}
