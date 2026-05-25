"use client";

/**
 * v3.8.akj §13.3 Item 8.7 — Manual tag-management UI.
 *
 * Pre-akj the HTTP endpoints POST + DELETE /tags/assign had ZERO
 * frontend callers despite being defined since the tag system shipped.
 * The auto-tagger at services/tagService.autoTagEntity uses the
 * underlying service function `assignTag()` directly (bypassing HTTP);
 * the HTTP endpoint pair was specifically for the manual override
 * path that never had a UI. akj ships that missing UI.
 *
 * Pattern 6 sub-rule c reminder from §13.3 Item 8.7 banking: the
 * service functions assignTag + removeTagAssignment MUST NOT be
 * removed even if the HTTP endpoints stay dormant — the auto-tagger
 * depends on them. We're adding HTTP callers, not removing service
 * functions.
 *
 * Schema constraint per Phase A: tags carry an `entityTypes` String[]
 * filter (default `["LOAD"]`; enumerated as LOAD/QUOTE/ORDER/INVOICE
 * per the schema comment). This panel filters the eligible-tag picker
 * to only tags that include the current entityType in their
 * entityTypes array — so a load surface won't offer an INVOICE-scoped
 * tag.
 *
 * Currently wired to the Load Board side panel (entityType="LOAD").
 * Other surfaces (QUOTE/ORDER/INVOICE detail surfaces if/when they
 * grow a side panel) can mount the same component with the
 * appropriate entityType prop.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Tag as TagIcon, Plus, X, AlertCircle } from "lucide-react";

interface TagRow {
  id: string;
  name: string;
  color: string;
  description: string | null;
  entityTypes: string[];
}

interface TagAssignmentRow {
  id: string;
  tagId: string;
  entityType: string;
  entityId: string;
  assignedBy: string | null;
  assignedAt: string;
  tag: TagRow;
}

type EntityType = "LOAD" | "QUOTE" | "ORDER" | "INVOICE";

interface Props {
  entityType: EntityType;
  entityId: string;
  /**
   * Disable the add + remove buttons for non-admin viewers. Backend
   * authz on POST + DELETE /tags/assign is ADMIN/CEO/BROKER/DISPATCH
   * (+OPERATIONS for POST); panel still renders for read-only viewers
   * so they can see what's applied.
   */
  canEdit?: boolean;
}

export function TagManagementPanel({ entityType, entityId, canEdit = true }: Props) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const assignmentsQuery = useQuery<TagAssignmentRow[]>({
    queryKey: ["entity-tags", entityType, entityId],
    queryFn: () => api.get(`/tags/entity/${entityType}/${entityId}`).then((r) => r.data),
    enabled: !!entityId,
  });

  const allTagsQuery = useQuery<TagRow[]>({
    queryKey: ["tags-all"],
    queryFn: () => api.get("/tags").then((r) => r.data),
    enabled: pickerOpen,
  });

  const assignedTagIds = new Set((assignmentsQuery.data ?? []).map((a) => a.tagId));
  const eligibleTags = (allTagsQuery.data ?? []).filter(
    (t) => t.entityTypes.includes(entityType) && !assignedTagIds.has(t.id),
  );

  const assignMutation = useMutation({
    mutationFn: (tagId: string) => api.post(`/tags/assign`, { tagId, entityType, entityId }),
    onSuccess: () => {
      setPickerOpen(false);
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["entity-tags", entityType, entityId] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setErrorMessage(err.response?.data?.error || "Could not assign tag");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tagId: string) => api.delete(`/tags/assign`, { data: { tagId, entityType, entityId } }),
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["entity-tags", entityType, entityId] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setErrorMessage(err.response?.data?.error || "Could not remove tag");
    },
  });

  if (assignmentsQuery.isLoading) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500 animate-pulse">Loading tags…</p>
      </div>
    );
  }

  if (assignmentsQuery.isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">Couldn&apos;t load tag assignments.</p>
      </div>
    );
  }

  const assignments = assignmentsQuery.data ?? [];

  return (
    <div className="space-y-3">
      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TagIcon size={14} className="text-gray-500" />
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Tags</h3>
          <span className="text-[10px] text-gray-400">({assignments.length})</span>
        </div>
        {canEdit && !pickerOpen && (
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-[#BA7517] hover:bg-[#FAEEDA] rounded transition"
          >
            <Plus size={11} />
            Add tag
          </button>
        )}
      </div>

      {/* Current assignments */}
      {assignments.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 italic">No tags assigned. Auto-tagger applies rule-matched tags on entity create; use Add tag for manual overrides.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold rounded-full border"
              style={{
                backgroundColor: `${a.tag.color}15`,
                borderColor: `${a.tag.color}50`,
                color: a.tag.color,
              }}
              title={a.tag.description || `Assigned ${new Date(a.assignedAt).toLocaleDateString()}${a.assignedBy ? " by " + a.assignedBy : " by auto-tagger"}`}
            >
              {a.tag.name}
              {canEdit && (
                <button
                  onClick={() => removeMutation.mutate(a.tagId)}
                  disabled={removeMutation.isPending}
                  className="hover:bg-black/10 rounded-full p-0.5 transition disabled:opacity-50"
                  aria-label={`Remove ${a.tag.name}`}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Picker */}
      {pickerOpen && (
        <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Pick a tag</p>
            <button
              onClick={() => { setPickerOpen(false); setErrorMessage(null); }}
              className="text-[10px] text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          {allTagsQuery.isLoading ? (
            <p className="text-xs text-gray-500 animate-pulse">Loading available tags…</p>
          ) : eligibleTags.length === 0 ? (
            <div className="flex items-start gap-2 text-xs text-gray-600">
              <AlertCircle size={12} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <span>
                No more tags available for {entityType.toLowerCase()}. {(allTagsQuery.data ?? []).length === 0
                  ? <>Create tags first at <code>/dashboard/tagging-rules</code>.</>
                  : <>All eligible tags are already assigned.</>}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {eligibleTags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => assignMutation.mutate(t.id)}
                  disabled={assignMutation.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-full border hover:opacity-80 transition disabled:opacity-50"
                  style={{
                    backgroundColor: `${t.color}10`,
                    borderColor: `${t.color}40`,
                    color: t.color,
                  }}
                  title={t.description || ""}
                >
                  <Plus size={10} />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="text-[11px] px-3 py-2 rounded bg-red-50 text-red-700 border border-red-200">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
