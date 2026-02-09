"use client";

import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-white/70 mb-1">{label}</label>}
      <input
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30",
          "focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none transition",
          className
        )}
        {...props}
      />
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-white/70 mb-1">{label}</label>}
      <select
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white",
          "focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none transition",
          "[&>option]:bg-navy [&>option]:text-white",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextArea({ label, className, ...props }: TextAreaProps) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-white/70 mb-1">{label}</label>}
      <textarea
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30",
          "focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none transition resize-none",
          className
        )}
        {...props}
      />
    </div>
  );
}
