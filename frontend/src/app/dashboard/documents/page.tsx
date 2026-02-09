"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Image, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { FileUpload } from "@/components/ui/FileUpload";

interface Doc {
  id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number; createdAt: string;
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);

  const { data: documents } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.get<Doc[]>("/documents").then((r) => r.data),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      return api.post("/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Documents</h1>

      {/* Upload Section */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5 text-gold" />
          <h2 className="font-semibold text-white">Upload Documents</h2>
        </div>
        <FileUpload files={files} onChange={setFiles} maxFiles={5} />
        {files.length > 0 && (
          <button onClick={() => upload.mutate()} disabled={upload.isPending}
            className="mt-4 px-6 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50 transition text-sm">
            {upload.isPending ? "Uploading..." : `Upload ${files.length} file(s)`}
          </button>
        )}
      </div>

      {/* Documents List */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Your Documents</h2>
        </div>
        <div className="divide-y divide-white/5">
          {documents?.map((doc) => (
            <div key={doc.id} className="flex items-center gap-4 px-5 py-4">
              {doc.fileType === "application/pdf" ? (
                <FileText className="w-8 h-8 text-red-400 shrink-0" />
              ) : (
                <Image className="w-8 h-8 text-blue-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-white truncate">{doc.fileName}</p>
                <p className="text-xs text-slate-500">
                  {(doc.fileSize / 1024).toFixed(0)} KB &middot; {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => deleteDoc.mutate(doc.id)}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {(!documents || documents.length === 0) && (
            <div className="px-5 py-12 text-center text-slate-500 text-sm">No documents uploaded yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
