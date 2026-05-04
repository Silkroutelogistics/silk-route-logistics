"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import {
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";

/* ─── Types ─── */

interface TagRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface TagAssignment {
  id: string;
  entityType: string;
  entityId: string;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
  description: string | null;
  entityTypes: string[];
  model?: string;
  type?: string;
  rules: TagRule[];
  _count: { assignments: number };
  createdAt: string;
  updatedAt: string;
}

type DetailTab = "details" | "rules" | "assignments";

/* ─── Constants ─── */

const PRESET_COLORS = [
  "#C9A84C", "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280",
  "#F43F5E", "#14B8A6", "#A855F7", "#0EA5E9", "#84CC16",
];

const ENTITY_TYPE_OPTIONS = ["LOAD", "CARRIER", "CUSTOMER", "INVOICE", "DRIVER"];

const OPERATOR_OPTIONS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "ends_with", label: "Ends With" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "in", label: "In (comma-separated)" },
];

const FIELD_OPTIONS = [
  "status", "origin_state", "dest_state", "equipment_type",
  "customer_name", "carrier_name", "lane", "commodity",
  "weight", "rate", "distance", "region",
];

const TYPE_BADGE: Record<string, string> = {
  MANUAL:    "bg-slate-500/15 text-gray-600 border-slate-500/20",
  AUTO:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  SYSTEM:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
};

const MODEL_BADGE: Record<string, string> = {
  LOAD:      "bg-violet-500/15 text-violet-400 border-violet-500/20",
  CARRIER:   "bg-sky-500/15 text-sky-400 border-sky-500/20",
  CUSTOMER:  "bg-amber-500/15 text-amber-400 border-amber-500/20",
  INVOICE:   "bg-green-500/15 text-green-400 border-green-500/20",
  DRIVER:    "bg-rose-500/15 text-rose-400 border-rose-500/20",
};

/* ─── Helpers ─── */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Main Page ─── */

