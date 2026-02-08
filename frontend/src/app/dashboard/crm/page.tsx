"use client";

import { useState } from "react";
import { Search, Building2, Phone, Mail, MapPin, Package, ChevronDown, ChevronUp, Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  totalShipments: number;
  totalRevenue: number;
  avgShipmentValue: number;
  status: "Active" | "Inactive" | "Prospect";
  rating: number;
  lastShipment: string;
  notes: string;
  shipments: { id: string; date: string; origin: string; destination: string; amount: number; status: string }[];
}

const mockCustomers: Customer[] = [
  {
    id: "1", name: "ABC Manufacturing", contact: "John Smith", email: "john@abcmfg.com", phone: "(416) 555-0101",
    address: "100 Industrial Pkwy, Brampton, ON", totalShipments: 145, totalRevenue: 892000, avgShipmentValue: 6152,
    status: "Active", rating: 5, lastShipment: "Feb 5, 2026", notes: "Long-term customer. Prefers reefer for produce shipments.",
    shipments: [
      { id: "s1", date: "Feb 5, 2026", origin: "Brampton, ON", destination: "Chicago, IL", amount: 5800, status: "Delivered" },
      { id: "s2", date: "Jan 28, 2026", origin: "Brampton, ON", destination: "Detroit, MI", amount: 3200, status: "Delivered" },
      { id: "s3", date: "Jan 15, 2026", origin: "Brampton, ON", destination: "Buffalo, NY", amount: 2100, status: "Delivered" },
    ],
  },
  {
    id: "2", name: "XYZ Distribution", contact: "Lisa Chen", email: "lisa@xyzdist.com", phone: "(905) 555-0202",
    address: "250 Logistics Rd, Mississauga, ON", totalShipments: 98, totalRevenue: 645000, avgShipmentValue: 6582,
    status: "Active", rating: 4, lastShipment: "Feb 3, 2026", notes: "Seasonal peaks in Q4. Needs dedicated capacity Sep-Dec.",
    shipments: [
      { id: "s4", date: "Feb 3, 2026", origin: "Mississauga, ON", destination: "Montreal, QC", amount: 4500, status: "Delivered" },
      { id: "s5", date: "Jan 20, 2026", origin: "Mississauga, ON", destination: "New York, NY", amount: 7200, status: "Delivered" },
    ],
  },
  {
    id: "3", name: "Maple Foods Inc.", contact: "David Roy", email: "david@maplefoods.ca", phone: "(514) 555-0303",
    address: "75 Food Court Blvd, Laval, QC", totalShipments: 72, totalRevenue: 420000, avgShipmentValue: 5833,
    status: "Active", rating: 4, lastShipment: "Feb 1, 2026", notes: "Temperature-sensitive goods. Must maintain 34-38°F.",
    shipments: [
      { id: "s6", date: "Feb 1, 2026", origin: "Laval, QC", destination: "Toronto, ON", amount: 5200, status: "In Transit" },
    ],
  },
  {
    id: "4", name: "Great Lakes Supply", contact: "Amy Wang", email: "amy@greatlakes.com", phone: "(312) 555-0404",
    address: "500 Lakeshore Dr, Chicago, IL", totalShipments: 35, totalRevenue: 195000, avgShipmentValue: 5571,
    status: "Active", rating: 3, lastShipment: "Jan 25, 2026", notes: "Growing account. Interested in dedicated fleet option.",
    shipments: [],
  },
  {
    id: "5", name: "Pacific Traders", contact: "Kevin Nguyen", email: "kevin@pacifictraders.com", phone: "(604) 555-0505",
    address: "800 Port Way, Vancouver, BC", totalShipments: 12, totalRevenue: 84000, avgShipmentValue: 7000,
    status: "Prospect", rating: 0, lastShipment: "—", notes: "Met at logistics expo. Interested in cross-border service.",
    shipments: [],
  },
  {
    id: "6", name: "Northern Exports", contact: "Marie Tremblay", email: "marie@northexp.ca", phone: "(403) 555-0606",
    address: "120 Export Ave, Calgary, AB", totalShipments: 8, totalRevenue: 42000, avgShipmentValue: 5250,
    status: "Inactive", rating: 2, lastShipment: "Nov 10, 2025", notes: "Paused operations. Follow up in Q2 2026.",
    shipments: [],
  },
];

const statusColors: Record<string, string> = {
  Active: "bg-green-50 text-green-700",
  Inactive: "bg-slate-100 text-slate-600",
  Prospect: "bg-blue-50 text-blue-700",
};

export default function CRMPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = mockCustomers.filter((c) => {
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.contact.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customer Relationship Management</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{filtered.length} customer(s)</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers or contacts..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-gold outline-none text-sm"
          />
        </div>
        <div className="flex bg-slate-100 rounded-lg p-1">
          {["All", "Active", "Prospect", "Inactive"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition",
                statusFilter === s ? "bg-white shadow-sm text-navy" : "text-slate-500 hover:text-slate-700"
              )}>{s}</button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Total Customers</p>
          <p className="text-2xl font-bold mt-1">{mockCustomers.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Active</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{mockCustomers.filter((c) => c.status === "Active").length}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Total Revenue</p>
          <p className="text-2xl font-bold mt-1">${(mockCustomers.reduce((s, c) => s + c.totalRevenue, 0) / 1000).toFixed(0)}K</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Total Shipments</p>
          <p className="text-2xl font-bold mt-1">{mockCustomers.reduce((s, c) => s + c.totalShipments, 0)}</p>
        </div>
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {filtered.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              className="w-full text-left p-5 hover:bg-slate-50/50 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-navy" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold">{c.name}</p>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[c.status])}>{c.status}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.address}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-sm font-medium">${(c.totalRevenue / 1000).toFixed(0)}K</p>
                    <p className="text-xs text-slate-400">{c.totalShipments} loads</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={cn("w-3 h-3", i < c.rating ? "text-gold fill-gold" : "text-slate-200")} />
                    ))}
                  </div>
                  {expanded === c.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
            </button>

            {expanded === c.id && (
              <div className="border-t px-5 py-4 bg-slate-50/50">
                <div className="grid sm:grid-cols-2 gap-6">
                  {/* Details & Notes */}
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-medium mb-1">Contact</p>
                      <p className="text-sm">{c.contact}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-medium mb-1">Avg Shipment Value</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-green-500" />
                        ${c.avgShipmentValue.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-medium mb-1">Last Shipment</p>
                      <p className="text-sm">{c.lastShipment}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-medium mb-1">Notes</p>
                      <p className="text-sm text-slate-600">{c.notes}</p>
                    </div>
                  </div>

                  {/* Recent Shipments */}
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-medium mb-2">Recent Shipments</p>
                    {c.shipments.length > 0 ? (
                      <div className="space-y-2">
                        {c.shipments.map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-3 bg-white rounded-lg border text-sm">
                            <div>
                              <p className="font-medium">{s.origin} → {s.destination}</p>
                              <p className="text-xs text-slate-400">{s.date}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">${s.amount.toLocaleString()}</p>
                              <p className={cn("text-xs", s.status === "Delivered" ? "text-green-600" : "text-amber-600")}>{s.status}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-white rounded-lg border text-center">
                        <Package className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                        <p className="text-xs text-slate-400">No recent shipments</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
