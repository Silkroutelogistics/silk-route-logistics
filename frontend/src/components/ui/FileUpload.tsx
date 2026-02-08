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
      <FileText className="w-5 h-5 text-red-500" />
    ) : (
      <Image className="w-5 h-5 text-blue-500" />
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
          dragOver ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
        )}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-700">
          Drop files here or click to browse
        </p>
        <p className="text-xs text-slate-400 mt-1">
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <FileIcon type={file.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={() => remove(i)} className="p-1 hover:bg-slate-200 rounded transition">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
