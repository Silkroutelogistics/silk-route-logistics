"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  CalendarDays, Clock, CheckCircle2, AlertTriangle, Truck, Package,
  ChevronLeft, ChevronRight, Plus, Search, MapPin, User, Phone,
  PlayCircle, XCircle, Ban, Timer, ArrowRight, Loader2,
} from "lucide-react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";

/* ─── Types ─── */

interface DockAppointment {
  id: string;
  facilityName: string;
  dockNumber: string;
  appointmentType: "PICKUP" | "DELIVERY";
  status: "SCHEDULED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  startTime: string;
  endTime: string;
  loadId: string;
  loadRefNumber?: string;
  carrierName: string;
  driverName: string | null;
  driverPhone: string | null;
  truckNumber: string | null;
  trailerNumber: string | null;
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dwellMinutes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DockStats {
  todayCount: number;
  scheduledCount: number;
  completedToday: number;
  avgDwellMinutes: number;
}

/* ─── Constants ─── */

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-500/20 text-blue-400",
  CHECKED_IN: "bg-amber-500/20 text-amber-400",
  IN_PROGRESS: "bg-purple-500/20 text-purple-400",
  COMPLETED: "bg-green-500/20 text-green-400",
  NO_SHOW: "bg-red-500/20 text-red-400",
  CANCELLED: "bg-slate-500/20 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CHECKED_IN: "Checked In",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
  CANCELLED: "Cancelled",
};

const TYPE_COLORS: Record<string, string> = {
  PICKUP: "bg-emerald-500/20 text-emerald-400",
  DELIVERY: "bg-sky-500/20 text-sky-400",
};

/* ─── Helpers ─── */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isToday(d: Date) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/* ─── Detail Panel Tabs ─── */

type DetailTab = "details" | "driver" | "status" | "notes";

