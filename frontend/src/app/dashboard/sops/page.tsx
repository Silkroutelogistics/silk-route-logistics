"use client";

import { useState } from "react";
import { Search, FileText, BookOpen, Shield, Truck, DollarSign, Users, Clock, ChevronRight, Download, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface SOP {
  id: string;
  title: string;
  category: string;
  version: string;
  lastUpdated: string;
  author: string;
  description: string;
  pages: number;
}

const categories = [
  { key: "all", label: "All", icon: BookOpen },
  { key: "operations", label: "Operations", icon: Truck },
  { key: "safety", label: "Safety & Compliance", icon: Shield },
  { key: "finance", label: "Finance", icon: DollarSign },
  { key: "hr", label: "Human Resources", icon: Users },
];

const mockSOPs: SOP[] = [
  { id: "1", title: "Driver Onboarding Procedure", category: "hr", version: "3.2", lastUpdated: "Jan 15, 2026", author: "HR Department", description: "Step-by-step process for onboarding new drivers including background checks, drug testing, orientation schedule, and equipment assignment.", pages: 12 },
  { id: "2", title: "Cross-Border Shipping Protocol", category: "operations", version: "5.1", lastUpdated: "Feb 1, 2026", author: "Operations", description: "Complete guide for US-Canada cross-border freight movements including customs documentation, FAST card requirements, and C-TPAT compliance.", pages: 24 },
  { id: "3", title: "Accident & Incident Reporting", category: "safety", version: "2.4", lastUpdated: "Dec 10, 2025", author: "Safety Team", description: "Mandatory procedures for reporting and documenting accidents, incidents, and near-misses. Includes notification chain and investigation steps.", pages: 8 },
  { id: "4", title: "Invoice Processing & Factoring", category: "finance", version: "4.0", lastUpdated: "Jan 20, 2026", author: "Finance", description: "Guidelines for invoice submission, verification, factoring requests, and payment processing timelines.", pages: 10 },
  { id: "5", title: "Hours of Service (HOS) Compliance", category: "safety", version: "6.0", lastUpdated: "Jan 5, 2026", author: "Safety Team", description: "ELD compliance guidelines, HOS rules for US and Canadian operations, and exemptions. Includes rest period calculations and violation prevention.", pages: 18 },
  { id: "6", title: "Vehicle Inspection & Maintenance", category: "operations", version: "3.8", lastUpdated: "Dec 20, 2025", author: "Maintenance", description: "Pre-trip and post-trip inspection checklists, scheduled maintenance intervals, and breakdown procedures.", pages: 15 },
  { id: "7", title: "Hazmat Handling Procedures", category: "safety", version: "2.1", lastUpdated: "Nov 15, 2025", author: "Safety Team", description: "Procedures for handling, loading, and transporting hazardous materials. Includes placarding requirements and emergency response contacts.", pages: 20 },
  { id: "8", title: "Load Tendering & Dispatch", category: "operations", version: "4.5", lastUpdated: "Feb 3, 2026", author: "Dispatch", description: "Process for receiving load tenders, carrier assignment, dispatch communication, and status update requirements.", pages: 9 },
  { id: "9", title: "Carrier Settlement & Pay", category: "finance", version: "2.8", lastUpdated: "Jan 8, 2026", author: "Finance", description: "Carrier pay calculation methods, deduction policies, settlement schedules, and dispute resolution process.", pages: 11 },
  { id: "10", title: "Customer Onboarding & Credit", category: "finance", version: "1.5", lastUpdated: "Dec 1, 2025", author: "Finance", description: "New customer setup including credit checks, payment terms negotiation, and contract requirements.", pages: 7 },
  { id: "11", title: "Reefer Temperature Monitoring", category: "operations", version: "2.0", lastUpdated: "Jan 12, 2026", author: "Operations", description: "Temperature monitoring protocols for refrigerated loads. Includes pre-cool requirements, continuous monitoring, and deviation response.", pages: 6 },
  { id: "12", title: "Employee Code of Conduct", category: "hr", version: "1.3", lastUpdated: "Oct 1, 2025", author: "HR Department", description: "Company policies on professional conduct, anti-harassment, drug and alcohol policy, and disciplinary procedures.", pages: 14 },
];

export default function SOPsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedSOP, setSelectedSOP] = useState<SOP | null>(null);

  const filtered = mockSOPs.filter((s) => {
    const matchesSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === "all" || s.category === category;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">SOP Library</h1>
        <span className="text-sm text-slate-500">{mockSOPs.length} documents</span>
      </div>

      {/* Search & Categories */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SOPs by title or description..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-gold outline-none text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const Icon = c.icon;
          return (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition",
                category === c.key ? "bg-gold/10 border-gold text-gold font-medium" : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
              )}>
              <Icon className="w-4 h-4" />
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* SOP List */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.map((sop) => (
            <button
              key={sop.id}
              onClick={() => setSelectedSOP(sop)}
              className={cn(
                "w-full text-left bg-white rounded-xl border p-5 hover:border-gold/30 transition",
                selectedSOP?.id === sop.id && "border-gold ring-1 ring-gold/20"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <p className="font-semibold">{sop.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{sop.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 ml-13 pl-13">
                <span>v{sop.version}</span>
                <span>{sop.pages} pages</span>
                <span>Updated: {sop.lastUpdated}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
                  sop.category === "operations" ? "bg-blue-50 text-blue-700" :
                  sop.category === "safety" ? "bg-red-50 text-red-700" :
                  sop.category === "finance" ? "bg-green-50 text-green-700" :
                  "bg-purple-50 text-purple-700"
                )}>
                  {categories.find((c) => c.key === sop.category)?.label}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No SOPs found matching your search</p>
            </div>
          )}
        </div>

        {/* SOP Detail / Preview */}
        <div>
          {selectedSOP ? (
            <div className="bg-white rounded-xl border p-5 space-y-5 sticky top-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-gold" />
                </div>
                <div>
                  <p className="font-semibold">{selectedSOP.title}</p>
                  <p className="text-xs text-slate-500">Version {selectedSOP.version}</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Author</span><span className="font-medium">{selectedSOP.author}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Last Updated</span><span className="font-medium">{selectedSOP.lastUpdated}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Pages</span><span className="font-medium">{selectedSOP.pages}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Category</span><span className="font-medium capitalize">{selectedSOP.category}</span></div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">{selectedSOP.description}</p>

              {/* PDF Preview Placeholder */}
              <div className="h-48 bg-slate-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <Eye className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">PDF preview coming soon</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light text-sm transition">
                  <Eye className="w-4 h-4" /> View Full
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm transition">
                  <Download className="w-4 h-4" /> Download
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-12 text-center">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select a document to preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
