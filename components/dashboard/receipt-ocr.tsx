"use client";

import { useState, useRef, useCallback } from "react";
import { ScanLine, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractReceiptData, type ReceiptData } from "@/lib/ocr/extract-receipt";

interface ReceiptOcrProps {
  onExtracted: (data: ReceiptData) => void;
  className?: string;
}

export function ReceiptOcr({ onExtracted, className }: ReceiptOcrProps) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file (JPG, PNG)");
        return;
      }

      setError(null);
      setResult(null);
      setProcessing(true);
      setProgress(0);

      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      try {
        const data = await extractReceiptData(file, setProgress);
        setResult(data);
        onExtracted(data);
      } catch {
        setError("Failed to process receipt. Try a clearer image.");
      } finally {
        setProcessing(false);
      }
    },
    [onExtracted]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      {!preview ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/50 bg-muted/30 p-6 transition-colors hover:border-emerald-500/30 hover:bg-muted/50"
        >
          <ScanLine className="mb-2 size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">Scan Receipt</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Drop an image or click to upload (JPG, PNG)
          </p>
        </div>
      ) : (
        <div className="relative rounded-lg border overflow-hidden">
          <img
            src={preview}
            alt="Receipt"
            className="w-full max-h-48 object-contain bg-muted/20"
          />
          {processing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
              <Loader2 className="size-6 animate-spin text-emerald-600 mb-2" />
              <p className="text-xs font-medium">Processing... {progress}%</p>
              <div className="mt-2 h-1.5 w-32 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          {!processing && (
            <button
              type="button"
              onClick={reset}
              className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Check className="size-3.5 text-emerald-600" />
            Extracted data
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {result.vendor && (
              <div>
                <span className="text-muted-foreground">Vendor:</span>{" "}
                <span className="font-medium">{result.vendor}</span>
              </div>
            )}
            {result.date && (
              <div>
                <span className="text-muted-foreground">Date:</span>{" "}
                <span className="font-medium">{result.date}</span>
              </div>
            )}
            {result.total !== null && (
              <div>
                <span className="text-muted-foreground">Total:</span>{" "}
                <span className="font-medium">
                  ${(result.total / 100).toFixed(2)}
                </span>
              </div>
            )}
            {result.tax !== null && (
              <div>
                <span className="text-muted-foreground">Tax:</span>{" "}
                <span className="font-medium">
                  ${(result.tax / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
