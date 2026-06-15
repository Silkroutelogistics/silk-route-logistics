"use client";

// v3.8.amz — SRL Driver Academy Sprint T2: driver portal landing (placeholder).
// The driver is authenticated (phone + PIN). Real course list + lessons +
// quizzes land in Sprint T4; this honest placeholder previews the curriculum
// as locked cards so the driver sees what's coming.

import { useDriverAuth } from "@/hooks/useDriverAuth";
import { GraduationCap, Lock, Clock } from "lucide-react";

const COMING_COURSES = [
  { title: "ELD & Hours of Service", topic: "11/14/70 limits, malfunctions, logs" },
  { title: "IFTA Fundamentals", topic: "Quarterly filing, trip & fuel records" },
  { title: "IRP Apportioned Plates", topic: "Cab cards, jurisdictions, renewals" },
  { title: "Roadside Inspections & CSA", topic: "Levels 1–8, DataQs, BASICs" },
  { title: "Detention & Documentation", topic: "BOL/POD, accessorials, check calls" },
  { title: "Fraud & Double-Brokering Awareness", topic: "Spotting scams, protecting loads" },
];

export default function DriverDashboardPage() {
  const { driver } = useDriverAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0F1117] mb-1">
          Welcome{driver ? `, ${driver.firstName}` : ""}
        </h1>
        <p className="text-[13px] text-gray-500">Your driver training courses will appear here.</p>
      </div>

      {/* Coming-soon banner */}
      <div className="mb-6 px-4 py-4 bg-[#C9A84C]/8 border border-[#C9A84C]/25 rounded-xl flex items-start gap-3">
        <GraduationCap size={20} className="text-[#BA7517] shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-[#0F1117]">Your account is active. Courses are launching soon.</div>
          <p className="text-[13px] text-gray-600 mt-0.5">
            You&apos;re all set up. When your carrier&apos;s training goes live, you&apos;ll work through the
            courses below at your own pace and earn a completion certificate for each.
          </p>
        </div>
      </div>

      {/* Curriculum preview */}
      <div className="grid sm:grid-cols-2 gap-3">
        {COMING_COURSES.map((c) => (
          <div key={c.title} className="bg-white border border-gray-100 rounded-xl p-4 flex items-start gap-3 opacity-90">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Lock size={15} className="text-gray-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#0F1117]">{c.title}</div>
              <div className="text-[12px] text-gray-500">{c.topic}</div>
              <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                <Clock size={11} /> Coming soon
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
