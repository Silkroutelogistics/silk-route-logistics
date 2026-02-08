"use client";

import { useState } from "react";
import { DollarSign, TrendingUp, TrendingDown, CreditCard, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { cn } from "@/lib/utils";

const revenueData = [
  { month: "Sep", revenue: 185000, expenses: 142000 },
  { month: "Oct", revenue: 210000, expenses: 155000 },
  { month: "Nov", revenue: 195000, expenses: 148000 },
  { month: "Dec", revenue: 240000, expenses: 170000 },
  { month: "Jan", revenue: 225000, expenses: 162000 },
  { month: "Feb", revenue: 198000, expenses: 151000 },
];

const expenseBreakdown = [
  { name: "Fuel", value: 45000, color: "#D4A843" },
  { name: "Driver Pay", value: 52000, color: "#3B82F6" },
  { name: "Insurance", value: 18000, color: "#10B981" },
  { name: "Maintenance", value: 12000, color: "#8B5CF6" },
  { name: "Tolls & Permits", value: 8000, color: "#F59E0B" },
  { name: "Other", value: 16000, color: "#6B7280" },
];

const arAging = [
  { customer: "ABC Manufacturing", invoice: "INV-2401", amount: 12500, age: 15, bucket: "0-30 days" },
  { customer: "XYZ Distribution", invoice: "INV-2389", amount: 8200, age: 28, bucket: "0-30 days" },
  { customer: "Maple Foods Inc.", invoice: "INV-2350", amount: 15800, age: 42, bucket: "31-60 days" },
  { customer: "Great Lakes Supply", invoice: "INV-2320", amount: 6400, age: 55, bucket: "31-60 days" },
  { customer: "Pacific Traders", invoice: "INV-2290", amount: 22000, age: 68, bucket: "61-90 days" },
  { customer: "Northern Exports", invoice: "INV-2245", amount: 9100, age: 95, bucket: "90+ days" },
];

const periods = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "ytd", label: "YTD" },
];

export default function FinancePage() {
  const [period, setPeriod] = useState("monthly");

  const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
  const totalExpenses = revenueData.reduce((sum, d) => sum + d.expenses, 0);
  const profit = totalRevenue - totalExpenses;
  const totalAR = arAging.reduce((sum, a) => sum + a.amount, 0);

  const stats = [
    { label: "Total Revenue", value: `$${(totalRevenue / 1000).toFixed(0)}K`, change: "+12.5%", up: true, icon: DollarSign, color: "text-green-600 bg-green-50" },
    { label: "Total Expenses", value: `$${(totalExpenses / 1000).toFixed(0)}K`, change: "+4.2%", up: true, icon: TrendingDown, color: "text-red-600 bg-red-50" },
    { label: "Net Profit", value: `$${(profit / 1000).toFixed(0)}K`, change: "+28.3%", up: true, icon: TrendingUp, color: "text-blue-600 bg-blue-50" },
    { label: "Accounts Receivable", value: `$${(totalAR / 1000).toFixed(1)}K`, change: "-5.1%", up: false, icon: CreditCard, color: "text-amber-600 bg-amber-50" },
  ];

  const agingBuckets = [
    { label: "0-30 days", amount: arAging.filter((a) => a.age <= 30).reduce((s, a) => s + a.amount, 0), color: "bg-green-500" },
    { label: "31-60 days", amount: arAging.filter((a) => a.age > 30 && a.age <= 60).reduce((s, a) => s + a.amount, 0), color: "bg-yellow-500" },
    { label: "61-90 days", amount: arAging.filter((a) => a.age > 60 && a.age <= 90).reduce((s, a) => s + a.amount, 0), color: "bg-orange-500" },
    { label: "90+ days", amount: arAging.filter((a) => a.age > 90).reduce((s, a) => s + a.amount, 0), color: "bg-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Financial Analytics</h1>
        <div className="flex bg-slate-100 rounded-lg p-1">
          {periods.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition",
                period === p.key ? "bg-white shadow-sm text-navy" : "text-slate-500 hover:text-slate-700"
              )}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", s.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm text-slate-500">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <div className="flex items-center gap-1 mt-1">
                {s.up ? <ArrowUpRight className="w-3 h-3 text-green-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
                <span className={cn("text-xs font-medium", s.up ? "text-green-600" : "text-red-600")}>{s.change}</span>
                <span className="text-xs text-slate-400">vs last period</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue vs Expenses Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Revenue vs Expenses</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueData}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={(v: any) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="revenue" fill="#D4A843" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="expenses" fill="#94A3B8" radius={[4, 4, 0, 0]} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expense Breakdown Pie Chart */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Expense Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} innerRadius={40}>
                {expenseBreakdown.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AR Aging */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Accounts Receivable Aging</h2>
          <div className="flex gap-3">
            {agingBuckets.map((b) => (
              <div key={b.label} className="flex items-center gap-1.5">
                <div className={cn("w-2.5 h-2.5 rounded-full", b.color)} />
                <span className="text-xs text-slate-500">{b.label}: ${(b.amount / 1000).toFixed(1)}K</span>
              </div>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Customer</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Invoice</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Amount</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Days Outstanding</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Aging Bucket</th>
            </tr>
          </thead>
          <tbody>
            {arAging.map((a) => (
              <tr key={a.invoice} className="border-b last:border-0">
                <td className="px-5 py-3 font-medium">{a.customer}</td>
                <td className="px-5 py-3 text-slate-600">{a.invoice}</td>
                <td className="px-5 py-3 font-medium">${a.amount.toLocaleString()}</td>
                <td className="px-5 py-3 text-slate-600">{a.age} days</td>
                <td className="px-5 py-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
                    a.age <= 30 ? "bg-green-50 text-green-700" :
                    a.age <= 60 ? "bg-yellow-50 text-yellow-700" :
                    a.age <= 90 ? "bg-orange-50 text-orange-700" :
                    "bg-red-50 text-red-700"
                  )}>{a.bucket}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AP Summary */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Accounts Payable Summary</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-slate-50">
            <p className="text-sm text-slate-500">Carrier Payments Due</p>
            <p className="text-xl font-bold mt-1">$42,800</p>
            <p className="text-xs text-slate-400 mt-1">12 invoices pending</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50">
            <p className="text-sm text-slate-500">Fuel Cards Outstanding</p>
            <p className="text-xl font-bold mt-1">$8,350</p>
            <p className="text-xs text-slate-400 mt-1">Due in 15 days</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50">
            <p className="text-sm text-slate-500">Insurance Premiums</p>
            <p className="text-xl font-bold mt-1">$18,200</p>
            <p className="text-xs text-slate-400 mt-1">Next payment: Mar 1</p>
          </div>
        </div>
      </div>
    </div>
  );
}
