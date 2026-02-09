"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Image, Trash2, Upload, Download, Search, Filter, Calendar,
  FolderOpen, File, Shield, Receipt, Package, ChevronDown, ChevronUp, Eye,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { FileUpload } from "@/components/ui/FileUpload";

interface Doc {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  loadId: string | null;
  invoiceId: string | null;
  createdAt: string;
}

const CATEGORIES = [
  { key: "all", label: "All Documents", icon: FolderOpen },
  { key: "pdf", label: "PDFs", icon: FileText },
  { key: "image", label: "Images", icon: Image },
  { key: "load", label: "Load Docs", icon: Package },
  { key: "invoice", label: "Invoice Docs", icon: Receipt },
];

function categorize(doc: Doc): string {
  if (doc.loadId) return "load";
  if (doc.invoiceId) return "invoice";
  if (doc.fileType === "application/pdf") return "pdf";
  if (doc.fileType.startsWith("image/")) return "image";
  return "other";
}

function fileIcon(doc: Doc) {
  if (doc.fileType === "application/pdf") return <FileText className="w-8 h-8 text-red-400 shrink-0" />;
  if (doc.fileType.startsWith("image/")) return <Image className="w-8 h-8 text-blue-400 shrink-0" />;
  return <File className="w-8 h-8 text-slate-400 shrink-0" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [loadId, setLoadId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");

  const { data: documents } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.get<Doc[]>("/documents").then((r) => r.data),
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      if (loadId) fd.append("loadId", loadId);
      if (invoiceId) fd.append("invoiceId", invoiceId);
      return api.post("/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      setFiles([]);
      setLoadId("");
      setInvoiceId("");
      setShowUpload(false);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const allDocs = documents || [];
  const filtered = allDocs.filter((doc) => {
    if (category !== "all" && categorize(doc) !== category) return false;
    if (search && !doc.fileName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const catCounts: Record<string, number> = { all: allDocs.length };
  allDocs.forEach((d) => {
    const cat = categorize(d);
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  const totalSize = allDocs.reduce((s, d) => s + d.fileSize, 0);

  const downloadDoc = (doc: Doc) => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:4000";
    const a = document.createElement("a");
    a.href = `${backendUrl}${doc.fileUrl}`;
    a.download = doc.fileName;
    a.target = "_blank";
    a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-slate-400 text-sm mt-1">{allDocs.length} files &middot; {formatSize(totalSize)} total</p>
        </div>
        <button onClick={() => setShowUpload(!showUpload)}
          className="px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 transition text-sm flex items-center gap-2">
          <Upload className="w-4 h-4" /> Upload
        </button>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="w-5 h-5 text-gold" />
            <h2 className="font-semibold text-white">Upload Documents</h2>
          </div>
          <FileUpload files={files} onChange={setFiles} maxFiles={5} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Associate with Load ID (optional)</label>
              <input value={loadId} onChange={(e) => setLoadId(e.target.value)} placeholder="Load ID"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Associate with Invoice ID (optional)</label>
              <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice ID"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
          </div>
          {files.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending}
                className="px-6 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50 transition text-sm">
                {uploadMut.isPending ? "Uploading..." : `Upload ${files.length} file(s)`}
              </button>
              <button onClick={() => { setFiles([]); setShowUpload(false); }}
                className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Category Tabs + Search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const count = catCounts[cat.key] || 0;
            return (
              <button key={cat.key} onClick={() => setCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  category === cat.key ? "bg-gold/20 text-gold border border-gold/30" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {cat.label}
                {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files..."
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((doc) => (
          <div key={doc.id} className="bg-white/5 rounded-xl border border-white/10 p-4 hover:bg-white/[0.07] transition group">
            <div className="flex items-start gap-3">
              {fileIcon(doc)}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-white truncate" title={doc.fileName}>{doc.fileName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{formatSize(doc.fileSize)}</p>
                <p className="text-xs text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</p>
                <div className="flex gap-1 mt-1.5">
                  {doc.loadId && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">Load</span>}
                  {doc.invoiceId && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">Invoice</span>}
                  <span className="px-1.5 py-0.5 bg-white/10 text-slate-400 rounded text-[10px]">{doc.fileType.split("/")[1]?.toUpperCase() || "FILE"}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition">
              <button onClick={() => downloadDoc(doc)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition">
                <Download className="w-3 h-3" /> Download
              </button>
              <button onClick={() => { if (confirm("Delete this document?")) deleteDoc.mutate(doc.id); }}
                className="px-2 py-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <FolderOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No documents found</p>
        </div>
      )}
    </div>
  );
}
