"use client";

import { Input } from "@/components/ui/input";

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MoneyInput({ value, onChange, placeholder = "0.00", className }: MoneyInputProps) {
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`text-right font-mono tabular-nums ${className || ""}`}
    />
  );
}
