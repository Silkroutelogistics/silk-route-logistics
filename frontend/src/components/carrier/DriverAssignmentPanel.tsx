"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, ShieldCheck, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/download";
import { CarrierCard } from "./CarrierCard";

/**
 * Driver and equipment on a load, and the handset verification behind them.
 *
 * Arc 19 built PATCH /carrier-loads/:id/driver and the two driver-verify
 * routes, and nothing in the portal ever called them. The rate confirmation
 * download refused with DRIVER_NOT_VERIFIED and pointed the carrier at this
 * page, where there was nothing to do. This is the control that was missing.
 *
 * What verification proves, and what it does not: that something holding the
 * number read back a code we texted to it, and that the person holding it
 * agreed to the consent sentence shown here. It does not prove the person is
 * the named driver. The wording keeps to that.
 *
 * Phase 0 of the mandatory-ELD arc.
 */

export interface DriverAssignmentLoad {
  id: string;
  driverName?: string | null;
  driverPhone?: string | null;
  truckNumber?: string | null;
  trailerNumber?: string | null;
  driverPhoneVerified?: string | null;
  driverPhoneVerifiedAt?: string | null;
}

type FormState = { driverName: string; driverPhone: string; truckNumber: string; trailerNumber: string };
type FieldKey = keyof FormState;

const FIELDS: Array<{ key: FieldKey; label: string; placeholder: string }> = [
  { key: "driverName", label: "Driver name", placeholder: "Full name" },
  { key: "driverPhone", label: "Driver mobile", placeholder: "(269) 555-0100" },
  { key: "truckNumber", label: "Truck #", placeholder: "Unit" },
  { key: "trailerNumber", label: "Trailer #", placeholder: "Unit" },
];

const inputCls =
  "w-full px-3 py-2 border border-[#EFE6D3] rounded text-xs focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none";
const buttonCls =
  "px-3 py-2 rounded text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed";

function fromLoad(load: DriverAssignmentLoad): FormState {
  return {
    driverName: load.driverName ?? "",
    driverPhone: load.driverPhone ?? "",
    truckNumber: load.truckNumber ?? "",
    trailerNumber: load.trailerNumber ?? "",
  };
}

export function DriverAssignmentPanel({ load }: { load: DriverAssignmentLoad }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromLoad(load));
  const [code, setCode] = useState("");
  const [consented, setConsented] = useState(false);
  const [consentText, setConsentText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Selecting a different load resets everything.
  useEffect(() => {
    setCode("");
    setConsented(false);
    setConsentText(null);
    setError(null);
    setNotice(null);
  }, [load.id]);

  // Re-sync the fields when the server's values change (after a Save the
  // detail refetches). Form values are deliberately not dependencies: the
  // effect must not re-fire on a keystroke (§19 Sub-pattern 10).
  useEffect(() => {
    setForm(fromLoad(load));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.id, load.driverName, load.driverPhone, load.truckNumber, load.trailerNumber]);

  const initial = fromLoad(load);
  const changed = (Object.keys(form) as FieldKey[]).filter((k) => form[k].trim() !== initial[k]);
  const dirty = changed.length > 0;
  const verified =
    !!load.driverPhoneVerifiedAt &&
    !!load.driverPhoneVerified &&
    !!load.driverPhone &&
    load.driverPhoneVerified === load.driverPhone &&
    !changed.includes("driverPhone");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["carrier-my-load-detail", load.id] });
    queryClient.invalidateQueries({ queryKey: ["carrier-my-loads"] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.patch(
        `/carrier-loads/${load.id}/driver`,
        Object.fromEntries(changed.map((k) => [k, form[k].trim()])),
      ),
    onSuccess: () => {
      setError(null);
      setNotice("Driver details saved.");
      invalidate();
    },
    onError: async (err) => setError(await extractApiError(err, "Could not save the driver details.")),
  });

  const startVerify = useMutation({
    mutationFn: () =>
      api
        .post(`/carrier-loads/${load.id}/driver-verify/start`, {
          driverName: form.driverName.trim(),
          driverPhone: form.driverPhone.trim(),
        })
        .then((r) => r.data as { alreadyVerified?: boolean; phone?: string; consentText?: string }),
    onSuccess: (data) => {
      setError(null);
      if (data.alreadyVerified) {
        setNotice("This number is already verified for this load.");
        invalidate();
        return;
      }
      setConsentText(data.consentText ?? "");
      setNotice(`We texted a code to ${data.phone ?? form.driverPhone.trim()}. Ask the driver to read it back to you.`);
      invalidate();
    },
    onError: async (err) => setError(await extractApiError(err, "Could not start verification.")),
  });

  const confirmVerify = useMutation({
    mutationFn: () =>
      api.post(`/carrier-loads/${load.id}/driver-verify/confirm`, { code: code.trim(), consented }),
    onSuccess: () => {
      setError(null);
      setConsentText(null);
      setCode("");
      setNotice("Driver phone verified. Check calls and location links can reach this handset.");
      invalidate();
    },
    onError: async (err) => setError(await extractApiError(err, "That code was not accepted.")),
  });

  const canVerify =
    form.driverName.trim().length >= 2 && form.driverPhone.trim().length >= 7 && !startVerify.isPending;
  const canConfirm = code.trim().length >= 4 && consented && !confirmVerify.isPending;

  return (
    <CarrierCard padding="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-[#0A2540] flex items-center gap-1.5">
          <Truck size={14} className="text-[#BA7517]" /> Driver &amp; Equipment
        </h4>
        {verified ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#2F7A4F]">
            <ShieldCheck size={12} /> Phone verified
          </span>
        ) : (
          <span className="text-[10px] text-gray-500">Phone not verified</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-[10px] text-gray-500">
            {f.label}
            <input
              aria-label={f.label}
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className={`${inputCls} mt-0.5`}
            />
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className={`${buttonCls} bg-[#0A2540] text-[#FBF7F0]`}
        >
          {save.isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          disabled={!canVerify}
          onClick={() => startVerify.mutate()}
          className={`${buttonCls} border border-[#BA7517] text-[#BA7517] flex items-center gap-1.5`}
        >
          {startVerify.isPending ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
          {verified ? "Re-verify driver phone" : "Verify driver phone"}
        </button>
      </div>

      {consentText !== null && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <label className="flex items-start gap-2 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Read this to the driver and tick it once they agree:
              <span className="block mt-1 italic text-gray-600">{consentText}</span>
            </span>
          </label>
          <div className="flex gap-2 mt-2">
            <input
              aria-label="Verification code"
              value={code}
              inputMode="numeric"
              placeholder="6-digit code"
              onChange={(e) => setCode(e.target.value)}
              className={`${inputCls} max-w-[140px]`}
            />
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() => confirmVerify.mutate()}
              className={`${buttonCls} bg-[#BA7517] text-[#FBF7F0]`}
            >
              {confirmVerify.isPending ? "Checking..." : "Confirm code"}
            </button>
          </div>
        </div>
      )}

      {notice && <p className="mt-2 text-[11px] text-[#2F7A4F]">{notice}</p>}
      {error && (
        <p className="mt-2 text-[11px] text-[#9B2C2C] bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded px-2 py-1.5">
          {error}
        </p>
      )}
    </CarrierCard>
  );
}
