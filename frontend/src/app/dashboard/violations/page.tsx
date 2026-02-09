"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Shield, CheckCircle, XCircle, AlertTriangle, Truck, Users,
  FileText, Activity,
} from "lucide-react";

interface FMCSAData {
  verified: boolean;
  legalName: string | null;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string;
  operatingStatus: string | null;
  entityType: string | null;
  safetyRating: string | null;
  insuranceOnFile: boolean;
  outOfServiceDate: string | null;
  totalDrivers: number | null;
  totalPowerUnits: number | null;
  errors: string[];
}

interface ScorecardData {
  currentTier: string;
  currentScore: number;
  nextTierThreshold: number;
  pointsToNextTier: number;
  scorecards: Array<{
    onTimePickupPct: number;
    onTimeDeliveryPct: number;
    communicationScore: number;
    claimRatio: number;
    documentSubmissionTimeliness: number;
    acceptanceRate: number;
    gpsCompliancePct: number;
    overallScore: number;
    calculatedAt: string;
  }>;
}

interface ComplianceAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
}

const TIER_COLORS: Record<string, string> = {
  PLATINUM: "text-purple-300 bg-purple-500/20",
  GOLD: "text-gold bg-gold/20",
  SILVER: "text-slate-300 bg-slate-400/20",
  BRONZE: "text-orange-300 bg-orange-500/20",
};

function ScoreGauge({ label, value, suffix = "%" }: { label: string; value: number | undefined; suffix?: string }) {
  const val = value ?? 0;
  const color = val >= 95 ? "text-green-400" : val >= 85 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="bg-white/5 rounded-lg p-3 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{val.toFixed(1)}{suffix}</p>
    </div>
  );
}

export default function ViolationsPage() {
  const { data: fmcsa, isLoading: fmcsaLoading } = useQuery({
    queryKey: ["fmcsa-my-profile"],
    queryFn: () => api.get<FMCSAData>("/fmcsa/my-profile").then((r) => r.data),
  });

  const { data: scorecard } = useQuery({
    queryKey: ["carrier-scorecard"],
    queryFn: () => api.get<ScorecardData>("/carrier/scorecard").then((r) => r.data),
  });

  const { data: alertsData } = useQuery({
    queryKey: ["compliance-alerts"],
    queryFn: () => api.get<{ alerts: ComplianceAlert[] }>("/compliance/alerts").then((r) => r.data),
  });

  const latest = scorecard?.scorecards?.[0];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-gold" /> DOT / Compliance
        </h1>
        <p className="text-slate-400 text-sm mt-1">FMCSA profile, safety ratings, and compliance status</p>
      </div>

      {/* FMCSA Profile Summary */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">FMCSA Profile</h2>

        {fmcsaLoading ? (
          <div className="text-slate-500 text-sm py-8 text-center">Loading FMCSA data...</div>
        ) : fmcsa?.errors && fmcsa.errors.length > 0 && !fmcsa.legalName ? (
          <div className="text-center py-8 space-y-2">
            <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto" />
            <p className="text-sm text-slate-400">Could not retrieve FMCSA data</p>
            <p className="text-xs text-slate-500">{fmcsa.errors[0]}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-white">{fmcsa?.legalName || "—"}</p>
                {fmcsa?.dbaName && <p className="text-sm text-slate-400">DBA: {fmcsa.dbaName}</p>}
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                fmcsa?.operatingStatus === "AUTHORIZED"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}>
                {fmcsa?.operatingStatus === "AUTHORIZED"
                  ? <CheckCircle className="w-3.5 h-3.5" />
                  : <XCircle className="w-3.5 h-3.5" />
                }
                {fmcsa?.operatingStatus || "Unknown"}
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><FileText className="w-3 h-3" /> DOT Number</p>
                <p className="text-sm font-mono text-white mt-1">{fmcsa?.dotNumber || "—"}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><FileText className="w-3 h-3" /> MC Number</p>
                <p className="text-sm font-mono text-white mt-1">{fmcsa?.mcNumber || "—"}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> Drivers</p>
                <p className="text-sm font-bold text-white mt-1">{fmcsa?.totalDrivers ?? "—"}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Truck className="w-3 h-3" /> Power Units</p>
                <p className="text-sm font-bold text-white mt-1">{fmcsa?.totalPowerUnits ?? "—"}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-slate-500">Safety Rating</p>
                <p className={`text-sm font-medium mt-1 ${
                  fmcsa?.safetyRating === "SATISFACTORY" ? "text-green-400" : "text-yellow-400"
                }`}>
                  {fmcsa?.safetyRating || "Not Rated"}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-slate-500">Insurance On File</p>
                <p className={`text-sm font-medium mt-1 ${fmcsa?.insuranceOnFile ? "text-green-400" : "text-red-400"}`}>
                  {fmcsa?.insuranceOnFile ? "Yes" : "No"}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-slate-500">Entity Type</p>
                <p className="text-sm text-white mt-1">{fmcsa?.entityType || "—"}</p>
              </div>
            </div>

            {fmcsa?.errors && fmcsa.errors.length > 0 && (
              <p className="text-xs text-slate-500 italic">{fmcsa.errors[0]}</p>
            )}
          </>
        )}
      </div>

      {/* Carrier Scorecard */}
      {scorecard && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">Carrier Scorecard</h2>
            {scorecard.currentTier && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${TIER_COLORS[scorecard.currentTier] || "text-slate-300 bg-white/10"}`}>
                {scorecard.currentTier}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreGauge label="Overall Score" value={latest?.overallScore} />
            <ScoreGauge label="On-Time Pickup" value={latest?.onTimePickupPct} />
            <ScoreGauge label="On-Time Delivery" value={latest?.onTimeDeliveryPct} />
            <ScoreGauge label="Communication" value={latest?.communicationScore} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreGauge label="Claim Ratio" value={latest?.claimRatio} suffix="%" />
            <ScoreGauge label="Doc Timeliness" value={latest?.documentSubmissionTimeliness} />
            <ScoreGauge label="Acceptance Rate" value={latest?.acceptanceRate} />
            <ScoreGauge label="GPS Compliance" value={latest?.gpsCompliancePct} />
          </div>

          {scorecard.pointsToNextTier > 0 && (
            <p className="text-xs text-slate-500">
              {scorecard.pointsToNextTier.toFixed(1)} points to next tier ({scorecard.nextTierThreshold}+)
            </p>
          )}
        </div>
      )}

      {/* Compliance Alerts */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gold uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4" /> Compliance Alerts
        </h2>

        {alertsData?.alerts && alertsData.alerts.length > 0 ? (
          <div className="space-y-3">
            {alertsData.alerts.map((alert) => (
              <div key={alert.id} className={`bg-white/5 rounded-lg p-4 border-l-4 ${
                alert.severity === "HIGH" ? "border-red-500" :
                alert.severity === "MEDIUM" ? "border-yellow-500" : "border-blue-500"
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{alert.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{alert.message}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    alert.status === "ACTIVE" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                  }`}>
                    {alert.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-2">{new Date(alert.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No active compliance alerts</p>
          </div>
        )}
      </div>
    </div>
  );
}
