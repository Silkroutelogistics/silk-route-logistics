"use client";

import { Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  FREIGHT_CLASSES,
  PACKAGE_TYPE_OPTIONS,
  emptyLineItem,
  getAutoSuggestedClass,
  type LineItemFormData,
  type PackageType,
} from "@/app/dashboard/orders/types";

/**
 * LineItemsSection (v3.8.c) — dynamic multi-commodity line-item capture for
 * the Order Builder. Replaces the single-set flat-field shipment capture
 * with a list of per-line records matching the v3.8.a LoadLineItem schema.
 *
 * Controlled component — parent owns state. Minimum 1 row; remove is
 * disabled at 1 remaining. Running aggregates (pieces/weight/hazmat)
 * render at the top. All fields on one visible row; hazmat sub-fields
 * (UN#/class/emergency contact/placard) expand inline when hazmat is
 * toggled on.
 *
 * Theming: all backgrounds/borders/text use utility classes that have
 * first-class [data-mode="light"] overrides in globals.css
 * (bg-white/5, border-white/10, text-white, text-slate-400, etc.).
 * No hardcoded hex that bypasses the override list.
 */

const inpSm =
  "w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white";
const labelCls = "text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1";

interface Props {
  value: LineItemFormData[];
  onChange: (items: LineItemFormData[]) => void;
  errors?: Record<number, Partial<Record<keyof LineItemFormData, string>>>;
}

