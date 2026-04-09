"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id: externalId, ...props }: InputProps) {
  const autoId = useId();
  const inputId = externalId || autoId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div>
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-white/70 mb-1">{label}</label>}
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30",
          "focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none transition",
          error && "border-red-500/50",
          className
        )}
        {...props}
      />
      {error && <p id={errorId} className="text-xs text-red-400 mt-1" role="alert">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
}

export function Select({ label, options, error, className, id: externalId, ...props }: SelectProps) {
  const autoId = useId();
  const selectId = externalId || autoId;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div>
      {label && <label htmlFor={selectId} className="block text-sm font-medium text-white/70 mb-1">{label}</label>}
      <select
        id={selectId}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white",
          "focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none transition",
          "[&>option]:bg-navy [&>option]:text-white",
          error && "border-red-500/50",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p id={errorId} className="text-xs text-red-400 mt-1" role="alert">{error}</p>}
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextArea({ label, error, className, id: externalId, ...props }: TextAreaProps) {
  const autoId = useId();
  const textareaId = externalId || autoId;
  const errorId = error ? `${textareaId}-error` : undefined;

  return (
    <div>
      {label && <label htmlFor={textareaId} className="block text-sm font-medium text-white/70 mb-1">{label}</label>}
      <textarea
        id={textareaId}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={cn(
          "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30",
          "focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none transition resize-none",
          error && "border-red-500/50",
          className
        )}
        {...props}
      />
      {error && <p id={errorId} className="text-xs text-red-400 mt-1" role="alert">{error}</p>}
    </div>
  );
}
