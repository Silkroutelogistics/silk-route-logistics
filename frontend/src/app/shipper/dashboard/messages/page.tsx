"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ArrowRight, Loader2, MessageSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard } from "@/components/shipper";

interface Conversation {
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
  read: boolean;
}

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

export default function ShipperMessagesPage() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const { data: conversations = [], isLoading: convoLoading } = useQuery({
    queryKey: ["shipper-conversations"],
    queryFn: () => api.get<Conversation[]>("/messages/conversations").then((r) => r.data),
  });

  // Search users
  const { data: searchResults = [] } = useQuery({
    queryKey: ["shipper-user-search", searchQuery],
    queryFn: () => api.get<UserSearchResult[]>("/messages/users", { params: { search: searchQuery } }).then((r) => r.data),
    enabled: searchQuery.length >= 2,
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["shipper-messages", selectedUserId],
    queryFn: () => api.get<Message[]>("/messages", { params: { conversationWith: selectedUserId } }).then((r) => r.data),
    enabled: !!selectedUserId,
    refetchInterval: 10000,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post("/messages", { recipientId: selectedUserId, content }),
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["shipper-messages", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["shipper-conversations"] });
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = messageText.trim();
    if (!trimmed || !selectedUserId) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectConversation = (c: Conversation) => {
    setSelectedUserId(c.partnerId);
    setSelectedUserName(c.partnerName);
  };

  const selectSearchUser = (u: UserSearchResult) => {
    setSelectedUserId(u.id);
    setSelectedUserName(u.name);
    setSearchQuery("");
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.max(1, Math.round(diffMs / 60000))}m`;
    if (diffH < 24) return `${Math.round(diffH)}h`;
    return `${Math.round(diffH / 24)}d`;
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  };

  // Determine who "me" is by checking senderId patterns
  const myId = messages.length > 0 && selectedUserId
    ? messages.find((m) => m.senderId !== selectedUserId)?.senderId || ""
    : "";

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0F1117] mb-6">Messages</h1>
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        {/* Contact list */}
        <ShipperCard padding="p-0">
          <div className="p-3.5 border-b border-gray-100 relative">
            <div className="flex items-center gap-2 px-2.5 py-1.5 border border-gray-200 rounded-md">
              <Search size={14} className="text-gray-700" />
              <input
                placeholder="Search users..."
                className="border-none outline-none text-xs w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {/* Search dropdown */}
            {searchQuery.length >= 2 && searchResults.length > 0 && (
              <div className="absolute left-3.5 right-3.5 top-full bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                {searchResults.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => selectSearchUser(u)}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="text-[13px] font-medium text-[#0F1117]">{u.name}</div>
                    <div className="text-[11px] text-gray-700">{u.email}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {convoLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-700" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-gray-700">
              No conversations yet. Search for a user to start messaging.
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.partnerId}
                onClick={() => selectConversation(c)}
                className={`px-4 py-3.5 border-b border-gray-100 cursor-pointer ${
                  selectedUserId === c.partnerId ? "bg-[#C9A84C]/[0.06]" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-between mb-1">
                  <span className={`text-[13px] ${c.unreadCount > 0 ? "font-bold" : "font-medium"} text-[#0F1117]`}>
                    {c.partnerName}
                  </span>
                  <span className="text-[10px] text-gray-700">{formatTime(c.lastMessageAt)}</span>
                </div>
                <div className="text-xs text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">
                  {c.lastMessage}
                </div>
              </div>
            ))
          )}
        </ShipperCard>

        {/* Chat */}
        <ShipperCard padding="p-0" className="flex flex-col">
          {selectedUserId ? (
            <>
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0F1117] to-[#1B2D45] flex items-center justify-center text-[13px] font-bold text-[#BA7517]">
                  {getInitials(selectedUserName)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#0F1117]">{selectedUserName}</div>
                </div>
              </div>
              <div className="flex-1 p-5 min-h-[300px] max-h-[500px] overflow-y-auto">
                {msgsLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={20} className="animate-spin text-gray-700" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-700">
                    No messages yet. Send one to start the conversation.
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.senderId !== selectedUserId ? "justify-end" : "justify-start"} mb-4`}>
                      <div className={`max-w-[70%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed ${
                        m.senderId !== selectedUserId ? "bg-[#0F1117] text-white" : "bg-gray-100 text-gray-700"
                      }`}>
                        {m.content}
                        <div className="text-[10px] text-gray-700 mt-1 text-right">{formatMessageTime(m.createdAt)}</div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                <input
                  placeholder="Type a message..."
                  className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-[#C9A84C]"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sendMutation.isPending}
                />
                <button
                  onClick={handleSend}
                  disabled={sendMutation.isPending || !messageText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0F1117] text-[11px] font-semibold uppercase tracking-[2px] rounded disabled:opacity-50"
                >
                  {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Send
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-700">
              <MessageSquare size={40} className="mb-3 text-gray-500" />
              <div className="text-sm font-medium">Select a conversation</div>
              <div className="text-xs mt-1">Choose a contact or search for a user to start messaging</div>
            </div>
          )}
        </ShipperCard>
      </div>
    </div>
  );
}
