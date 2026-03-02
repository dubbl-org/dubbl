"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FileUploaderProps {
  onUpload: (fileKey: string, fileName: string) => void;
  accept?: string;
  className?: string;
}

export function FileUploader({
  onUpload,
  accept = "image/*,.pdf",
  className,
}: FileUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setFileName(file.name);
      const orgId = localStorage.getItem("activeOrgId");
      if (!orgId) {
        toast.error("No organization selected");
        setUploading(false);
        return;
      }

      try {
        // Get presigned URL
        const presignRes = await fetch("/api/v1/attachments/presign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            fileSize: file.size,
          }),
        });

        if (!presignRes.ok) {
          throw new Error("Failed to get upload URL");
        }

        const { uploadUrl, attachment } = await presignRes.json();

        // Upload to S3
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload file");
        }

        onUpload(attachment.fileKey, file.name);
        toast.success("File uploaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        setFileName(null);
      } finally {
        setUploading(false);
      }
    },
    [onUpload]
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  function handleClear() {
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
        dragging
          ? "border-emerald-500 bg-emerald-50"
          : "border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50",
        uploading && "pointer-events-none opacity-60",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />

      {uploading ? (
        <>
          <Loader2 className="size-6 animate-spin text-emerald-600" />
          <p className="mt-2 text-xs text-muted-foreground">Uploading...</p>
        </>
      ) : fileName ? (
        <>
          <FileText className="size-6 text-emerald-600" />
          <p className="mt-2 max-w-full truncate text-xs font-medium">
            {fileName}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-3" />
          </button>
        </>
      ) : (
        <>
          <Upload className="size-6 text-muted-foreground" />
          <p className="mt-2 text-xs text-muted-foreground">
            Drop a file or click to upload
          </p>
        </>
      )}
    </div>
  );
}