export function LineItemsSection({ value, onChange, errors }: Props) {
  const updateItem = (index: number, patch: Partial<LineItemFormData>) => {
    const next = value.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  };

  // v3.8.xx — Source-aware auto-suggest. Source-tracking lets density
  // upgrade a class that was previously set by keyword (or by an earlier
  // auto-suggest with less signal) without stomping a class the AE
  // manually picked. Three sources:
  //   "ae"   = AE picked from the dropdown. Locked. Never overridden.
  //            (Clearing the dropdown to "—" resets source to null,
  //            which makes the line eligible for auto-suggest again.)
  //   "auto" = filled by auto-suggest. Eligible for upgrade when better
  //            signal arrives (e.g. keyword set first → density upgrades
  //            later when L/W/H/weight all populate).
  //   null   = never set / cleared. Eligible for auto-suggest.
  //
  // For unmigrated drafts loaded with an existing freightClass and no
  // _classSource recorded, the conservative interpretation is "ae" —
  // assume the saved value was deliberate. AE can clear-and-retrigger to
  // re-enable auto-suggest if needed.
  const applyClassAutoSuggest = (
    index: number,
    item: LineItemFormData,
    patch: Partial<LineItemFormData>,
  ) => {
    const merged = { ...item, ...patch };
    const source = item._classSource ?? (item.freightClass ? "ae" : null);
    if (source === "ae") {
      updateItem(index, patch);
      return;
    }
    const suggested = getAutoSuggestedClass(merged);
    if (suggested) {
      updateItem(index, { ...patch, freightClass: suggested, _classSource: "auto" });
    } else {
      updateItem(index, patch);
    }
  };

  const addItem = () => {
    onChange([...value, emptyLineItem()]);
  };

  const removeItem = (index: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, i) => i !== index));
  };

  // Aggregates
  const totalPieces = value.reduce(
    (sum, l) => sum + (parseInt(l.pieces, 10) || 0),
    0,
  );
  const totalWeight = value.reduce(
    (sum, l) => sum + (parseFloat(l.weight) || 0),
    0,
  );
  const anyHazmat = value.some((l) => l.hazmat);
  const allStackable = value.every((l) => l.stackable);

  return (
    <div className="space-y-3">
      {/* Aggregate summary */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        <div>
          <span className="text-slate-400">Lines:</span>{" "}
          <span className="font-semibold text-white">{value.length}</span>
        </div>
        <div>
          <span className="text-slate-400">Total pieces:</span>{" "}
          <span className="font-semibold text-white">{totalPieces.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-slate-400">Total weight:</span>{" "}
          <span className="font-semibold text-white">
            {totalWeight.toLocaleString()} lb
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Hazmat:</span>{" "}
          {anyHazmat ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[#B8860B]">
              <AlertTriangle size={12} /> Yes
            </span>
          ) : (
            <span className="font-semibold text-white">No</span>
          )}
        </div>
        <div>
          <span className="text-slate-400">All stackable:</span>{" "}
          <span className="font-semibold text-white">{allStackable ? "Yes" : "No"}</span>
        </div>
      </div>

      {/* Line item rows */}
      <div className="space-y-2">
        {value.map((item, idx) => {
          const rowErrors = errors?.[idx] ?? {};
          const canRemove = value.length > 1;
          return (
            <div
              key={idx}
              className="border border-white/10 rounded-lg p-3 space-y-2"
            >
              {/* Main field row — all line-level fields visible inline */}
              <div className="flex items-end gap-2">
                <div className="w-8 shrink-0">
                  <div className={labelCls}>Line</div>
                  <div className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-slate-400 text-center">
                    {idx + 1}
                  </div>
                </div>
                <div className="w-16 shrink-0">
                  <div className={labelCls}>Pieces *</div>
                  <input
                    type="number"
                    min="1"
                    value={item.pieces}
                    onChange={(e) => updateItem(idx, { pieces: e.target.value })}
                    className={inpSm}
                    aria-invalid={!!rowErrors.pieces}
                  />
                </div>
                <div className="w-32 shrink-0">
                  <div className={labelCls}>Package</div>
                  <select
                    value={item.packageType}
                    onChange={(e) =>
                      updateItem(idx, { packageType: e.target.value as PackageType })
                    }
                    className={inpSm}
                  >
                    {PACKAGE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-12 shrink-0">
                  <div className={labelCls}>L</div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.dimensionsLength}
                    onChange={(e) => applyClassAutoSuggest(idx, item, { dimensionsLength: e.target.value })}
                    placeholder="in"
                    className={inpSm}
                  />
                </div>
                <div className="w-12 shrink-0">
                  <div className={labelCls}>W</div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.dimensionsWidth}
                    onChange={(e) => applyClassAutoSuggest(idx, item, { dimensionsWidth: e.target.value })}
                    placeholder="in"
                    className={inpSm}
                  />
                </div>
                <div className="w-12 shrink-0">
                  <div className={labelCls}>H</div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.dimensionsHeight}
                    onChange={(e) => applyClassAutoSuggest(idx, item, { dimensionsHeight: e.target.value })}
                    placeholder="in"
                    className={inpSm}
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <div className={labelCls}>Description *</div>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => applyClassAutoSuggest(idx, item, { description: e.target.value })}
                    className={inpSm}
                    placeholder="e.g. Tires, Electronics, Auto parts"
                    aria-invalid={!!rowErrors.description}
                  />
                </div>
                <div className="w-20 shrink-0">
                  <div className={labelCls}>Weight (lb) *</div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.weight}
                    onChange={(e) => applyClassAutoSuggest(idx, item, { weight: e.target.value })}
                    className={inpSm}
                    aria-invalid={!!rowErrors.weight}
                  />
                </div>
                <div className="w-16 shrink-0">
                  <div className={labelCls}>Class</div>
                  <select
                    value={item.freightClass}
                    onChange={(e) =>
                      // v3.8.xx — manual dropdown change marks source as "ae"
                      // (locked from auto-overrides). Clearing to "—" resets
                      // source to null so the line becomes eligible for
                      // auto-suggest again on the next density/keyword input.
                      updateItem(idx, {
                        freightClass: e.target.value,
                        _classSource: e.target.value ? "ae" : null,
                      })
                    }
                    className={inpSm}
                  >
                    <option value="">—</option>
                    {FREIGHT_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-20 shrink-0">
                  <div className={labelCls}>NMFC #</div>
                  <input
                    type="text"
                    value={item.nmfcCode}
                    onChange={(e) =>
                      updateItem(idx, { nmfcCode: e.target.value })
                    }
                    className={inpSm}
                  />
                </div>
                <div className="shrink-0 pb-1">
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={!canRemove}
                    title={
                      canRemove
                        ? "Remove line item"
                        : "At least one line item is required"
                    }
                    className={`p-1.5 rounded ${
                      canRemove
                        ? "text-rose-500 hover:bg-rose-500/10"
                        : "text-slate-500 cursor-not-allowed opacity-50"
                    }`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Checkbox row — Stackable / Turnable / Hazmat */}
              <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.stackable}
                    onChange={(e) =>
                      updateItem(idx, { stackable: e.target.checked })
                    }
                  />
                  <span>Stackable</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.turnable}
                    onChange={(e) =>
                      updateItem(idx, { turnable: e.target.checked })
                    }
                  />
                  <span>Turnable</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.hazmat}
                    onChange={(e) =>
                      updateItem(idx, { hazmat: e.target.checked })
                    }
                  />
                  <span
                    className={
                      item.hazmat
                        ? "text-[#B8860B] font-semibold inline-flex items-center gap-1"
                        : ""
                    }
                  >
                    {item.hazmat && <AlertTriangle size={11} />}
                    Hazmat
                  </span>
                </label>
              </div>

              {/* Hazmat sub-fields (conditional) */}
              {item.hazmat && (
                <div className="flex items-end gap-2 bg-[#FAEEDA]/30 border border-[#BA7517]/30 rounded p-2 mt-2">
                  <div className="w-28 shrink-0">
                    <div className={labelCls}>UN number *</div>
                    <input
                      type="text"
                      value={item.hazmatUnNumber}
                      onChange={(e) =>
                        updateItem(idx, { hazmatUnNumber: e.target.value })
                      }
                      placeholder="UN1234"
                      className={inpSm}
                    />
                  </div>
                  <div className="w-24 shrink-0">
                    <div className={labelCls}>Hazmat class *</div>
                    <input
                      type="text"
                      value={item.hazmatClass}
                      onChange={(e) =>
                        updateItem(idx, { hazmatClass: e.target.value })
                      }
                      placeholder="e.g. 3"
                      className={inpSm}
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <div className={labelCls}>Emergency contact</div>
                    <input
                      type="text"
                      value={item.hazmatEmergencyContact}
                      onChange={(e) =>
                        updateItem(idx, {
                          hazmatEmergencyContact: e.target.value,
                        })
                      }
                      placeholder="Name + 24h phone"
                      className={inpSm}
                    />
                  </div>
                  <div className="shrink-0 pb-1 text-xs text-slate-400">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.hazmatPlacardRequired}
                        onChange={(e) =>
                          updateItem(idx, {
                            hazmatPlacardRequired: e.target.checked,
                          })
                        }
                      />
                      <span>Placard required</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add line item — compact, right-aligned below the rows */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FAEEDA]/30 hover:bg-[#FAEEDA]/50 border border-[#BA7517]/40 rounded text-xs text-[#8B7428] font-medium transition-colors"
        >
          <Plus size={12} />
          Add Line Item
        </button>
      </div>
    </div>
  );
}
