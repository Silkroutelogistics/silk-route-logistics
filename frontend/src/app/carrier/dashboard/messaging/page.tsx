"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Search, Plus, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { CarrierCard } from "@/components/carrier";

interface Conversation {
  partner: { id: string; firstName: string; lastName: string; company: string | null; role: string; email?: string };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface Message {
  id: string; senderId: string; content: string; createdAt: string;
  sender: { id: string; firstName: string; lastName: string };
}

interface UserResult {
  id: string; firstName: string; lastName: string; company: string | null; role: string; email: string;
}

export default function CarrierMessagingPage() {
  const { user } = useCarrierAuth();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["carrier-conversations"],
    queryFn: () => api.get<Conversation[]>("/messages/conversations").then((r) => r.data),
    refetchInterval: 15000,
  });

  const { data: messages } = useQuery({
    queryKey: ["carrier-messages", selectedUserId],
    queryFn: () => api.get<Message[]>(`/messages?conversationWith=${selectedUserId}`).then((r) => r.data),
    enabled: !!selectedUserId,
    refetchInterval: 5000,
  });

  const { data: searchResults } = useQuery({
    queryKey: ["carrier-user-search", userSearch],
    queryFn: () => api.get<UserResult[]>(`/messages/users?search=${userSearch}`).then((r) => r.data),
    enabled: showNewMsg && userSearch.length > 1,
  });

  const sendMsg = useMutation({
    mutationFn: () => api.post("/messages", { receiverId: selectedUserId, content: newMessage }),
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["carrier-messages", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["carrier-conversations"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectConversation = (partnerId: string, name: string) => {
    setSelectedUserId(partnerId);
    setSelectedUserName(name);
    setShowNewMsg(false);
    setUserSearch("");
  };

  const totalUnread = conversations?.reduce((s, c) => s + c.unreadCount, 0) || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Messages</h1>
        <p className="text-[13px] text-gray-500">
          Communicate with your dispatcher and SRL operations team
          {totalUnread > 0 && <span className="ml-2 text-[#C9A84C] font-semibold">{totalUnread} unread</span>}
        </p>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-4" style={{ height: "calc(100vh - 12rem)" }}>
        {/* Conversation List */}
        <CarrierCard padding="p-0" className="flex flex-col overflow-hidden">
          <div className="p-3.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[13px] font-bold text-[#0D1B2A]">Conversations</span>
            <button
              onClick={() => setShowNewMsg(!showNewMsg)}
              className="w-7 h-7 rounded-md bg-[#C9A84C]/10 text-[#C9A84C] flex items-center justify-center hover:bg-[#C9A84C]/20"
            >
              <Plus size={14} />
            </button>
          </div>

          {showNewMsg && (
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-xs focus:border-[#C9A84C] focus:outline-none"
                />
              </div>
              {searchResults && searchResults.length > 0 && (
                <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => selectConversation(u.id, `${u.firstName} ${u.lastName}`)}
                      className="w-full text-left p-2 rounded-md hover:bg-gray-50 text-xs"
                    >
                      <div className="font-semibold text-[#0D1B2A]">{u.firstName} {u.lastName}</div>
                      <div className="text-gray-400">{u.email}</div>
                      <div className="text-gray-400">{u.company || u.role}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {conversations?.map((conv) => (
              <button
                key={conv.partner.id}
                onClick={() => selectConversation(conv.partner.id, `${conv.partner.firstName} ${conv.partner.lastName}`)}
                className={`w-full text-left px-4 py-3.5 border-b border-gray-100 transition ${
                  selectedUserId === conv.partner.id ? "bg-[#C9A84C]/[0.06]" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] text-[#0D1B2A] truncate ${conv.unreadCount > 0 ? "font-bold" : "font-medium"}`}>
                      {conv.partner.firstName} {conv.partner.lastName}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">{conv.partner.company || conv.partner.role}</div>
                    <div className="text-xs text-gray-500 truncate mt-1">{conv.lastMessage}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-[10px] text-gray-400">{new Date(conv.lastMessageAt).toLocaleDateString()}</div>
                    {conv.unreadCount > 0 && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 bg-[#C9A84C] text-white text-[9px] font-bold rounded-full">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {(!conversations || conversations.length === 0) && !showNewMsg && (
              <div className="p-8 text-center">
                <MessageSquare size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No conversations yet</p>
              </div>
            )}
          </div>
        </CarrierCard>

        {/* Message Thread */}
        <CarrierCard padding="p-0" className="flex flex-col overflow-hidden">
          {selectedUserId ? (
            <>
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0D1B2A] to-[#1B2D45] flex items-center justify-center text-[11px] font-bold text-[#C9A84C]">
                  {selectedUserName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <span className="text-sm font-semibold text-[#0D1B2A]">{selectedUserName}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {messages?.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed ${
                      msg.senderId === user?.id
                        ? "bg-[#0D1B2A] text-white rounded-br-md"
                        : "bg-gray-100 text-gray-700 rounded-bl-md"
                    }`}>
                      {msg.content}
                      <div className={`text-[10px] mt-1 text-right ${
                        msg.senderId === user?.id ? "text-gray-400" : "text-gray-400"
                      }`}>
                        {msg.sender.firstName} — {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))}
                {(!messages || messages.length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-8">Start a conversation</p>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && newMessage.trim() && sendMsg.mutate()}
                  placeholder="Type a message..."
                  className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-[#C9A84C]"
                />
                <button
                  onClick={() => newMessage.trim() && sendMsg.mutate()}
                  disabled={!newMessage.trim() || sendMsg.isPending}
                  className="px-4 py-2.5 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-white text-sm rounded-lg disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              <div className="text-center">
                <MessageSquare size={36} className="mx-auto mb-3 text-gray-300" />
                Select a conversation or start a new one
              </div>
            </div>
          )}
        </CarrierCard>
      </div>
    </div>
  );
}
