"use client";

import { useCallback, useState } from "react";
import { Upload, X, FileText, Image } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface FileUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
}

export function FileUpload({ files, onChange, maxFiles = 5 }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (incoming: File[]): File[] => {
      setError(null);
      const valid: File[] = [];
      for (const file of incoming) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError("Only PDF, JPEG, and PNG files are allowed");
          continue;
        }
        if (file.size > MAX_SIZE) {
          setError("Files must be under 10 MB");
          continue;
        }
        valid.push(file);
      }
      const total = files.length + valid.length;
      if (total > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        return valid.slice(0, maxFiles - files.length);
      }
      return valid;
    },
    [files.length, maxFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const valid = validate(Array.from(e.dataTransfer.files));
      if (valid.length) onChange([...files, ...valid]);
    },
    [files, onChange, validate]
  );

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const valid = validate(Array.from(e.target.files));
      if (valid.length) onChange([...files, ...valid]);
      e.target.value = "";
    },
    [files, onChange, validate]
  );

  const remove = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const FileIcon = ({ type }: { type: string }) =>
    type === "application/pdf" ? (
      <FileText className="w-5 h-5 text-red-400" />
    ) : (
      <Image className="w-5 h-5 text-blue-400" />
    );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer",
          dragOver ? "border-gold bg-gold/10" : "border-white/20 hover:border-white/30"
        )}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <Upload className="w-8 h-8 text-white/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-white/70">
          Drop files here or click to browse
        </p>
        <p className="text-xs text-white/40 mt-1">
          PDF, JPEG, PNG up to 10 MB (max {maxFiles} files)
        </p>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleSelect}
          className="hidden"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg">
              <FileIcon type={file.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90 truncate">{file.name}</p>
                <p className="text-xs text-white/40">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={() => remove(i)} className="p-1 hover:bg-white/10 rounded transition">
                <X className="w-4 h-4 text-white/50" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
