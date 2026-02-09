"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Search, Plus, MessageSquare } from "lucide-react";
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

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4 p-6">
      {/* Conversation List */}
      <div className="w-80 bg-white/5 rounded-xl border border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Messages</h2>
          <button onClick={() => setShowNewMsg(true)} className="p-1.5 bg-gold/10 text-gold rounded-lg hover:bg-gold/20">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNewMsg && (
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..."
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            {searchResults && searchResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {searchResults.map((u) => (
                  <button key={u.id} onClick={() => selectConversation(u.id, `${u.firstName} ${u.lastName}`)}
                    className="w-full text-left p-2 rounded-lg hover:bg-white/10 text-sm">
                    <p className="text-white">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                    <p className="text-xs text-slate-600">{u.company || u.role}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations?.map((conv) => (
            <button key={conv.partner.id}
              onClick={() => selectConversation(conv.partner.id, `${conv.partner.firstName} ${conv.partner.lastName}`)}
              className={`w-full text-left p-3 rounded-lg text-sm transition ${selectedUserId === conv.partner.id ? "bg-gold/10" : "hover:bg-white/5"}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{conv.partner.firstName} {conv.partner.lastName}</p>
                  <p className="text-xs text-slate-500 truncate">{conv.partner.company || conv.partner.role}</p>
                  {conv.partner.email && <p className="text-[10px] text-slate-600 truncate">{conv.partner.email}</p>}
                  <p className="text-xs text-slate-400 truncate mt-1">{conv.lastMessage}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-[10px] text-slate-500">{new Date(conv.lastMessageAt).toLocaleDateString()}</p>
                  {conv.unreadCount > 0 && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-gold text-navy text-[10px] font-bold rounded-full">{conv.unreadCount}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
          {(!conversations || conversations.length === 0) && !showNewMsg && (
            <div className="p-4 text-center">
              <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No conversations yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div className="flex-1 bg-white/5 rounded-xl border border-white/10 flex flex-col">
        {selectedUserId ? (
          <>
            <div className="p-4 border-b border-white/10">
              <p className="font-semibold text-white">{selectedUserName}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages?.map((msg) => (
                <div key={msg.id} className={`max-w-[75%] ${msg.senderId === user?.id ? "ml-auto" : "mr-auto"}`}>
                  <div className={`p-3 rounded-2xl text-sm ${msg.senderId === user?.id ? "bg-gold/20 text-white rounded-br-md" : "bg-white/10 text-slate-200 rounded-bl-md"}`}>
                    {msg.content}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 px-1">
                    {msg.sender.firstName} — {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
              {(!messages || messages.length === 0) && <p className="text-sm text-slate-500 text-center py-8">Start a conversation</p>}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && newMessage.trim() && sendMsg.mutate()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
                <button onClick={() => newMessage.trim() && sendMsg.mutate()} disabled={!newMessage.trim() || sendMsg.isPending}
                  className="p-2 bg-gold text-navy rounded-lg hover:bg-gold/90 disabled:opacity-50 transition">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select a conversation or start a new one
          </div>
        )}
      </div>
    </div>
  );
}
