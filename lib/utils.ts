import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Safely extract a human-readable error message from any value */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (Array.isArray(err)) return err.map((e) => (typeof e === "object" && e?.message ? e.message : String(e))).join(", ");
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    if (Array.isArray(obj.error)) return getErrorMessage(obj.error, fallback);
  }
  return fallback;
}
