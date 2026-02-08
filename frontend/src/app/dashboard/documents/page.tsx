"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Image, Trash2 } from "lucide-react";
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Documents</h1>

      {/* Upload Section */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Upload Documents</h2>
        <FileUpload files={files} onChange={setFiles} maxFiles={5} />
        {files.length > 0 && (
          <button onClick={() => upload.mutate()} disabled={upload.isPending}
            className="mt-4 px-6 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition text-sm">
            {upload.isPending ? "Uploading..." : `Upload ${files.length} file(s)`}
          </button>
        )}
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Your Documents</h2>
        </div>
        <div className="divide-y">
          {documents?.map((doc) => (
            <div key={doc.id} className="flex items-center gap-4 px-5 py-4">
              {doc.fileType === "application/pdf" ? (
                <FileText className="w-8 h-8 text-red-500 shrink-0" />
              ) : (
                <Image className="w-8 h-8 text-blue-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{doc.fileName}</p>
                <p className="text-xs text-slate-400">
                  {(doc.fileSize / 1024).toFixed(0)} KB &middot; {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => deleteDoc.mutate(doc.id)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {(!documents || documents.length === 0) && (
            <div className="px-5 py-12 text-center text-slate-400 text-sm">No documents uploaded yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
