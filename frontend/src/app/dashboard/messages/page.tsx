"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { cn } from "@/lib/utils";

interface Message {
  id: string; senderId: string; receiverId: string; content: string;
  createdAt: string; readAt: string | null;
  sender: { id: string; firstName: string; lastName: string };
}

export default function MessagesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");

  // Get all messages to build conversation list
  const { data: allMessages } = useQuery({
    queryKey: ["all-messages"],
    queryFn: async () => {
      // Fetch conversations with known users from notifications/messages
      const res = await api.get<Message[]>("/messages?conversationWith=" + (selectedUser || ""));
      return res.data;
    },
    enabled: !!selectedUser,
    refetchInterval: 10000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then((r) => r.data),
  });

  // Extract unique conversation partners from notifications
  const conversationPartners = notifications
    ? [...new Set(notifications
        .filter((n: { type: string }) => n.type === "TENDER" || n.type === "PAYMENT")
        .map(() => "broker")
      )]
    : [];

  const sendMsg = useMutation({
    mutationFn: () => api.post("/messages", { receiverId: selectedUser, content: newMessage }),
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation List */}
      <div className="w-72 bg-white rounded-xl border flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversationPartners.length === 0 && (
            <p className="text-sm text-slate-400 p-3 text-center">No conversations yet. Messages will appear here when you interact with brokers.</p>
          )}
          {/* Placeholder conversation items */}
          {["broker@example.com"].map((email) => (
            <button key={email} onClick={() => setSelectedUser(email)}
              className={cn(
                "w-full text-left p-3 rounded-lg text-sm transition",
                selectedUser === email ? "bg-gold/10 text-navy" : "hover:bg-slate-50 text-slate-600"
              )}>
              <p className="font-medium">Jane Mitchell</p>
              <p className="text-xs text-slate-400 truncate">Fast Freight Brokerage</p>
            </button>
          ))}
        </div>
      </div>

      {/* Message Thread */}
      <div className="flex-1 bg-white rounded-xl border flex flex-col">
        {selectedUser ? (
          <>
            <div className="p-4 border-b">
              <p className="font-semibold">Conversation</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {allMessages?.map((msg: Message) => (
                <div key={msg.id} className={cn("max-w-[75%]", msg.senderId === user?.id ? "ml-auto" : "mr-auto")}>
                  <div className={cn(
                    "p-3 rounded-2xl text-sm",
                    msg.senderId === user?.id ? "bg-gold/10 text-navy rounded-br-md" : "bg-slate-100 rounded-bl-md"
                  )}>
                    {msg.content}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
              {(!allMessages || allMessages.length === 0) && (
                <p className="text-sm text-slate-400 text-center py-8">Start a conversation</p>
              )}
            </div>
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && newMessage.trim() && sendMsg.mutate()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                <button onClick={() => newMessage.trim() && sendMsg.mutate()}
                  disabled={!newMessage.trim() || sendMsg.isPending}
                  className="p-2 bg-gold text-navy rounded-lg hover:bg-gold-light disabled:opacity-50 transition">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Select a conversation to start messaging
          </div>
        )}
      </div>
    </div>
  );
}
