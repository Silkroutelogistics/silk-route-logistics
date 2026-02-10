"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Ship, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MarcoPoloProps {
  isAuthenticated?: boolean;
  apiBase?: string;
  token?: string | null;
  darkMode?: boolean;
}

export function MarcoPolo({ isAuthenticated = false, apiBase, token, darkMode = true }: MarcoPoloProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string>("Claude AI");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const base = apiBase || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: "user", content: msg };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const endpoint = isAuthenticated ? `${base}/chat` : `${base}/chat/public`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isAuthenticated && token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: msg, history: messages }),
      });

      const data = await res.json();
      const reply = data.reply || data.error || "Something went wrong. Please try again.";
      if (data.provider) setProvider(data.provider === "gemini" ? "Gemini AI" : "Claude AI");
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Unable to reach Marco Polo. Please check your connection." }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = isAuthenticated
    ? ["Where are my loads?", "Show my invoices", "How do I tender a load?"]
    : ["What services does SRL offer?", "How do I become a carrier?", "Tell me about your tier system"];

  // Theme classes
  const bg = darkMode ? "bg-[#0f172a]" : "bg-white";
  const border = darkMode ? "border-white/10" : "border-gray-200";
  const headerBg = darkMode ? "bg-[#1e293b]" : "bg-[#0f172a]";
  const inputBg = darkMode ? "bg-white/5 border-white/10 text-white placeholder-slate-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400";
  const userBubble = "bg-[#d4a574] text-[#0f172a]";
  const botBubble = darkMode ? "bg-white/10 text-white" : "bg-gray-100 text-gray-900";
  const textMuted = darkMode ? "text-slate-400" : "text-gray-500";

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#d4a574] text-[#0f172a] shadow-lg shadow-[#d4a574]/20 flex items-center justify-center hover:scale-110 transition-transform cursor-pointer group"
          title="Chat with Marco Polo"
        >
          <Ship className="w-7 h-7" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0f172a]" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className={`fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] ${bg} border ${border} rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
          {/* Header */}
          <div className={`${headerBg} px-4 py-3 flex items-center justify-between shrink-0`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#d4a574]/20 flex items-center justify-center">
                <Ship className="w-5 h-5 text-[#d4a574]" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Marco Polo</h3>
                <p className="text-[#d4a574] text-xs">SRL AI Assistant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-[#d4a574]/10 flex items-center justify-center">
                  <Ship className="w-8 h-8 text-[#d4a574]" />
                </div>
                <div>
                  <p className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>Welcome! I&apos;m Marco Polo</p>
                  <p className={`text-sm ${textMuted} mt-1`}>Your SRL logistics assistant. How can I help?</p>
                </div>
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); }}
                      className={`block w-full text-left text-sm px-3 py-2 rounded-lg border ${border} ${darkMode ? "text-slate-300 hover:bg-white/5" : "text-gray-600 hover:bg-gray-50"} transition`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? `${userBubble} rounded-br-sm` : `${botBubble} rounded-bl-sm`}`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className={`px-3 py-2 rounded-2xl rounded-bl-sm ${botBubble} flex items-center gap-2`}>
                  <Loader2 className="w-4 h-4 animate-spin text-[#d4a574]" />
                  <span className={`text-sm ${textMuted}`}>Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className={`px-3 py-3 border-t ${border} shrink-0`}>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask Marco Polo..."
                className={`flex-1 px-3 py-2 rounded-xl text-sm ${inputBg} border focus:outline-none focus:border-[#d4a574]/50`}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-[#d4a574] text-[#0f172a] flex items-center justify-center hover:bg-[#d4a574]/90 disabled:opacity-40 transition shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className={`text-[10px] ${textMuted} text-center mt-1.5`}>
              Powered by {provider} &bull; Silk Route Logistics
            </p>
          </div>
        </div>
      )}
    </>
  );
}
