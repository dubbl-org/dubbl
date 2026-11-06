"use client";

import { useApi } from "@/lib/query/use-api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OrgMember {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
}

/** Pick a deal's owner from the organization's members. value is a user id, "" for unassigned. */
export function OwnerSelect({ value, onChange }: { value: string; onChange: (userId: string) => void }) {
  const { data } = useApi<{ members?: OrgMember[] }>("/api/v1/members");
  const members = data?.members ?? [];
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.userId} value={m.userId}>
            {m.userName || m.userEmail}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
