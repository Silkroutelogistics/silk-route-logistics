"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, ChevronLeft, ChevronRight, MapPin, Truck,
  ArrowRight, DollarSign, Package,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  POSTED: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TENDERED: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  BOOKED: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  DISPATCHED: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  IN_TRANSIT: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  DELIVERED: "bg-green-500/20 text-green-300 border-green-500/30",
  COMPLETED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-300 border-red-500/30",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function LoadsCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"week" | "month">("week");
  const [selectedLoad, setSelectedLoad] = useState<any>(null);

  // Calculate date range
  const dateRange = useMemo(() => {
    if (view === "week") {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start, end };
    }
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return { start, end };
  }, [currentDate, view]);

  const { data } = useQuery({
    queryKey: ["loads-calendar", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: () => api.get("/loads", {
      params: {
        pickupFrom: dateRange.start.toISOString().split("T")[0],
        pickupTo: dateRange.end.toISOString().split("T")[0],
        limit: 200,
      },
    }).then((r) => r.data?.loads || r.data?.items || []),
  });

  const loads: any[] = data || [];

  // Group loads by date
  const loadsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    loads.forEach((load) => {
      const key = new Date(load.pickupDate).toISOString().split("T")[0];
      if (!map[key]) map[key] = [];
      map[key].push(load);
    });
    return map;
  }, [loads]);

  // Generate days array
  const daysArray = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(dateRange.start);
    while (d <= dateRange.end) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [dateRange]);

  const navigate = (direction: number) => {
    const next = new Date(currentDate);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setCurrentDate(next);
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#C5A572]" /> Load Calendar
          </h1>
          <p className="text-sm text-gray-400 mt-1">Visual timeline of shipments by pickup date</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center bg-white/5 rounded-lg p-0.5">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition",
                  view === v ? "bg-[#C5A572] text-[#0F1117]" : "text-gray-400 hover:text-white"
                )}
              >
                {v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-white/5 transition">
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition">Today</button>
            <span className="text-sm text-white font-medium min-w-[160px] text-center">
              {view === "week"
                ? `${dateRange.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${dateRange.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
              }
            </span>
            <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-white/5 transition">
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className={cn("grid border-b border-white/5", view === "week" ? "grid-cols-7" : "grid-cols-7")}>
          {(view === "week" ? daysArray : DAYS).map((d, i) => (
            <div key={i} className="px-3 py-2.5 text-center border-r border-white/5 last:border-r-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">
                {d instanceof Date ? DAYS[d.getDay()] : d}
              </p>
              {d instanceof Date && (
                <p className={cn(
                  "text-lg font-semibold mt-0.5",
                  d.toISOString().split("T")[0] === today ? "text-[#C5A572]" : "text-white"
                )}>
                  {d.getDate()}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Calendar body */}
        {view === "week" ? (
          <div className="grid grid-cols-7 min-h-[500px]">
            {daysArray.map((day) => {
              const dateKey = day.toISOString().split("T")[0];
              const dayLoads = loadsByDate[dateKey] || [];
              const isToday = dateKey === today;

              return (
                <div key={dateKey} className={cn("border-r border-white/5 last:border-r-0 p-2 min-h-[500px]", isToday && "bg-[#C5A572]/[0.03]")}>
                  <div className="space-y-1.5">
                    {dayLoads.map((load: any) => (
                      <div
                        key={load.id}
                        onClick={() => setSelectedLoad(selectedLoad?.id === load.id ? null : load)}
                        className={cn(
                          "px-2 py-1.5 rounded-md border cursor-pointer transition-all text-[10px] hover:scale-[1.02]",
                          STATUS_COLORS[load.status] || "bg-white/5 text-gray-400 border-white/10",
                          selectedLoad?.id === load.id && "ring-1 ring-[#C5A572]"
                        )}
                      >
                        <p className="font-medium truncate">{load.loadNumber || load.referenceNumber?.slice(0, 8)}</p>
                        <p className="truncate opacity-70">{load.originState} → {load.destState}</p>
                      </div>
                    ))}
                    {dayLoads.length === 0 && (
                      <p className="text-[10px] text-gray-600 text-center pt-4">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {/* Month view with weeks */}
            {(() => {
              const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
              const startOffset = firstDay.getDay();
              const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
              const cells = [];

              for (let i = 0; i < startOffset; i++) {
                cells.push(<div key={`empty-${i}`} className="border-r border-b border-white/5 min-h-[100px] p-1" />);
              }
              for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const dayLoads = loadsByDate[dateKey] || [];
                const isToday = dateKey === today;

                cells.push(
                  <div key={d} className={cn("border-r border-b border-white/5 min-h-[100px] p-1", isToday && "bg-[#C5A572]/[0.03]")}>
                    <p className={cn("text-xs mb-1", isToday ? "text-[#C5A572] font-bold" : "text-gray-500")}>{d}</p>
                    {dayLoads.slice(0, 3).map((load: any) => (
                      <div key={load.id} className={cn("px-1 py-0.5 rounded text-[9px] mb-0.5 truncate cursor-pointer", STATUS_COLORS[load.status] || "bg-white/5 text-gray-400")}
                        onClick={() => setSelectedLoad(load)}
                      >
                        {load.originState}→{load.destState}
                      </div>
                    ))}
                    {dayLoads.length > 3 && <p className="text-[9px] text-gray-600">+{dayLoads.length - 3} more</p>}
                  </div>
                );
              }
              return cells;
            })()}
          </div>
        )}
      </div>

      {/* Selected Load Detail */}
      {selectedLoad && (
        <div className="fixed bottom-6 right-6 w-80 bg-[#1a1f35] border border-white/10 rounded-xl shadow-2xl p-5 z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white">{selectedLoad.loadNumber || selectedLoad.referenceNumber?.slice(0, 12)}</h4>
            <button onClick={() => setSelectedLoad(null)} className="text-gray-500 hover:text-white text-xs">✕</button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-gray-400">
              <MapPin className="w-3 h-3" /> {selectedLoad.originCity}, {selectedLoad.originState} <ArrowRight className="w-3 h-3" /> {selectedLoad.destCity}, {selectedLoad.destState}
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Truck className="w-3 h-3" /> {selectedLoad.equipmentType?.replace("_", " ")}
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <DollarSign className="w-3 h-3" /> ${selectedLoad.rate?.toLocaleString()}
              {selectedLoad.distance && <span>· {Math.round(selectedLoad.distance)} mi</span>}
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Calendar className="w-3 h-3" /> Pickup: {new Date(selectedLoad.pickupDate).toLocaleDateString()}
            </div>
            <span className={cn("inline-block px-2 py-0.5 rounded text-[10px]", STATUS_COLORS[selectedLoad.status] || "bg-white/5 text-gray-400")}>
              {selectedLoad.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
