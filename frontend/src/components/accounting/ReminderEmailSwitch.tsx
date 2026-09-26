"use client";

/**
 * v3.8.bko — the payment-reminder email switch, on the AR aging page.
 *
 * OFF until an admin turns it on (decided 2026-09-26). When on, the 9 AM ET
 * run emails each unpaid invoice's billing contacts the reminder for the stage
 * that invoice has reached. Accounting can see the state; only ADMIN and CEO
 * can change it, and turning it on asks first, because the next run mails
 * every customer with an overdue invoice.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";

interface SwitchState {
  enabled: boolean;
  updatedAt: string | null;
}

export function ReminderEmailSwitch() {
  const { user } = useAuthStore();
  const canChange = user?.role === "ADMIN" || user?.role === "CEO";
  const qc = useQueryClient();

  const q = useQuery<SwitchState>({
    queryKey: ["ar-reminder-emails"],
    queryFn: async () => (await api.get("/accounting/reminder-emails")).data,
  });

  const flip = useMutation({
    mutationFn: async (enabled: boolean) => (await api.put("/accounting/reminder-emails", { enabled })).data as SwitchState,
    onSuccess: (data) => qc.setQueryData(["ar-reminder-emails"], data),
  });

  const on = q.data?.enabled === true;

  const onClick = () => {
    if (!on && !window.confirm(
      "Turn payment reminder emails on? At the next 9 AM ET run, every customer with an unpaid invoice will be emailed the reminder for the stage it has reached.",
    )) return;
    flip.mutate(!on);
  };

  return (
    <section aria-label="Payment reminder emails" className="bg-white/5 border border-white/5 rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#C5A572]/10 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-[#C5A572]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              Payment reminder emails:{" "}
              {q.isLoading ? "…" : q.isError ? "unknown" : (
                <span className={on ? "text-green-400" : "text-slate-300"}>{on ? "On" : "Off"}</span>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {on
                ? "Each morning at 9 AM ET, customers with an unpaid invoice are emailed a reminder for the stage it has reached."
                : "No customer is emailed about an unpaid invoice. Overdue invoices are still marked overdue."}
            </p>
            {q.isError && <p className="text-xs text-red-400 mt-1">Could not read the switch.</p>}
            {flip.isError && <p role="alert" className="text-xs text-red-400 mt-1">The change was not saved. Try again.</p>}
            {!canChange && <p className="text-xs text-slate-500 mt-1">Only an admin can change this.</p>}
          </div>
        </div>
        {canChange && (
          <button
            onClick={onClick}
            disabled={q.isLoading || q.isError || flip.isPending}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#C5A572]/40 text-[#C5A572] hover:bg-[#C5A572]/10 disabled:opacity-50"
          >
            {flip.isPending ? "Saving…" : on ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
    </section>
  );
}
