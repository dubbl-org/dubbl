"use client";

import { DRAG_MIME, getDrag, setDrag, setDropTarget, type DragPayload } from "./store";
import { filesFromDrop, hasOsFiles, type PickedFile } from "./uploads";

interface DropOptions {
  /** Whether dubbl items being dragged may land here. */
  canDrop?: (p: DragPayload) => boolean;
  onItems?: (p: DragPayload) => void;
  /** Files dragged in from the computer. */
  onFiles?: (files: PickedFile[]) => void;
  /** Hovering a while, e.g. to open a collapsed folder. */
  onLinger?: () => void;
}

let linger: ReturnType<typeof setTimeout> | null = null;
const stopLinger = () => {
  if (linger) clearTimeout(linger);
  linger = null;
};

/** Handlers that turn an element into a drop target named `key`. */
export function dropTarget(key: string, opts: DropOptions) {
  const accepts = (e: React.DragEvent) => {
    const drag = getDrag();
    if (drag) return !!opts.onItems && (opts.canDrop?.(drag) ?? true);
    return !!opts.onFiles && hasOsFiles(e);
  };
  return {
    onDragEnter: (e: React.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(key);
      stopLinger();
      if (opts.onLinger) linger = setTimeout(opts.onLinger, 650);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = getDrag() ? "move" : "copy";
      setDropTarget(key);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      stopLinger();
      setDropTarget(null);
    },
    onDrop: async (e: React.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      stopLinger();
      setDropTarget(null);
      const drag = getDrag();
      if (drag) {
        setDrag(null);
        opts.onItems?.(drag);
      } else if (opts.onFiles) {
        opts.onFiles(await filesFromDrop(e.dataTransfer));
      }
    },
  };
}

/** Start dragging dubbl items, with a small stack as the drag image. */
export function startDrag(e: React.DragEvent, payload: DragPayload) {
  setDrag(payload);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ files: payload.files.map((f) => f.id), folders: payload.folders.map((f) => f.id) }));
  const count = payload.files.length + payload.folders.length;
  const label = count === 1 ? (payload.files[0]?.fileName ?? payload.folders[0]?.name ?? "1 item") : `${count} items`;
  const ghost = document.createElement("div");
  ghost.textContent = label;
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    padding: "6px 10px",
    maxWidth: "240px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderRadius: "8px",
    font: "500 12.5px/1.3 var(--font-sans, system-ui)",
    color: "white",
    background: "rgba(20,20,20,0.92)",
    boxShadow: count > 1 ? "4px 4px 0 -1px rgba(20,20,20,0.35), 0 6px 16px rgba(0,0,0,0.2)" : "0 6px 16px rgba(0,0,0,0.2)",
  });
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 14, 14);
  setTimeout(() => ghost.remove(), 0);
}

export const endDrag = () => {
  stopLinger();
  setDrag(null);
};
