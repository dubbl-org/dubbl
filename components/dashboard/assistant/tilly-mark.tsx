"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type TillyState = "idle" | "thinking" | "attention" | "happy" | "muted";

/* ------------------------------------------------------------------ */
/*  Pulses: a typed character, a new message. Every mark gives a boop. */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

export function pulseTilly() {
  for (const fn of listeners) fn();
}

/* ------------------------------------------------------------------ */
/*  The shine leans toward the pointer, shared by every mark that asks */
/* ------------------------------------------------------------------ */

const followers = new Set<HTMLElement>();
let pointer: { x: number; y: number } | null = null;
let frame = 0;

function paint() {
  frame = 0;
  if (!pointer) return;
  for (const el of followers) {
    const r = el.getBoundingClientRect();
    const dx = pointer.x - (r.left + r.width / 2);
    const dy = pointer.y - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    // Lean up to 14% toward the pointer, easing off with distance.
    const lean = Math.min(1, 180 / dist) * 0.14 + 0.06;
    el.style.setProperty("--tilly-sx", `${32 + (dx / dist) * lean * 100}%`);
    el.style.setProperty("--tilly-sy", `${28 + (dy / dist) * lean * 100}%`);
  }
}

function onPointerMove(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY };
  if (!frame) frame = requestAnimationFrame(paint);
}

function follow(el: HTMLElement) {
  if (followers.size === 0) window.addEventListener("pointermove", onPointerMove, { passive: true });
  followers.add(el);
  return () => {
    followers.delete(el);
    if (followers.size === 0) window.removeEventListener("pointermove", onPointerMove);
  };
}

/**
 * Tilly: a warm apricot blob that slowly changes shape, swirls faster while
 * thinking, hops when it needs you, glows green after a job well done and
 * wobbles when poked.
 */
export function TillyMark({
  size = 20,
  state = "idle",
  follow: followPointer = false,
  reactive = false,
  className,
  style,
}: {
  size?: number;
  state?: TillyState;
  /** Let the highlight lean toward the pointer. */
  follow?: boolean;
  /** Boop on every pulseTilly(), jelly on hover. */
  reactive?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !followPointer) return;
    return follow(el);
  }, [followPointer]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !reactive) return;
    const boop = () => {
      el.classList.remove("tilly-boop");
      // Restart the animation on every pulse
      void el.offsetWidth;
      el.classList.add("tilly-boop");
    };
    listeners.add(boop);
    return () => {
      listeners.delete(boop);
    };
  }, [reactive]);

  return (
    <span
      ref={ref}
      aria-hidden
      data-state={state}
      onPointerEnter={
        reactive
          ? (e) => {
              const el = e.currentTarget;
              el.classList.remove("tilly-jelly");
              void el.offsetWidth;
              el.classList.add("tilly-jelly");
            }
          : undefined
      }
      onAnimationEnd={(e) => {
        if (e.animationName === "tilly-jelly" || e.animationName === "tilly-boop-k") {
          e.currentTarget.classList.remove("tilly-jelly", "tilly-boop");
        }
      }}
      className={cn("tilly-mark", className)}
      style={{ width: size, height: size, ...style }}
    >
      <span className="tilly-body" />
    </span>
  );
}

/** A 3×3 grid of warm pixels chasing each other: the inline "working" loader. */
export function TillySpark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("tilly-spark", className)}>
      {[0, 1, 2, 5, 8, 7, 6, 3, 4].map((cell, i) => (
        <span key={cell} style={{ gridArea: `${Math.floor(cell / 3) + 1} / ${(cell % 3) + 1}`, animationDelay: `${i * 0.09}s` }} />
      ))}
    </span>
  );
}
