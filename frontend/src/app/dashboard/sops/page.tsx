"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, FileText, BookOpen, Plus, Download, Trash2, X, Upload, Clock, User } from "lucide-react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
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
  { key: "compliance", label: "Compliance" },
  { key: "finance", label: "Finance" },
  { key: "hr", label: "HR" },
  { key: "sales", label: "Sales" },
];

const CATEGORY_COLORS: Record<string, string> = {
  operations: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  safety: "bg-red-500/20 text-red-300 border border-red-500/30",
  compliance: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  finance: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  hr: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  sales: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
};

const CATEGORY_ICONS: Record<string, string> = {
  operations: "bg-blue-500/10",
  safety: "bg-red-500/10",
  compliance: "bg-amber-500/10",
  finance: "bg-emerald-500/10",
  hr: "bg-purple-500/10",
  sales: "bg-cyan-500/10",
};

export default function SOPsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "ADMIN" || user?.role === "OPERATIONS" || user?.role === "CEO";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selectedSOP, setSelectedSOP] = useState<SOP | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", category: "operations", version: "1.0", author: "", description: "", content: "" });
  const [file, setFile] = useState<File | null>(null);

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
    mutationFn: async () => {
      const { data: created } = await api.post("/sops", form);
      if (file && created?.id) {
        const fd = new FormData();
        fd.append("file", file);
        await api.post(`/sops/${created.id}/upload`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      return created;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sops"] }); setShowCreate(false); setForm({ title: "", category: "operations", version: "1.0", author: "", description: "", content: "" }); setFile(null); },
  });

  const deleteSOP = useMutation({
    mutationFn: (id: string) => api.delete(`/sops/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sops"] }); setSelectedSOP(null); },
  });

  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "https://api.silkroutelogistics.ai/api").replace("/api", "");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SOP Library</h1>
          <p className="text-gray-600 text-sm mt-1">{data?.total || 0} documents</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 cursor-pointer">
            <Plus className="w-4 h-4" /> Create SOP
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SOPs..."
            className="w-full pl-9 pr-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                category === c.key
                  ? "bg-gold text-navy shadow-lg shadow-gold/20"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-100 hover:text-slate-200 border border-white/5"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {data?.sops?.map((sop) => {
            const catLower = sop.category?.toLowerCase();
            return (
              <button key={sop.id} onClick={() => setSelectedSOP(sop)}
                className={`w-full text-left bg-[#161921] rounded-xl border p-5 transition-all cursor-pointer hover:bg-white/[0.06] ${
                  selectedSOP?.id === sop.id ? "border-gold/60 bg-gold/[0.03]" : "border-gray-200 hover:border-white/20"
                }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${CATEGORY_ICONS[catLower] || "bg-gold/10"}`}>
                    <FileText className="w-5 h-5 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white">{sop.title}</p>
                    {sop.description && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{sop.description}</p>}
                    <div className="flex items-center gap-3 mt-2.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-gray-600"><Clock className="w-3 h-3" /> v{sop.version}</span>
                      <span>{sop.pages} pages</span>
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {sop.author}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${CATEGORY_COLORS[catLower] || "bg-white/10 text-gray-700"}`}>
                        {sop.category}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {(!data?.sops || data.sops.length === 0) && (
            <div className="text-center py-16 text-slate-500">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No SOPs found</p>
              <p className="text-xs text-slate-600 mt-1">Try adjusting your search or category filter</p>
            </div>
          )}
        </div>

        <div>
          {selectedSOP ? (
            <div className="bg-[#161921] rounded-xl border border-gray-200 p-5 space-y-4 sticky top-6">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${CATEGORY_ICONS[selectedSOP.category?.toLowerCase()] || "bg-gold/10"}`}>
                  <FileText className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{selectedSOP.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">v{selectedSOP.version} — {selectedSOP.author}</p>
                  <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${CATEGORY_COLORS[selectedSOP.category?.toLowerCase()] || "bg-white/10 text-gray-700"}`}>
                    {selectedSOP.category}
                  </span>
                </div>
              </div>
              {selectedSOP.description && <p className="text-sm text-gray-700 leading-relaxed">{selectedSOP.description}</p>}
              {selectedSOP.content && (
                <div className="bg-[#161921] rounded-lg p-4 text-sm text-gray-700 max-h-[400px] overflow-y-auto leading-relaxed whitespace-pre-wrap font-mono text-xs border border-white/5">
                  {selectedSOP.content}
                </div>
              )}
              {selectedSOP.fileUrl && (
                <div className="space-y-2">
                  <iframe src={`${baseUrl}${selectedSOP.fileUrl}`} className="w-full h-48 rounded-lg bg-slate-900 border border-gray-200" title="SOP Preview" />
                  <a href={`${baseUrl}${selectedSOP.fileUrl}`} download className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 cursor-pointer">
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <p className="text-[11px] text-slate-600">
                  Updated {new Date(selectedSOP.updatedAt).toLocaleDateString()}
                </p>
                {canEdit && (
                  <button onClick={() => { if (confirm("Delete this SOP?")) deleteSOP.mutate(selectedSOP.id); }}
                    className="flex items-center gap-1.5 text-red-400/80 text-xs hover:text-red-300 transition cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#161921] rounded-xl border border-gray-200 p-12 text-center">
              <BookOpen className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select a document to preview</p>
              <p className="text-xs text-slate-600 mt-1">Click any SOP from the list</p>
            </div>
          )}
        </div>
      </div>

      {/* Create SOP Drawer */}
      <SlideDrawer open={showCreate} onClose={() => setShowCreate(false)} title="Create SOP">
            <div className="space-y-4">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
            <div className="grid grid-cols-3 gap-3">
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white cursor-pointer focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20">
                <option value="operations">Operations</option>
                <option value="safety">Safety</option>
                <option value="compliance">Compliance</option>
                <option value="finance">Finance</option>
                <option value="hr">HR</option>
                <option value="sales">Sales</option>
              </select>
              <input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="Version"
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
              <input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} placeholder="Author"
                className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
            </div>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 min-h-[80px] focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
            <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Content..."
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 min-h-[120px] focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
            <div>
              <label className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-amber-500/50 cursor-pointer transition">
                <Upload className="w-4 h-4" />
                <span>{file ? file.name : "Attach file (PDF, DOCX, etc.)"}</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.xlsx,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              {file && (
                <button onClick={() => setFile(null)} className="text-xs text-red-400 hover:text-red-300 mt-1 cursor-pointer">Remove file</button>
              )}
            </div>
            <button onClick={() => createSOP.mutate()} disabled={!form.title || createSOP.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 cursor-pointer">
              {createSOP.isPending ? "Creating..." : "Create SOP"}
            </button>
            </div>
      </SlideDrawer>
    </div>
  );
}
