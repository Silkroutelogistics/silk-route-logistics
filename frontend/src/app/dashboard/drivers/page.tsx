"use client";

import { useState } from "react";
import { Search, User, Truck, Clock, AlertTriangle, CheckCircle2, Phone, MapPin, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface Driver {
  id: string;
  name: string;
  phone: string;
  license: string;
  licenseExpiry: string;
  status: "Available" | "On Route" | "Off Duty" | "Sleeper";
  currentLocation: string;
  hosDriving: number;
  hosOnDuty: number;
  hosCycleUsed: number;
  hosCycleLimit: number;
  assignedEquipment: string;
  assignedLoad: string | null;
  hireDate: string;
  violations: number;
  safetyScore: number;
}

interface Equipment {
  id: string;
  unit: string;
  type: string;
  year: number;
  make: string;
  vin: string;
  status: "Active" | "In Shop" | "Out of Service";
  mileage: number;
  nextService: string;
  assignedDriver: string | null;
}

const mockDrivers: Driver[] = [
  { id: "1", name: "Mike Johnson", phone: "(416) 555-0101", license: "CDL-A", licenseExpiry: "Sep 2027", status: "On Route", currentLocation: "Detroit, MI", hosDriving: 5.5, hosOnDuty: 7.0, hosCycleUsed: 48, hosCycleLimit: 70, assignedEquipment: "Unit 101 - 2023 Freightliner Cascadia", assignedLoad: "SRL-10042", hireDate: "Mar 2022", violations: 0, safetyScore: 98 },
  { id: "2", name: "Sarah Lee", phone: "(905) 555-0202", license: "CDL-A", licenseExpiry: "Jun 2026", status: "On Route", currentLocation: "Burlington, VT", hosDriving: 3.0, hosOnDuty: 4.5, hosCycleUsed: 35, hosCycleLimit: 70, assignedEquipment: "Unit 205 - 2024 Volvo VNL 860", assignedLoad: "SRL-10043", hireDate: "Jan 2023", violations: 0, safetyScore: 96 },
  { id: "3", name: "James Park", phone: "(604) 555-0303", license: "CDL-A", licenseExpiry: "Dec 2026", status: "On Route", currentLocation: "Abbotsford, BC", hosDriving: 1.0, hosOnDuty: 2.0, hosCycleUsed: 22, hosCycleLimit: 70, assignedEquipment: "Unit 310 - 2022 Kenworth T680", assignedLoad: "SRL-10044", hireDate: "Aug 2021", violations: 1, safetyScore: 92 },
  { id: "4", name: "Alex Turner", phone: "(403) 555-0404", license: "CDL-A", licenseExpiry: "Mar 2027", status: "Available", currentLocation: "Denver, CO", hosDriving: 0, hosOnDuty: 1.0, hosCycleUsed: 52, hosCycleLimit: 70, assignedEquipment: "Unit 115 - 2023 Freightliner Cascadia", assignedLoad: null, hireDate: "Jun 2022", violations: 0, safetyScore: 97 },
  { id: "5", name: "Chris Hall", phone: "(204) 555-0505", license: "CDL-A", licenseExpiry: "Nov 2026", status: "On Route", currentLocation: "Grand Forks, ND", hosDriving: 6.0, hosOnDuty: 8.0, hosCycleUsed: 55, hosCycleLimit: 70, assignedEquipment: "Unit 420 - 2023 Peterbilt 579", assignedLoad: "SRL-10047", hireDate: "May 2023", violations: 0, safetyScore: 95 },
  { id: "6", name: "Rachel Kim", phone: "(647) 555-0606", license: "CDL-A", licenseExpiry: "Aug 2026", status: "Off Duty", currentLocation: "Mississauga, ON", hosDriving: 0, hosOnDuty: 0, hosCycleUsed: 60, hosCycleLimit: 70, assignedEquipment: "Unit 118 - 2024 Freightliner Cascadia", assignedLoad: null, hireDate: "Nov 2022", violations: 0, safetyScore: 99 },
  { id: "7", name: "Tom Baker", phone: "(514) 555-0707", license: "CDL-A", licenseExpiry: "Apr 2026", status: "Sleeper", currentLocation: "Montreal, QC", hosDriving: 0, hosOnDuty: 0, hosCycleUsed: 42, hosCycleLimit: 70, assignedEquipment: "Unit 220 - 2023 Volvo VNL 760", assignedLoad: null, hireDate: "Feb 2021", violations: 2, safetyScore: 88 },
];

const mockEquipment: Equipment[] = [
  { id: "e1", unit: "Unit 101", type: "Day Cab", year: 2023, make: "Freightliner Cascadia", vin: "1FUJGLDR8XLAB1234", status: "Active", mileage: 145000, nextService: "Feb 20, 2026", assignedDriver: "Mike Johnson" },
  { id: "e2", unit: "Unit 205", type: "Sleeper", year: 2024, make: "Volvo VNL 860", vin: "4V4NC9EH5RN567890", status: "Active", mileage: 62000, nextService: "Mar 5, 2026", assignedDriver: "Sarah Lee" },
  { id: "e3", unit: "Unit 310", type: "Day Cab", year: 2022, make: "Kenworth T680", vin: "1XKYD49X0NJ345678", status: "Active", mileage: 210000, nextService: "Feb 15, 2026", assignedDriver: "James Park" },
  { id: "e4", unit: "Unit 115", type: "Sleeper", year: 2023, make: "Freightliner Cascadia", vin: "1FUJGLDR5XLAB5678", status: "Active", mileage: 128000, nextService: "Mar 12, 2026", assignedDriver: "Alex Turner" },
  { id: "e5", unit: "Unit 420", type: "Sleeper", year: 2023, make: "Peterbilt 579", vin: "1XPBDP9X1PD901234", status: "Active", mileage: 98000, nextService: "Apr 1, 2026", assignedDriver: "Chris Hall" },
  { id: "e6", unit: "Unit 502", type: "Dry Van Trailer", year: 2022, make: "Great Dane", vin: "1GRAA0628NB112233", status: "In Shop", mileage: 0, nextService: "—", assignedDriver: null },
  { id: "e7", unit: "Unit 605", type: "Reefer Trailer", year: 2023, make: "Utility", vin: "1UYVS2536NU445566", status: "Active", mileage: 0, nextService: "Mar 20, 2026", assignedDriver: null },
];

const statusColors: Record<string, string> = {
  "Available": "bg-green-50 text-green-700",
  "On Route": "bg-blue-50 text-blue-700",
  "Off Duty": "bg-slate-100 text-slate-600",
  "Sleeper": "bg-purple-50 text-purple-700",
  "Active": "bg-green-50 text-green-700",
  "In Shop": "bg-yellow-50 text-yellow-700",
  "Out of Service": "bg-red-50 text-red-700",
};

type Tab = "drivers" | "equipment";

export default function DriversPage() {
  const [tab, setTab] = useState<Tab>("drivers");
  const [search, setSearch] = useState("");

  const filteredDrivers = mockDrivers.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredEquipment = mockEquipment.filter((e) =>
    !search || e.unit.toLowerCase().includes(search.toLowerCase()) || e.make.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Driver & Equipment Management</h1>
      </div>

      {/* HOS Summary Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Total Drivers</p>
          <p className="text-2xl font-bold mt-1">{mockDrivers.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">On Route</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">{mockDrivers.filter((d) => d.status === "On Route").length}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Available</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{mockDrivers.filter((d) => d.status === "Available").length}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-slate-500">Avg Safety Score</p>
          <p className="text-2xl font-bold mt-1 text-gold">{Math.round(mockDrivers.reduce((s, d) => s + d.safetyScore, 0) / mockDrivers.length)}%</p>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex bg-slate-100 rounded-lg p-1">
          <button onClick={() => { setTab("drivers"); setSearch(""); }}
            className={cn("px-5 py-2 rounded-md text-sm font-medium transition",
              tab === "drivers" ? "bg-white shadow-sm text-navy" : "text-slate-500 hover:text-slate-700"
            )}>Drivers ({mockDrivers.length})</button>
          <button onClick={() => { setTab("equipment"); setSearch(""); }}
            className={cn("px-5 py-2 rounded-md text-sm font-medium transition",
              tab === "equipment" ? "bg-white shadow-sm text-navy" : "text-slate-500 hover:text-slate-700"
            )}>Equipment ({mockEquipment.length})</button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "drivers" ? "Search drivers..." : "Search equipment..."}
            className="w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl focus:ring-2 focus:ring-gold outline-none text-sm"
          />
        </div>
      </div>

      {/* Drivers Tab */}
      {tab === "drivers" && (
        <div className="space-y-3">
          {filteredDrivers.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-navy" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{d.name}</p>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[d.status])}>{d.status}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {d.phone}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {d.currentLocation}</span>
                      <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {d.license} — Exp: {d.licenseExpiry}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <Shield className={cn("w-4 h-4", d.safetyScore >= 95 ? "text-green-500" : d.safetyScore >= 90 ? "text-amber-500" : "text-red-500")} />
                    <span className="text-sm font-bold">{d.safetyScore}%</span>
                  </div>
                  <p className="text-xs text-slate-400">Safety Score</p>
                </div>
              </div>

              {/* HOS Bar */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Driving</span>
                    <span className="font-medium">{d.hosDriving}h / 11h</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", d.hosDriving > 9 ? "bg-red-500" : d.hosDriving > 7 ? "bg-amber-500" : "bg-green-500")} style={{ width: `${(d.hosDriving / 11) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">On-Duty</span>
                    <span className="font-medium">{d.hosOnDuty}h / 14h</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", d.hosOnDuty > 12 ? "bg-red-500" : d.hosOnDuty > 10 ? "bg-amber-500" : "bg-blue-500")} style={{ width: `${(d.hosOnDuty / 14) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Cycle</span>
                    <span className="font-medium">{d.hosCycleUsed}h / {d.hosCycleLimit}h</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", d.hosCycleUsed > 60 ? "bg-amber-500" : "bg-indigo-500")} style={{ width: `${(d.hosCycleUsed / d.hosCycleLimit) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Bottom row */}
              <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {d.assignedEquipment}</span>
                {d.assignedLoad && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Load: {d.assignedLoad}</span>}
                {d.violations > 0 && <span className="flex items-center gap-1 text-red-500"><AlertTriangle className="w-3 h-3" /> {d.violations} violation(s)</span>}
                {d.violations === 0 && <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="w-3 h-3" /> Clean record</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Equipment Tab */}
      {tab === "equipment" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Unit</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Year / Make</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Mileage</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Next Service</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquipment.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-5 py-3 font-medium">{e.unit}</td>
                  <td className="px-5 py-3 text-slate-600">{e.type}</td>
                  <td className="px-5 py-3 text-slate-600">{e.year} {e.make}</td>
                  <td className="px-5 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[e.status])}>{e.status}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{e.mileage > 0 ? `${e.mileage.toLocaleString()} mi` : "N/A"}</td>
                  <td className="px-5 py-3 text-slate-600">{e.nextService}</td>
                  <td className="px-5 py-3 text-slate-600">{e.assignedDriver || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
