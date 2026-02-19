"use client";

import { Search, ArrowRight } from "lucide-react";
import { ShipperCard } from "@/components/shipper";

const contacts = [
  { name: "Sarah M. — Your Account Rep", preview: "The rate for your Nashville lane is...", time: "2h", unread: true },
  { name: "Claims Department", preview: "Your claim #CLM-042 has been updated", time: "1d", unread: false },
  { name: "SRL Operations", preview: "Weather advisory: Midwest lanes", time: "2d", unread: false },
];

const chatMessages = [
  { from: "rep", msg: "Hi! I've pulled the latest rates for your Kalamazoo → Nashville lane. Looking at $2,150-$2,400 for dry van this week.", time: "10:30 AM" },
  { from: "you", msg: "Thanks Sarah. Can we lock in $2,200 for a recurring weekly commitment?", time: "10:45 AM" },
  { from: "rep", msg: "I can offer $2,175 for a 4-week commitment with guaranteed capacity. Want me to set that up?", time: "11:02 AM" },
];

export default function ShipperMessagesPage() {
  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-6">Messages</h1>
      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Contact list */}
        <ShipperCard padding="p-0">
          <div className="p-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2.5 py-1.5 border border-gray-200 rounded-md">
              <Search size={14} className="text-gray-400" />
              <input placeholder="Search messages..." className="border-none outline-none text-xs w-full" />
            </div>
          </div>
          {contacts.map((m, i) => (
            <div key={i} className={`px-4 py-3.5 border-b border-gray-100 cursor-pointer ${i === 0 ? "bg-[#C9A84C]/[0.06]" : "hover:bg-gray-50"}`}>
              <div className="flex justify-between mb-1">
                <span className={`text-[13px] ${m.unread ? "font-bold" : "font-medium"} text-[#0D1B2A]`}>{m.name}</span>
                <span className="text-[10px] text-gray-400">{m.time}</span>
              </div>
              <div className="text-xs text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">{m.preview}</div>
            </div>
          ))}
        </ShipperCard>

        {/* Chat */}
        <ShipperCard padding="p-0" className="flex flex-col">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0D1B2A] to-[#1B2D45] flex items-center justify-center text-[13px] font-bold text-[#C9A84C]">SM</div>
            <div>
              <div className="text-sm font-semibold text-[#0D1B2A]">Sarah M. — Your Account Rep</div>
              <div className="text-[11px] text-emerald-500">● Online</div>
            </div>
          </div>
          <div className="flex-1 p-5 min-h-[300px]">
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"} mb-4`}>
                <div className={`max-w-[70%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed ${
                  m.from === "you" ? "bg-[#0D1B2A] text-white" : "bg-gray-100 text-gray-700"
                }`}>
                  {m.msg}
                  <div className="text-[10px] text-gray-400 mt-1 text-right">{m.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input placeholder="Type a message..." className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-[#C9A84C]" />
            <button className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[11px] font-semibold uppercase tracking-[2px] rounded">
              <ArrowRight size={14} /> Send
            </button>
          </div>
        </ShipperCard>
      </div>
    </div>
  );
}
