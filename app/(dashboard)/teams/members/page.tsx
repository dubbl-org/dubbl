"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, MotionConfig } from "motion/react";
import { Users, Search, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface MemberTeam {
  id: string;
  name: string;
  color: string | null;
}

interface Member {
  id: string;
  name: string;
  email: string;
  teams?: MemberTeam[];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TeamMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  useDocumentTitle("Teams · Members");

  const fetchMembers = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/members", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const raw = data.members || data.data || [];
        setMembers(raw.map((m: { id: string; userName?: string; userEmail?: string; name?: string; email?: string; teams?: MemberTeam[] }) => ({
          id: m.id,
          name: m.userName || m.name || "",
          email: m.userEmail || m.email || "",
          teams: m.teams || [],
        })));
      })
      .finally(() => {
        setLoading(false);
        setFetchKey((k) => k + 1);
      });
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Re-animate on search changes
  useEffect(() => {
    if (!loading) setFetchKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filtered = members.filter((m) => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const nameMatch = m.name.toLowerCase().includes(q);
      const emailMatch = m.email.toLowerCase().includes(q);
      if (!nameMatch && !emailMatch) return false;
    }
    return true;
  });

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Members"
        description="All organization members and their team assignments."
      />

      {/* Search */}
      <div className="flex flex-col gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8 h-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Members list */}
      {pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <ContentReveal key={fetchKey}>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {members.length === 0 ? "No members yet" : "No members found"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term" : "No organization members to display."}
            </p>
          </div>
        </ContentReveal>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={fetchKey}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
          >
            <div className="rounded-xl border bg-card divide-y">
              {filtered.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {member.teams && member.teams.length > 0 ? (
                      member.teams.map((team) => (
                        <Badge
                          key={team.id}
                          variant="outline"
                          className="text-[11px] gap-1"
                        >
                          <span
                            className="size-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: team.color || "#6b7280" }}
                          />
                          {team.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No teams</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </MotionConfig>
      )}
    </ContentReveal>
  );
}
