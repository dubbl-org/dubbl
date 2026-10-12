"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Paperclip, Square, Upload as UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPT, useAssistant, type Chat } from "./assistant-context";
import { UploadChip } from "./transcript";
import { pulseTilly } from "./tilly-mark";

/** The message box: grows with the text, takes files by button, paste or drop, and stops a run. */
export function Composer({
  chat,
  size = "panel",
  placeholder,
  autoFocus,
  footer,
}: {
  chat: Chat;
  size?: "panel" | "page";
  placeholder?: string;
  autoFocus?: boolean;
  footer?: ReactNode;
}) {
  const { send, stop, setDraft, addFiles, removeUpload } = useAssistant();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const page = size === "page";
  const max = page ? 220 : 160;

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  };

  useEffect(() => {
    grow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.draft, chat.key]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, chat.key]);

  const uploading = chat.uploads.some((u) => u.status === "uploading");
  const ready = chat.uploads.some((u) => u.status === "ready");
  const canSend = !chat.busy && !uploading && (chat.draft.trim().length > 0 || ready);

  const submit = () => {
    if (!canSend) return;
    send(chat.key, chat.draft);
  };

  return (
    <div>
      <div
        className={cn(
          "rounded-2xl border border-border bg-background transition-[border-color,box-shadow] focus-within:border-tilly-400 focus-within:ring-[3px] focus-within:ring-tilly-100 dark:focus-within:ring-tilly-700/30",
          page && "shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]"
        )}
      >
        <AnimatePresence initial={false}>
          {chat.uploads.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
                <AnimatePresence initial={false}>
                  {chat.uploads.map((u) => (
                    <UploadChip key={u.localId} upload={u} onRemove={() => removeUpload(chat.key, u.localId)} />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className={cn("flex items-end gap-1.5", page ? "px-3 py-2.5" : "px-2 py-2")}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach files"
            title="Attach receipts, bills, statements or spreadsheets"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <Paperclip className="size-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(chat.key, e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            ref={ref}
            rows={1}
            value={chat.draft}
            onChange={(e) => {
              setDraft(chat.key, e.target.value);
              pulseTilly();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                addFiles(chat.key, files);
              }
            }}
            placeholder={
              placeholder ??
              (chat.pending ? "Reply, or approve the action above" : chat.uploads.length ? "Add a note, or just send" : "Ask anything, or drop a receipt…")
            }
            style={{ maxHeight: max }}
            className={cn(
              "min-h-8 flex-1 resize-none bg-transparent py-1 outline-none placeholder:text-muted-foreground/70",
              page ? "text-[15px] leading-6" : "text-[13.5px] leading-6"
            )}
          />
          {chat.busy ? (
            <button
              type="button"
              onClick={() => stop(chat.key)}
              aria-label="Stop"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-transform active:scale-90"
            >
              <Square className="size-3" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tilly-600 text-white transition-[background-color,transform,opacity] hover:bg-tilly-700 active:scale-90 disabled:opacity-35"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
      {footer}
    </div>
  );
}

/**
 * Catches files dragged anywhere over its area and shows a warm drop target.
 * Only reacts to files, so dragging text or tabs around is left alone.
 */
export function DropZone({
  onFiles,
  children,
  className,
  label = "Drop files for Tilly to read",
  hint = "Receipts, bills, invoices, statements · PDF, images or CSV",
}: {
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
  label?: string;
  hint?: string;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      {children}
      <AnimatePresence>
        {over && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-tilly-400 bg-tilly-50/90 text-center backdrop-blur-[2px] dark:bg-tilly-700/20"
          >
            <motion.span
              initial={{ y: 6, scale: 0.9 }}
              animate={{ y: [0, -5, 0], scale: 1 }}
              transition={{ y: { repeat: Infinity, duration: 1.2, ease: "easeInOut" } }}
              className="flex size-11 items-center justify-center rounded-2xl bg-tilly-600 text-white shadow-[0_10px_24px_-8px_rgba(194,78,44,0.6)]"
            >
              <UploadIcon className="size-5" />
            </motion.span>
            <p className="mt-3 text-[14px] font-semibold text-tilly-700 dark:text-tilly-400">{label}</p>
            <p className="mt-1 text-[12px] text-tilly-700/70 dark:text-tilly-400/70">{hint}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
