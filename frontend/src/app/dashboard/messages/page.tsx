"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Search, Plus, MessageSquare, User } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";

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

export default function MessagesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<Conversation[]>("/messages/conversations").then((r) => r.data),
    refetchInterval: 15000,
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", selectedUserId],
    queryFn: () => api.get<Message[]>(`/messages?conversationWith=${selectedUserId}`).then((r) => r.data),
    enabled: !!selectedUserId,
    refetchInterval: 5000,
  });

  const { data: searchResults } = useQuery({
    queryKey: ["user-search", userSearch],
    queryFn: () => api.get<UserResult[]>(`/messages/users?search=${userSearch}`).then((r) => r.data),
    enabled: showNewMsg && userSearch.length > 1,
  });

  const sendMsg = useMutation({
    mutationFn: () => api.post("/messages", { receiverId: selectedUserId, content: newMessage }),
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["messages", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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

  const initials = (first: string, last: string) => `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 p-6">
      {/* Conversation List */}
      <div className="w-96 bg-[#0c1829] rounded-l-xl border border-[#1a2d47] flex flex-col">
        <div className="p-4 border-b border-[#1a2d47] flex items-center justify-between">
          <h2 className="font-semibold text-white text-base">Messages</h2>
          <button onClick={() => setShowNewMsg(true)} className="p-2 bg-[#C9A84C] text-[#0c1829] rounded-lg hover:bg-[#d4b85e] transition">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNewMsg && (
          <div className="p-3 border-b border-[#1a2d47]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..."
                className="w-full pl-9 pr-3 py-2 bg-[#0f1f35] border border-[#1a2d47] rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#C9A84C]/50" />
            </div>
            {searchResults && searchResults.length > 0 && (
              <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                {searchResults.map((u) => (
                  <button key={u.id} onClick={() => selectConversation(u.id, `${u.firstName} ${u.lastName}`)}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-[#162a43] text-sm transition">
                    <p className="text-white font-medium">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {conversations?.map((conv) => (
            <button key={conv.partner.id}
              onClick={() => selectConversation(conv.partner.id, `${conv.partner.firstName} ${conv.partner.lastName}`)}
              className={`w-full text-left px-4 py-3.5 text-sm transition border-b border-[#1a2d47]/50 ${selectedUserId === conv.partner.id ? "bg-[#162a43]" : "hover:bg-[#0f1f35]"}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#1a2d47] flex items-center justify-center text-xs font-bold text-[#C9A84C] shrink-0 mt-0.5">
                  {initials(conv.partner.firstName, conv.partner.lastName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium truncate">{conv.partner.firstName} {conv.partner.lastName}</p>
                    <p className="text-[10px] text-slate-500 shrink-0 ml-2">{new Date(conv.lastMessageAt).toLocaleDateString()}</p>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{conv.partner.company || conv.partner.role}</p>
                  {conv.partner.email && <p className="text-[10px] text-slate-600 truncate">{conv.partner.email}</p>}
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-slate-400 truncate">{conv.lastMessage}</p>
                    {conv.unreadCount > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-[#C9A84C] text-[#0c1829] text-[10px] font-bold rounded-full shrink-0">{conv.unreadCount}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {(!conversations || conversations.length === 0) && !showNewMsg && (
            <div className="p-8 text-center">
              <MessageSquare className="w-10 h-10 text-[#1a2d47] mx-auto mb-3" />
              <p className="text-sm text-slate-500">No conversations yet</p>
              <p className="text-xs text-slate-600 mt-1">Click + to start a new message</p>
            </div>
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div className="flex-1 bg-[#0f1f35] rounded-r-xl border border-[#1a2d47] border-l-0 flex flex-col">
        {selectedUserId ? (
          <>
            {/* Thread Header */}
            <div className="px-6 py-4 border-b border-[#1a2d47] flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1a2d47] flex items-center justify-center text-sm font-bold text-[#C9A84C]">
                {initials(selectedUserName.split(" ")[0], selectedUserName.split(" ")[1] || "")}
              </div>
              <div>
                <p className="font-semibold text-white">{selectedUserName}</p>
                <p className="text-xs text-slate-500">
                  {conversations?.find((c) => c.partner.id === selectedUserId)?.partner.email || ""}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages?.map((msg) => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] ${isMe ? "order-2" : "order-1"}`}>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? "bg-[#C9A84C] text-[#0c1829] rounded-br-md"
                          : "bg-[#162a43] text-slate-200 rounded-bl-md"
                      }`}>
                        {msg.content}
                      </div>
                      <p className={`text-[10px] text-slate-500 mt-1 px-1 ${isMe ? "text-right" : "text-left"}`}>
                        {msg.sender.firstName} — {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              {(!messages || messages.length === 0) && (
                <div className="flex-1 flex items-center justify-center py-16">
                  <div className="text-center">
                    <MessageSquare className="w-8 h-8 text-[#1a2d47] mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Start a conversation</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="px-6 py-4 border-t border-[#1a2d47]">
              <div className="flex gap-3">
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && newMessage.trim() && sendMsg.mutate()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 bg-[#0c1829] border border-[#1a2d47] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#C9A84C]/50 focus:ring-1 focus:ring-[#C9A84C]/20" />
                <button onClick={() => newMessage.trim() && sendMsg.mutate()} disabled={!newMessage.trim() || sendMsg.isPending}
                  className="px-4 py-2.5 bg-[#C9A84C] text-[#0c1829] rounded-xl hover:bg-[#d4b85e] disabled:opacity-50 transition font-medium">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#1a2d47] flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-7 h-7 text-[#C9A84C]" />
              </div>
              <p className="text-white font-medium">Select a conversation</p>
              <p className="text-sm text-slate-500 mt-1">or click + to start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
