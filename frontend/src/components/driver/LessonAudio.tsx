"use client";

// v3.8.aod (Sprint E3) — SRL Driver Academy lesson audio narration.
//
// Reads the visible lesson aloud using the browser-native Web Speech API
// (SpeechSynthesis) — zero cost, zero storage, no backend. The lesson TEXT
// stays on screen, so the audio is supplemental (not an accessibility
// replacement). Hides itself entirely where SpeechSynthesis is unavailable.
// Re-mounts per slide (the player keys LessonSlide by index), so switching
// lessons cancels any in-flight speech via the unmount cleanup.

import { useEffect, useRef, useState } from "react";
import { Volume2, Pause, Play, Gauge } from "lucide-react";

// Strip the lesson markdown to clean prose for TTS (no asterisks, bullets,
// figure directives, etc. read aloud).
function lessonPlainText(md: string): string {
  return (md || "")
    .replace(/\[\[figure:[^\]]*\]\]/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const SPEEDS = [1, 1.25, 1.5];

export function LessonAudio({ title, bodyMarkdown }: { title: string; bodyMarkdown: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined");
    // Cancel any in-flight speech when the slide unmounts / changes.
    return () => { try { window.speechSynthesis?.cancel(); } catch { /* noop */ } };
  }, []);

  const speak = (r: number) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const text = `${title}. ${lessonPlainText(bodyMarkdown)}`;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = r;
    u.onend = () => { setSpeaking(false); setPaused(false); };
    u.onerror = () => { setSpeaking(false); setPaused(false); };
    synth.speak(u);
    setSpeaking(true);
    setPaused(false);
  };

  const onPlayPause = () => {
    const synth = window.speechSynthesis;
    if (!speaking) { speak(rateRef.current); return; }
    if (paused) { synth.resume(); setPaused(false); }
    else { synth.pause(); setPaused(true); }
  };

  const onCycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    rateRef.current = next;
    // Web Speech can't change rate mid-utterance; restart at the new rate if playing.
    if (speaking) speak(next);
  };

  if (!supported) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button" onClick={onPlayPause}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#C5A572] bg-[#FAEEDA] px-3 py-1.5 text-[12px] font-semibold text-[#BA7517] transition-colors hover:bg-[#F2E0C0]"
        aria-label={!speaking ? "Listen to this lesson" : paused ? "Resume audio" : "Pause audio"}
      >
        {!speaking ? <><Volume2 size={13} /> Listen</>
          : paused ? <><Play size={13} /> Resume</>
            : <><Pause size={13} /> Pause</>}
      </button>
      {speaking && (
        <button
          type="button" onClick={onCycleSpeed}
          className="inline-flex items-center gap-1 rounded-full border border-[#EFE6D3] px-2.5 py-1.5 text-[11px] font-medium text-[#6B7685] transition-colors hover:bg-[#F5EEE0]"
          aria-label="Change playback speed"
        >
          <Gauge size={12} /> {rate}×
        </button>
      )}
    </div>
  );
}
