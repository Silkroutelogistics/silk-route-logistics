"use client";

import { Shield, FileText, AlertTriangle, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";

const scoreLabels: Record<string, string> = {
  unsafeDriving: "Unsafe Driving",
  hoursOfService: "HOS Compliance",
  driverFitness: "Driver Fitness",
  controlledSubstances: "Controlled Substances",
  vehicleMaintenance: "Vehicle Maintenance",
  hazmat: "Hazmat",
  crashIndicator: "Crash Indicator",
};

export default function CarrierCompliancePage() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["carrier-compliance-overview"],
    queryFn: () => api.get("/carrier-compliance/overview").then((r) => r.data),
  });

  const { data: csaData } = useQuery({
    queryKey: ["carrier-csa-scores"],
    queryFn: () => api.get("/carrier-compliance/csa-scores").then((r) => r.data),
  });

  const { data: expirations } = useQuery({
    queryKey: ["carrier-expirations"],
    queryFn: () => api.get("/carrier-compliance/expiration-calendar").then((r) => r.data),
  });

  const carrier = overview?.carrier;
  const insurance = overview?.insurance;
  const docs = overview?.documents;
  const alerts = overview?.alerts || [];
  const basicScores = csaData?.basicScores || {};
  const srlMetrics = csaData?.srlMetrics;
  const expItems = expirations?.expirations || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Compliance &amp; Safety</h1>
        <p className="text-[13px] text-gray-500">
          Manage insurance, FMCSA compliance, and safety documentation
        </p>
      </div>

      {/* Top row: Carrier info + Insurance + Documents */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Carrier Info */}
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Shield size={20} className="text-violet-500" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0D1B2A]">{carrier?.company || "—"}</div>
              <div className="text-[11px] text-gray-400">MC-{carrier?.mcNumber || "—"} &middot; DOT-{carrier?.dotNumber || "—"}</div>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Tier</span>
              {carrier?.tier ? <CarrierBadge status={carrier.tier} /> : <span>—</span>}
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Safety Score</span>
              <span className="font-bold">{carrier?.safetyScore ?? "—"}</span>
            </div>
          </div>
        </CarrierCard>

        {/* Insurance */}
        <CarrierCard padding="p-5">
          <h4 className="text-xs font-bold text-[#0D1B2A] mb-3">Insurance Status</h4>
          {isLoading ? (
            <div className="h-20 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                {insurance?.status ? <CarrierBadge status={insurance.status} /> : <span>—</span>}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Expires</span>
                <span>{insurance?.expiry ? new Date(insurance.expiry).toLocaleDateString() : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Cargo</span>
                <span>{insurance?.cargoAmount ? `$${Number(insurance.cargoAmount).toLocaleString()}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Auto Liability</span>
                <span>{insurance?.autoLiability ? `$${Number(insurance.autoLiability).toLocaleString()}` : "—"}</span>
              </div>
            </div>
          )}
        </CarrierCard>

        {/* Documents Status */}
        <CarrierCard padding="p-5">
          <h4 className="text-xs font-bold text-[#0D1B2A] mb-3">Required Documents</h4>
          <div className="space-y-3">
            {[
              { label: "W-9 Form", done: docs?.w9 },
              { label: "Insurance Certificate", done: docs?.insuranceCert },
              { label: "Authority Document", done: docs?.authorityDoc },
            ].map((d, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{d.label}</span>
                {d.done ? (
                  <CheckCircle size={16} className="text-emerald-500" />
                ) : (
                  <AlertCircle size={16} className="text-red-500" />
                )}
              </div>
            ))}
          </div>
        </CarrierCard>
      </div>

      {/* CSA/BASIC Scores */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">FMCSA BASIC Scores</h3>
          {Object.keys(basicScores).length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">No BASIC scores available</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(basicScores).map(([key, value]) => {
                const score = Number(value) || 0;
                const color = score <= 50 ? "bg-emerald-500" : score <= 75 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600">{scoreLabels[key] || key}</span>
                      <span className="text-xs font-bold">{score}%</span>
                    </div>
                    <div className="bg-gray-100 rounded h-2 overflow-hidden">
                      <div className={`h-full rounded ${color}`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CarrierCard>

        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">SRL Performance Metrics</h3>
          {srlMetrics ? (
            <div className="space-y-3">
              {[
                { label: "On-Time Pickup", value: srlMetrics.onTimePickup },
                { label: "On-Time Delivery", value: srlMetrics.onTimeDelivery },
                { label: "Communication", value: srlMetrics.communicationScore },
                { label: "Document Timeliness", value: srlMetrics.docTimeliness },
                { label: "Overall Score", value: srlMetrics.overallScore },
              ].map((m) => {
                const v = Number(m.value) || 0;
                const color = v >= 90 ? "bg-emerald-500" : v >= 75 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={m.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600">{m.label}</span>
                      <span className="text-xs font-bold">{v}%</span>
                    </div>
                    <div className="bg-gray-100 rounded h-2 overflow-hidden">
                      <div className={`h-full rounded ${color}`} style={{ width: `${v}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-gray-400">No performance data yet</div>
          )}
        </CarrierCard>
      </div>

      {/* Expiration Calendar + Alerts */}
      <div className="grid grid-cols-2 gap-4">
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">Upcoming Expirations</h3>
          {expItems.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">No upcoming expirations</div>
          ) : (
            <div className="space-y-2">
              {expItems.map((exp: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className={exp.status === "EXPIRED" ? "text-red-500" : exp.status === "EXPIRING_SOON" ? "text-amber-500" : "text-gray-400"} />
                    <span className="text-xs text-gray-700">{exp.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{new Date(exp.date).toLocaleDateString()}</span>
                    <CarrierBadge status={exp.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CarrierCard>

        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">Compliance Alerts</h3>
          {alerts.length === 0 ? (
            <div className="py-6 text-center text-xs text-emerald-500 flex flex-col items-center gap-2">
              <CheckCircle size={24} />
              All compliance requirements met
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert: any, i: number) => (
                <div key={i} className={`p-3 rounded-md text-xs ${
                  alert.severity === "critical" ? "bg-red-50 border border-red-200 text-red-700" :
                  alert.severity === "warning" ? "bg-amber-50 border border-amber-200 text-amber-700" :
                  "bg-blue-50 border border-blue-200 text-blue-700"
                }`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <AlertTriangle size={12} />
                    <span className="font-semibold">{alert.type || "Alert"}</span>
                  </div>
                  <div>{alert.message}</div>
                </div>
              ))}
            </div>
          )}
        </CarrierCard>
      </div>
    </div>
  );
}
