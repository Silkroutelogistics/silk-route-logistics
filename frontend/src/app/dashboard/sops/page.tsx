"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, FileText, BookOpen, Plus, Download, Trash2, Edit3, X } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuthStore";

interface SOP {
  id: string; title: string; category: string; version: string; author: string;
  description: string | null; content: string | null; fileUrl: string | null;
  pages: number; createdAt: string; updatedAt: string;
}

const categories = [
  { key: "", label: "All" },
  { key: "operations", label: "Operations" },
  { key: "safety", label: "Safety" },
  { key: "finance", label: "Finance" },
  { key: "hr", label: "HR" },
];

const CATEGORY_COLORS: Record<string, string> = {
  operations: "bg-blue-500/20 text-blue-400",
  safety: "bg-red-500/20 text-red-400",
  finance: "bg-green-500/20 text-green-400",
  hr: "bg-purple-500/20 text-purple-400",
};

export default function SOPsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "ADMIN" || user?.role === "OPERATIONS";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selectedSOP, setSelectedSOP] = useState<SOP | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", category: "operations", version: "1.0", author: "", description: "", content: "" });

  const { data } = useQuery({
    queryKey: ["sops", search, category],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      return api.get<{ sops: SOP[]; total: number }>(`/sops?${params.toString()}`).then((r) => r.data);
    },
  });

  const createSOP = useMutation({
    mutationFn: () => api.post("/sops", form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sops"] }); setShowCreate(false); setForm({ title: "", category: "operations", version: "1.0", author: "", description: "", content: "" }); },
  });

  const deleteSOP = useMutation({
    mutationFn: (id: string) => api.delete(`/sops/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sops"] }); setSelectedSOP(null); },
  });

  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:4000";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SOP Library</h1>
          <p className="text-slate-400 text-sm mt-1">{data?.total || 0} documents</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
            <Plus className="w-4 h-4" /> Create SOP
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SOPs..."
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <div className="flex gap-2">
          {categories.map((c) => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={`px-3 py-2 rounded-lg text-sm transition ${category === c.key ? "bg-gold text-navy" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {data?.sops?.map((sop) => (
            <button key={sop.id} onClick={() => setSelectedSOP(sop)}
              className={`w-full text-left bg-white/5 rounded-xl border p-5 transition ${selectedSOP?.id === sop.id ? "border-gold" : "border-white/10 hover:border-white/20"}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{sop.title}</p>
                  {sop.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{sop.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>v{sop.version}</span>
                    <span>{sop.pages} pages</span>
                    <span>{sop.author}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${CATEGORY_COLORS[sop.category] || "bg-white/10 text-slate-300"}`}>{sop.category}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
          {(!data?.sops || data.sops.length === 0) && (
            <div className="text-center py-12 text-slate-500"><BookOpen className="w-8 h-8 mx-auto mb-3 opacity-50" /><p>No SOPs found</p></div>
          )}
        </div>

        <div>
          {selectedSOP ? (
            <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-4 sticky top-6">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-gold" />
                <div>
                  <p className="font-medium text-white">{selectedSOP.title}</p>
                  <p className="text-xs text-slate-400">v{selectedSOP.version} — {selectedSOP.author}</p>
                </div>
              </div>
              {selectedSOP.description && <p className="text-sm text-slate-300">{selectedSOP.description}</p>}
              {selectedSOP.content && (
                <div className="bg-white/5 rounded-lg p-3 text-sm text-slate-300 max-h-48 overflow-y-auto">{selectedSOP.content}</div>
              )}
              {selectedSOP.fileUrl && (
                <div className="space-y-2">
                  <iframe src={`${baseUrl}${selectedSOP.fileUrl}`} className="w-full h-48 rounded-lg bg-white" title="SOP Preview" />
                  <a href={`${baseUrl}${selectedSOP.fileUrl}`} download className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              )}
              {canEdit && (
                <button onClick={() => { if (confirm("Delete this SOP?")) deleteSOP.mutate(selectedSOP.id); }}
                  className="flex items-center gap-2 text-red-400 text-sm hover:text-red-300">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
              <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select a document to preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create SOP</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            <div className="grid grid-cols-3 gap-3">
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                <option value="operations" className="bg-navy">Operations</option>
                <option value="safety" className="bg-navy">Safety</option>
                <option value="finance" className="bg-navy">Finance</option>
                <option value="hr" className="bg-navy">HR</option>
              </select>
              <input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="Version"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} placeholder="Author"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white min-h-[80px]" />
            <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Content..."
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white min-h-[120px]" />
            <button onClick={() => createSOP.mutate()} disabled={!form.title || createSOP.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Create SOP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
