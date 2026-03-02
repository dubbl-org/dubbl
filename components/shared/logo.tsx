import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-10", className)}
    >
      {/* Right "d" — behind, lighter */}
      <path
        d="M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z"
        fill="#34d399"
      />
      {/* Left "d" — in front, darker */}
      <path
        d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z"
        fill="#059669"
      />
    </svg>
  );
}