function DetailPanel({
  appt,
  activeTab,
  setActiveTab,
  onAction,
  actionLoading,
}: {
  appt: DockAppointment;
  activeTab: DetailTab;
  setActiveTab: (t: DetailTab) => void;
  onAction: (action: string) => void;
  actionLoading: boolean;
}) {
  const tabs: { key: DetailTab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "driver", label: "Driver" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
  ];

  const canCheckIn = appt.status === "SCHEDULED";
  const canStart = appt.status === "CHECKED_IN";
  const canComplete = appt.status === "IN_PROGRESS";
  const canNoShow = appt.status === "SCHEDULED" || appt.status === "CHECKED_IN";
  const canCancel = appt.status !== "COMPLETED" && appt.status !== "CANCELLED" && appt.status !== "NO_SHOW";

  return (
    <div className="space-y-5">
      {/* Mini Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === t.key
                ? "border-[#C5A572] text-[#C5A572]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "details" && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Facility" value={appt.facilityName} />
          <Field label="Dock #" value={appt.dockNumber} />
          <Field label="Type" value={
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", TYPE_COLORS[appt.appointmentType])}>
              {appt.appointmentType}
            </span>
          } />
          <Field label="Status" value={
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[appt.status])}>
              {STATUS_LABELS[appt.status]}
            </span>
          } />
          <Field label="Start Time" value={fmtTime(appt.startTime)} />
          <Field label="End Time" value={fmtTime(appt.endTime)} />
          <Field label="Load Ref" value={appt.loadRefNumber || appt.loadId.slice(0, 8)} highlight />
          <Field label="Carrier" value={appt.carrierName} />
          {appt.dwellMinutes != null && (
            <Field label="Dwell Time" value={`${appt.dwellMinutes} min`} />
          )}
          <Field label="Created" value={new Date(appt.createdAt).toLocaleDateString()} />
        </div>
      )}

      {activeTab === "driver" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{appt.driverName || "Not assigned"}</p>
              {appt.driverPhone && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {appt.driverPhone}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Truck #" value={appt.truckNumber || "—"} />
            <Field label="Trailer #" value={appt.trailerNumber || "—"} />
          </div>
        </div>
      )}

      {activeTab === "status" && (
        <div className="space-y-1">
          <TimelineStep
            label="Scheduled"
            time={new Date(appt.createdAt).toLocaleString()}
            done
          />
          <TimelineStep
            label="Checked In"
            time={appt.checkedInAt ? new Date(appt.checkedInAt).toLocaleString() : null}
            done={!!appt.checkedInAt}
          />
          <TimelineStep
            label="In Progress"
            time={appt.startedAt ? new Date(appt.startedAt).toLocaleString() : null}
            done={!!appt.startedAt}
          />
          <TimelineStep
            label="Completed"
            time={appt.completedAt ? new Date(appt.completedAt).toLocaleString() : null}
            done={!!appt.completedAt}
            last
          />
          {appt.status === "NO_SHOW" && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg text-sm text-red-600 font-medium">
              Carrier marked as No Show
            </div>
          )}
          {appt.status === "CANCELLED" && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg text-sm text-gray-500 font-medium">
              Appointment cancelled
            </div>
          )}
        </div>
      )}

      {activeTab === "notes" && (
        <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 min-h-[100px]">
          {appt.notes || "No notes for this appointment."}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
        {canCheckIn && (
          <ActionBtn onClick={() => onAction("CHECKED_IN")} loading={actionLoading} color="amber" icon={<ArrowRight className="w-4 h-4" />}>
            Check In
          </ActionBtn>
        )}
        {canStart && (
          <ActionBtn onClick={() => onAction("IN_PROGRESS")} loading={actionLoading} color="purple" icon={<PlayCircle className="w-4 h-4" />}>
            Start
          </ActionBtn>
        )}
        {canComplete && (
          <ActionBtn onClick={() => onAction("COMPLETED")} loading={actionLoading} color="green" icon={<CheckCircle2 className="w-4 h-4" />}>
            Complete
          </ActionBtn>
        )}
        {canNoShow && (
          <ActionBtn onClick={() => onAction("NO_SHOW")} loading={actionLoading} color="red" icon={<AlertTriangle className="w-4 h-4" />}>
            No Show
          </ActionBtn>
        )}
        {canCancel && (
          <ActionBtn onClick={() => onAction("CANCELLED")} loading={actionLoading} color="slate" icon={<Ban className="w-4 h-4" />}>
            Cancel
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={cn("font-medium", highlight ? "text-[#C5A572]" : "text-white")}>{value}</p>
    </div>
  );
}

function TimelineStep({ label, time, done, last }: { label: string; time: string | null; done: boolean; last?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("w-3 h-3 rounded-full border-2 mt-1", done ? "bg-[#C5A572] border-[#C5A572]" : "bg-white border-gray-200")} />
        {!last && <div className={cn("w-0.5 flex-1 my-1", done ? "bg-[#C5A572]/40" : "bg-gray-200")} />}
      </div>
      <div className="pb-4">
        <p className={cn("text-sm font-medium", done ? "text-white" : "text-gray-400")}>{label}</p>
        {time && <p className="text-xs text-gray-500 mt-0.5">{time}</p>}
      </div>
    </div>
  );
}

function ActionBtn({
  onClick,
  loading,
  color,
  icon,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  color: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    amber: "bg-amber-500/20 text-amber-600 hover:bg-amber-500/30",
    purple: "bg-purple-500/20 text-purple-600 hover:bg-purple-500/30",
    green: "bg-green-500/20 text-green-600 hover:bg-green-500/30",
    red: "bg-red-500/20 text-red-600 hover:bg-red-500/30",
    slate: "bg-gray-100 text-gray-600 hover:bg-gray-200",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
        colorMap[color]
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ─── Create Form ─── */

const EMPTY_FORM = {
  facilityName: "",
  dockNumber: "",
  appointmentType: "PICKUP" as "PICKUP" | "DELIVERY",
  startTime: "",
  endTime: "",
  loadId: "",
  carrierName: "",
  driverName: "",
  driverPhone: "",
  truckNumber: "",
  trailerNumber: "",
  notes: "",
};

function CreateForm({
  form,
  setForm,
  onSubmit,
  loading,
}: {
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  onSubmit: () => void;
  loading: boolean;
}) {
  const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40 focus:border-[#C5A572]";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Facility Name *</label>
          <input className={inputCls} placeholder="e.g. Chicago DC" value={form.facilityName}
            onChange={(e) => setForm((p) => ({ ...p, facilityName: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Dock Number *</label>
          <input className={inputCls} placeholder="e.g. Dock 4" value={form.dockNumber}
            onChange={(e) => setForm((p) => ({ ...p, dockNumber: e.target.value }))} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Appointment Type *</label>
        <select className={inputCls} value={form.appointmentType}
          onChange={(e) => setForm((p) => ({ ...p, appointmentType: e.target.value as "PICKUP" | "DELIVERY" }))}>
          <option value="PICKUP">Pickup</option>
          <option value="DELIVERY">Delivery</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Start Time *</label>
          <input type="datetime-local" className={inputCls} value={form.startTime}
            onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>End Time *</label>
          <input type="datetime-local" className={inputCls} value={form.endTime}
            onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Load ID *</label>
        <input className={inputCls} placeholder="Load ID or reference" value={form.loadId}
          onChange={(e) => setForm((p) => ({ ...p, loadId: e.target.value }))} />
      </div>

      <div>
        <label className={labelCls}>Carrier Name *</label>
        <input className={inputCls} placeholder="Carrier company name" value={form.carrierName}
          onChange={(e) => setForm((p) => ({ ...p, carrierName: e.target.value }))} />
      </div>

      <div className="border-t border-gray-200 pt-4 mt-2">
        <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Driver Information (Optional)</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Driver Name</label>
            <input className={inputCls} placeholder="Full name" value={form.driverName}
              onChange={(e) => setForm((p) => ({ ...p, driverName: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Driver Phone</label>
            <input className={inputCls} placeholder="(555) 123-4567" value={form.driverPhone}
              onChange={(e) => setForm((p) => ({ ...p, driverPhone: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Truck #</label>
            <input className={inputCls} placeholder="Unit number" value={form.truckNumber}
              onChange={(e) => setForm((p) => ({ ...p, truckNumber: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Trailer #</label>
            <input className={inputCls} placeholder="Trailer number" value={form.trailerNumber}
              onChange={(e) => setForm((p) => ({ ...p, trailerNumber: e.target.value }))} />
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea className={cn(inputCls, "resize-none")} rows={3} placeholder="Special instructions, PO numbers, etc."
          value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
      </div>

      <button
        onClick={onSubmit}
        disabled={loading || !form.facilityName || !form.dockNumber || !form.startTime || !form.endTime || !form.loadId || !form.carrierName}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#C5A572] text-[#0a0e1a] font-semibold rounded-lg text-sm hover:bg-[#C5A572]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Create Appointment
      </button>
    </div>
  );
}

/* ─── Main Page ─── */

export default function DockSchedulingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [facilityFilter, setFacilityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DockAppointment | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const dateStr = isoDate(selectedDate);

  // ── Queries ──

  const { data: stats } = useQuery({
    queryKey: ["dock-stats", dateStr],
    queryFn: () => api.get<DockStats>(`/dock-schedules/stats?date=${dateStr}`).then((r) => r.data),
  });

  const params = useMemo(() => {
    const p = new URLSearchParams({ date: dateStr, limit: "100" });
    if (facilityFilter) p.set("facility", facilityFilter);
    if (typeFilter) p.set("appointmentType", typeFilter);
    if (statusFilter) p.set("status", statusFilter);
    return p.toString();
  }, [dateStr, facilityFilter, typeFilter, statusFilter]);

  const { data: listData, isLoading } = useQuery({
    queryKey: ["dock-schedules", params],
    queryFn: () =>
      api.get<{ appointments: DockAppointment[]; total: number }>(`/dock-schedules?${params}`).then((r) => r.data),
  });

  const appointments = listData?.appointments || [];
  const facilities = useMemo(() => [...new Set(appointments.map((a) => a.facilityName))].sort(), [appointments]);

  const filtered = useMemo(() => {
    if (!search) return appointments;
    const q = search.toLowerCase();
    return appointments.filter(
      (a) =>
        a.facilityName.toLowerCase().includes(q) ||
        a.carrierName.toLowerCase().includes(q) ||
        (a.loadRefNumber || a.loadId).toLowerCase().includes(q) ||
        (a.driverName || "").toLowerCase().includes(q)
    );
  }, [appointments, search]);

  // ── Mutations ──

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/dock-schedules", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dock-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["dock-stats"] });
      toast("Appointment created", "success");
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
    },
    onError: () => toast("Failed to create appointment", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/dock-schedules/${id}`, body),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["dock-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["dock-stats"] });
      const action = vars.body.status as string;
      toast(`Appointment ${STATUS_LABELS[action]?.toLowerCase() || "updated"}`, "success");
      // Refresh selected appointment data
      if (selected) {
        const statusBody = vars.body as { status: string };
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                status: statusBody.status as DockAppointment["status"],
                ...(statusBody.status === "CHECKED_IN" ? { checkedInAt: new Date().toISOString() } : {}),
                ...(statusBody.status === "IN_PROGRESS" ? { startedAt: new Date().toISOString() } : {}),
                ...(statusBody.status === "COMPLETED" ? { completedAt: new Date().toISOString() } : {}),
              }
            : null
        );
      }
    },
    onError: () => toast("Failed to update appointment", "error"),
  });

  // ── Handlers ──

  function handleCreate() {
    createMutation.mutate({
      facilityName: form.facilityName,
      dockNumber: form.dockNumber,
      appointmentType: form.appointmentType,
      startTime: new Date(form.startTime).toISOString(),
      endTime: new Date(form.endTime).toISOString(),
      loadId: form.loadId,
      carrierName: form.carrierName,
      driverName: form.driverName || undefined,
      driverPhone: form.driverPhone || undefined,
      truckNumber: form.truckNumber || undefined,
      trailerNumber: form.trailerNumber || undefined,
      notes: form.notes || undefined,
    });
  }

  function handleAction(status: string) {
    if (!selected) return;
    updateMutation.mutate({ id: selected.id, body: { status } });
  }

  function shiftDate(days: number) {
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + days);
      return next;
    });
  }

  // ── Render ──

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dock Scheduling</h1>
          <p className="text-sm text-gray-600 mt-1">Manage facility dock appointments and yard operations</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#C5A572] text-[#0a0e1a] font-medium rounded-lg text-sm hover:bg-[#C5A572]/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Appointment
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Today's Appointments",
            value: stats?.todayCount ?? "—",
            icon: <CalendarDays className="w-5 h-5" />,
            color: "text-gray-700",
          },
          {
            label: "Scheduled",
            value: stats?.scheduledCount ?? "—",
            icon: <Clock className="w-5 h-5" />,
            color: "text-blue-400",
          },
          {
            label: "Completed Today",
            value: stats?.completedToday ?? "—",
            icon: <CheckCircle2 className="w-5 h-5" />,
            color: "text-green-400",
          },
          {
            label: "Avg Dwell Time",
            value: stats?.avgDwellMinutes != null ? `${stats.avgDwellMinutes} min` : "—",
            icon: <Timer className="w-5 h-5" />,
            color: "text-[#C5A572]",
          },
        ].map((k) => (
          <div key={k.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className={cn(k.color, "mb-2")}>{k.icon}</div>
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="text-lg font-bold text-white">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Date Navigation + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date Nav */}
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-lg p-1">
          <button
            onClick={() => shiftDate(-1)}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              isToday(selectedDate)
                ? "bg-[#C5A572]/20 text-[#C5A572]"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            {fmtDate(selectedDate)}
          </button>
          <button
            onClick={() => shiftDate(1)}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Facility Filter */}
        <select
          value={facilityFilter}
          onChange={(e) => setFacilityFilter(e.target.value)}
          className="bg-white/[0.03] border border-white/5 text-sm text-white rounded-lg px-3 py-2"
        >
          <option value="" className=" text-white">All Facilities</option>
          {facilities.map((f) => (
            <option key={f} value={f} className=" text-white">{f}</option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white/[0.03] border border-white/5 text-sm text-white rounded-lg px-3 py-2"
        >
          <option value="" className=" text-white">All Types</option>
          <option value="PICKUP" className=" text-white">Pickup</option>
          <option value="DELIVERY" className=" text-white">Delivery</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/[0.03] border border-white/5 text-sm text-white rounded-lg px-3 py-2"
        >
          <option value="" className=" text-white">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k} className=" text-white">{v}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search facility, carrier, load..."
            className="w-full bg-white/[0.03] border border-white/5 text-sm text-white rounded-lg pl-9 pr-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C5A572]/40"
          />
        </div>
      </div>

      {/* Appointments Table */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-gray-600">
              <th className="text-left p-3 font-medium">Time</th>
              <th className="text-left p-3 font-medium">Facility / Dock</th>
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Load</th>
              <th className="text-left p-3 font-medium">Carrier</th>
              <th className="text-left p-3 font-medium">Driver / Truck</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Loading appointments...</p>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CalendarDays className="w-12 h-12 text-slate-600 mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-1">No appointments</h3>
                    <p className="text-sm text-gray-600 mb-4 max-w-sm">
                      No dock appointments found for {fmtDate(selectedDate)}.
                    </p>
                    <button
                      onClick={() => setShowCreate(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#C5A572]/20 text-[#C5A572] rounded-lg text-sm font-medium hover:bg-[#C5A572]/30 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Schedule Appointment
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((appt) => (
                <tr
                  key={appt.id}
                  onClick={() => { setSelected(appt); setDetailTab("details"); }}
                  className={cn(
                    "border-b border-white/5 cursor-pointer transition-colors",
                    selected?.id === appt.id
                      ? "bg-[#C5A572]/5"
                      : "hover:bg-white/[0.02]"
                  )}
                >
                  <td className="p-3">
                    <span className="text-white font-medium">{fmtTime(appt.startTime)}</span>
                    <span className="text-slate-500 mx-1">-</span>
                    <span className="text-gray-600">{fmtTime(appt.endTime)}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div>
                        <p className="text-white">{appt.facilityName}</p>
                        <p className="text-xs text-slate-500">{appt.dockNumber}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        TYPE_COLORS[appt.appointmentType]
                      )}
                    >
                      {appt.appointmentType}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        STATUS_COLORS[appt.status]
                      )}
                    >
                      {STATUS_LABELS[appt.status]}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="text-[#C5A572] font-mono text-xs">
                      {appt.loadRefNumber || appt.loadId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Truck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-gray-700 truncate max-w-[160px]">{appt.carrierName}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <p className="text-gray-700 text-xs">{appt.driverName || "—"}</p>
                    {appt.truckNumber && (
                      <p className="text-slate-500 text-xs">Truck: {appt.truckNumber}</p>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Panel (Right-side SlideDrawer) */}
      <SlideDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `${selected.facilityName} - ${selected.dockNumber}`
            : "Appointment Details"
        }
        width="max-w-lg"
      >
        {selected && (
          <DetailPanel
            appt={selected}
            activeTab={detailTab}
            setActiveTab={setDetailTab}
            onAction={handleAction}
            actionLoading={updateMutation.isPending}
          />
        )}
      </SlideDrawer>

      {/* Create Appointment Drawer */}
      <SlideDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Dock Appointment"
        width="max-w-lg"
      >
        <CreateForm
          form={form}
          setForm={setForm}
          onSubmit={handleCreate}
          loading={createMutation.isPending}
        />
      </SlideDrawer>
    </div>
  );
}
