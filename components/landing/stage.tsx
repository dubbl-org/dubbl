"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders a product mockup at its true design size and scales it to fit the
 * available width, so it stays a pixel-faithful 1:1 of the app at any screen
 * size. Fades in once measured to avoid a flash at the wrong scale.
 */
export function ScaledStage({
  width,
  height,
  label,
  minScale = 0,
  crop = 0,
  anchor = "left",
  children,
  className,
}: {
  width: number;
  height: number;
  /** What the mockup shows, for screen readers (the mockup itself is hidden). */
  label: string;
  /** Never shrink below this; narrower screens see the design bleed off the right. */
  minScale?: number;
  /** Design pixels to cut off the bottom, so the window reads as continuing. */
  crop?: number;
  /** Which edge stays in view when the design bleeds past a narrow screen. */
  anchor?: "left" | "right";
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [box, setBox] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setBox(entry.contentRect.width);
      setScale(Math.max(minScale, Math.min(1, entry.contentRect.width / width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, minScale]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cn("relative w-full overflow-hidden", className)}
      style={scale === null ? { aspectRatio: `${width} / ${height - crop}`, maxWidth: width } : { height: (height - crop) * scale, maxWidth: width }}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-0 origin-top-left select-none transition-opacity duration-500",
          scale === null && "opacity-0"
        )}
        style={{
          width,
          height,
          transform: `translateX(${anchor === "right" && scale !== null ? Math.min(0, box - width * scale) : 0}px) scale(${scale ?? 1})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Runs the looping demos inside only while they're on screen. */
export function Live({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} data-live={live ? "" : undefined} className={className}>
      {children}
    </div>
  );
}

/**
 * Like ScaledStage, but for a fixed-size panel: scales the design down until
 * it fits both ways (never past `minScale`, so on small screens it bleeds off
 * the right edge instead of shrinking to unreadable).
 */
export function FitStage({
  width,
  height,
  minScale = 0.6,
  children,
  className,
}: {
  width: number;
  height: number;
  minScale?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setScale(Math.max(minScale, Math.min(1, w / width, h / height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height, minScale]);

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 select-none", className)}>
      <div
        className={cn("absolute left-0 top-0 origin-top-left transition-opacity duration-500", scale === null && "opacity-0")}
        style={{ width, height, transform: `scale(${scale ?? 1})` }}
      >
        {children}
      </div>
    </div>
  );
}