export default function TaggingRulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // UI state
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<TagItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#C9A84C");
  const [formDescription, setFormDescription] = useState("");
  const [formEntityTypes, setFormEntityTypes] = useState<string[]>([]);

  // New rule form state
  const [ruleField, setRuleField] = useState(FIELD_OPTIONS[0]);
  const [ruleOperator, setRuleOperator] = useState("equals");
  const [ruleValue, setRuleValue] = useState("");

  // ─── Queries ───

  const { data: tags, isLoading } = useQuery<TagItem[]>({
    queryKey: ["tags"],
    queryFn: () => api.get("/tags").then((r) => r.data),
  });

  const filtered = useMemo(() => {
    if (!tags) return [];
    if (!search.trim()) return tags;
    const q = search.toLowerCase();
    return tags.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [tags, search]);

  // ─── Mutations ───

  const createTag = useMutation({
    mutationFn: (data: { name: string; color: string; description: string; entityTypes: string[] }) =>
      api.post("/tags", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast("Tag created", "success");
      closeDrawer();
    },
    onError: () => toast("Failed to create tag", "error"),
  });

  const updateTag = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; color: string; description: string; entityTypes: string[] }) =>
      api.patch(`/tags/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast("Tag updated", "success");
      closeDrawer();
    },
    onError: () => toast("Failed to update tag", "error"),
  });

  const deleteTag = useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast("Tag deleted", "success");
      if (selectedTag) setSelectedTag(null);
    },
    onError: () => toast("Failed to delete tag", "error"),
  });

  const addRule = useMutation({
    mutationFn: ({ tagId, ...data }: { tagId: string; field: string; operator: string; value: string }) =>
      api.post(`/tags/${tagId}/rules`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast("Rule added", "success");
      setRuleValue("");
    },
    onError: () => toast("Failed to add rule", "error"),
  });

  const deleteRule = useMutation({
    mutationFn: (ruleId: string) => api.delete(`/tags/rules/${ruleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast("Rule removed", "success");
    },
    onError: () => toast("Failed to remove rule", "error"),
  });

  const updateAllTags = useMutation({
    mutationFn: () => api.post("/tags/apply-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast("All tag rules re-applied", "success");
    },
    onError: () => toast("Failed to update tags", "error"),
  });

  // ─── Helpers ───

  function openCreateDrawer() {
    setEditingTag(null);
    setFormName("");
    setFormColor("#C9A84C");
    setFormDescription("");
    setFormEntityTypes([]);
    setDrawerOpen(true);
  }

  function openEditDrawer(tag: TagItem) {
    setEditingTag(tag);
    setFormName(tag.name);
    setFormColor(tag.color);
    setFormDescription(tag.description || "");
    setFormEntityTypes(tag.entityTypes || []);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingTag(null);
  }

  function handleSubmit() {
    const payload = {
      name: formName.trim(),
      color: formColor,
      description: formDescription.trim(),
      entityTypes: formEntityTypes,
    };
    if (!payload.name) {
      toast("Tag name is required", "error");
      return;
    }
    if (editingTag) {
      updateTag.mutate({ id: editingTag.id, ...payload });
    } else {
      createTag.mutate(payload);
    }
  }

  function toggleEntityType(et: string) {
    setFormEntityTypes((prev) =>
      prev.includes(et) ? prev.filter((x) => x !== et) : [...prev, et]
    );
  }

  function handleAddRule() {
    if (!selectedTag || !ruleValue.trim()) return;
    addRule.mutate({
      tagId: selectedTag.id,
      field: ruleField,
      operator: ruleOperator,
      value: ruleValue.trim(),
    });
  }

  // Keep selectedTag in sync with fresh data
  const activeTag = useMemo(() => {
    if (!selectedTag || !tags) return null;
    return tags.find((t) => t.id === selectedTag.id) || null;
  }, [selectedTag, tags]);

  // ─── Render ───

  return (
    <div className="space-y-6 text-white">
      <div className="flex h-[calc(100vh-4rem)]">
        {/* ─── Main Content ─── */}
        <div className={cn("flex-1 overflow-y-auto p-6 transition-all", activeTag && "pr-0")}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Tag className="w-6 h-6 text-[#C5A572]" />
                Tagging Rules Engine
              </h1>
              <p className="text-sm text-white/50 mt-1">
                Create and manage auto-tagging rules for loads, carriers, customers, and more
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateAllTags.mutate()}
                disabled={updateAllTags.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C5A572]/30 text-[#C5A572] hover:bg-[#C5A572]/10 transition text-sm font-medium disabled:opacity-50"
              >
                {updateAllTags.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Update All Tags
              </button>
              <button
                onClick={openCreateDrawer}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C5A572] text-black font-medium hover:bg-[#C5A572]/90 transition text-sm"
              >
                <Plus className="w-4 h-4" />
                Create Tag Rule
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C5A572]/40 transition"
            />
          </div>

          {/* Stats Row */}
          {tags && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Total Tags", value: tags.length },
                { label: "With Rules", value: tags.filter((t) => t.rules.length > 0).length },
                { label: "Total Assignments", value: tags.reduce((acc, t) => acc + t._count.assignments, 0) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/5 px-4 py-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider">{s.label}</p>
                  <p className="text-xl font-bold text-[#C5A572] mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[#C5A572]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-white/40">
              <Tag className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No tags found. Create one to get started.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Model</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Tag</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Description</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Rules</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Assigned</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Created</th>
                    <th className="text-right px-4 py-3 text-white/50 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tag) => (
                    <tr
                      key={tag.id}
                      onClick={() => {
                        setSelectedTag(tag);
                        setDetailTab("details");
                      }}
                      className={cn(
                        "border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition",
                        activeTag?.id === tag.id && "bg-white/[0.04]"
                      )}
                    >
                      {/* Model */}
                      <td className="px-4 py-3">
                        {tag.entityTypes?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tag.entityTypes.map((et) => (
                              <span
                                key={et}
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded-full border",
                                  MODEL_BADGE[et] || "bg-gray-100 text-white/60 border-gray-200"
                                )}
                              >
                                {et}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">--</span>
                        )}
                      </td>

                      {/* Tag Name + Color */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-gray-200"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="font-medium">{tag.name}</span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full border",
                            TYPE_BADGE[tag.type || "MANUAL"] || TYPE_BADGE.MANUAL
                          )}
                        >
                          {tag.type || "MANUAL"}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="text-white/60 text-xs truncate block">
                          {tag.description || "--"}
                        </span>
                      </td>

                      {/* Rules Count */}
                      <td className="px-4 py-3">
                        <span className="text-white/60">{tag.rules.length}</span>
                      </td>

                      {/* Assignments Count */}
                      <td className="px-4 py-3">
                        <span className="text-white/60">{tag._count.assignments}</span>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-white/40 text-xs">
                        {formatDate(tag.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDrawer(tag);
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-50 text-white/40 hover:text-[#C5A572] transition"
                            title="Edit tag"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete tag "${tag.name}"?`)) {
                                deleteTag.mutate(tag.id);
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-50 text-white/40 hover:text-red-400 transition"
                            title="Delete tag"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ─── Right Detail Panel ─── */}
        {activeTag && (
          <div className="w-[400px] shrink-0 border-l border-white/5 bg-white/[0.02] overflow-y-auto">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full border border-gray-200"
                  style={{ backgroundColor: activeTag.color }}
                />
                <h3 className="font-semibold text-sm">{activeTag.name}</h3>
              </div>
              <button
                onClick={() => setSelectedTag(null)}
                className="p-1 rounded hover:bg-gray-50 text-white/40 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mini Tabs */}
            <div className="flex border-b border-white/5">
              {(["details", "rules", "assignments"] as DetailTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition",
                    detailTab === tab
                      ? "text-[#C5A572] border-b-2 border-[#C5A572]"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  {tab}
                  {tab === "rules" && ` (${activeTag.rules.length})`}
                  {tab === "assignments" && ` (${activeTag._count.assignments})`}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {/* ─── Details Tab ─── */}
              {detailTab === "details" && (
                <div className="space-y-5">
                  <div>
                    <label className="text-xs text-white/40 uppercase tracking-wider">Name</label>
                    <p className="mt-1 text-sm font-medium">{activeTag.name}</p>
                  </div>

                  <div>
                    <label className="text-xs text-white/40 uppercase tracking-wider">Color</label>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className="w-8 h-8 rounded-lg border border-gray-200"
                        style={{ backgroundColor: activeTag.color }}
                      />
                      <span className="text-sm font-mono text-white/60">{activeTag.color}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-white/40 uppercase tracking-wider">Description</label>
                    <p className="mt-1 text-sm text-white/70">{activeTag.description || "No description"}</p>
                  </div>

                  <div>
                    <label className="text-xs text-white/40 uppercase tracking-wider">Entity Types</label>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {activeTag.entityTypes?.length > 0 ? (
                        activeTag.entityTypes.map((et) => (
                          <span
                            key={et}
                            className={cn(
                              "text-xs px-2.5 py-1 rounded-full border",
                              MODEL_BADGE[et] || "bg-gray-100 text-white/60 border-gray-200"
                            )}
                          >
                            {et}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">None specified</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-white/40 uppercase tracking-wider">Type</label>
                    <div className="mt-1">
                      <span
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-full border",
                          TYPE_BADGE[activeTag.type || "MANUAL"] || TYPE_BADGE.MANUAL
                        )}
                      >
                        {activeTag.type || "MANUAL"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-white/40 uppercase tracking-wider">Created</label>
                      <p className="mt-1 text-sm text-white/60">{formatDate(activeTag.createdAt)}</p>
                    </div>
                    <div>
                      <label className="text-xs text-white/40 uppercase tracking-wider">Updated</label>
                      <p className="mt-1 text-sm text-white/60">{formatDate(activeTag.updatedAt)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => openEditDrawer(activeTag)}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[#C5A572]/30 text-[#C5A572] hover:bg-[#C5A572]/10 transition text-sm font-medium"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit Tag
                  </button>
                </div>
              )}

              {/* ─── Rules Tab ─── */}
              {detailTab === "rules" && (
                <div className="space-y-4">
                  {/* Existing rules */}
                  {activeTag.rules.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">
                      No auto-apply rules. Add one below.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeTag.rules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5"
                        >
                          <div className="text-xs">
                            <span className="text-[#C5A572] font-medium">{rule.field}</span>
                            <span className="text-white/40 mx-1.5">
                              {OPERATOR_OPTIONS.find((o) => o.value === rule.operator)?.label || rule.operator}
                            </span>
                            <span className="text-white/70 font-mono">{rule.value}</span>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm("Delete this rule?")) {
                                deleteRule.mutate(rule.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-gray-50 text-white/30 hover:text-red-400 transition shrink-0 ml-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add rule form */}
                  <div className="border-t border-white/5 pt-4">
                    <h4 className="text-xs text-white/40 uppercase tracking-wider mb-3">Add Rule</h4>

                    <div className="space-y-2.5">
                      <select
                        value={ruleField}
                        onChange={(e) => setRuleField(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-sm text-white focus:outline-none focus:border-[#C5A572]/40 transition appearance-none"
                      >
                        {FIELD_OPTIONS.map((f) => (
                          <option key={f} value={f} className="">
                            {f}
                          </option>
                        ))}
                      </select>

                      <select
                        value={ruleOperator}
                        onChange={(e) => setRuleOperator(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-sm text-white focus:outline-none focus:border-[#C5A572]/40 transition appearance-none"
                      >
                        {OPERATOR_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value} className="">
                            {o.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        placeholder="Value..."
                        value={ruleValue}
                        onChange={(e) => setRuleValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C5A572]/40 transition"
                      />

                      <button
                        onClick={handleAddRule}
                        disabled={!ruleValue.trim() || addRule.isPending}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#C5A572] text-black font-medium text-sm hover:bg-[#C5A572]/90 transition disabled:opacity-50"
                      >
                        {addRule.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        Add Rule
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Assignments Tab ─── */}
              {detailTab === "assignments" && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-white/[0.03] border border-white/5 px-4 py-6 text-center">
                    <p className="text-3xl font-bold text-[#C5A572]">{activeTag._count.assignments}</p>
                    <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">
                      Entities Tagged
                    </p>
                  </div>

                  {activeTag.entityTypes?.length > 0 && (
                    <div>
                      <label className="text-xs text-white/40 uppercase tracking-wider">Applies To</label>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {activeTag.entityTypes.map((et) => (
                          <span
                            key={et}
                            className={cn(
                              "text-xs px-2.5 py-1 rounded-full border",
                              MODEL_BADGE[et] || "bg-gray-100 text-white/60 border-gray-200"
                            )}
                          >
                            {et}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 text-center">
                    View tagged entities from their respective pages (Loads, Carriers, etc.)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Create / Edit Drawer ─── */}
      <SlideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingTag ? "Edit Tag" : "Create Tag Rule"}
      >
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Tag Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., High Priority, Reefer, West Coast"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40 focus:border-[#C5A572]"
            />
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Color</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setFormColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition hover:scale-110",
                    formColor === c ? "border-gray-800 ring-2 ring-offset-2 ring-[#C5A572]" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-lg border border-gray-200"
                style={{ backgroundColor: formColor }}
              />
              <input
                type="text"
                value={formColor}
                onChange={(e) => setFormColor(e.target.value)}
                placeholder="#C9A84C"
                className="w-32 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40 focus:border-[#C5A572]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Describe what this tag represents..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40 focus:border-[#C5A572] resize-none"
            />
          </div>

          {/* Entity Types */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Entity Types</label>
            <div className="flex flex-wrap gap-2">
              {ENTITY_TYPE_OPTIONS.map((et) => (
                <button
                  key={et}
                  onClick={() => toggleEntityType(et)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                    formEntityTypes.includes(et)
                      ? "bg-[#C5A572]/10 border-[#C5A572]/40 text-[#C5A572]"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-200"
                  )}
                >
                  {et}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSubmit}
              disabled={createTag.isPending || updateTag.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#C5A572] text-black font-medium hover:bg-[#C5A572]/90 transition disabled:opacity-50"
            >
              {(createTag.isPending || updateTag.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {editingTag ? "Update Tag" : "Create Tag"}
            </button>
          </div>
        </div>
      </SlideDrawer>
    </div>
  );
}
