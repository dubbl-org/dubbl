"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, X } from "lucide-react";

export default function McpAuthorizePage() {
  return (
    <Suspense>
      <McpAuthorizeContent />
    </Suspense>
  );
}

interface OrgOption {
  id: string;
  name: string;
}

function McpAuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientName = searchParams.get("client_name") || "MCP Client";
  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const codeChallenge = searchParams.get("code_challenge") || "";
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";
  const state = searchParams.get("state") || "";
  const scope = searchParams.get("scope") || "mcp";

  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/organization")
      .then((res) => res.json())
      .then((data) => {
        const orgs = data.organizations || [];
        setOrganizations(orgs);
        if (orgs.length === 1) {
          setSelectedOrg(orgs[0].id);
        }
      })
      .catch(() => setError("Failed to load organizations"));
  }, []);

  async function handleApprove() {
    if (!selectedOrg) {
      setError("Please select an organization");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/mcp/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          state,
          scope,
          organization_id: selectedOrg,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Authorization failed");
      }

      const data = await res.json();
      router.push(data.redirect_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed");
      setLoading(false);
    }
  }

  function handleDeny() {
    const params = new URLSearchParams({
      error: "access_denied",
      error_description: "User denied the request",
      state,
    });
    router.push(`${redirectUri}?${params.toString()}`);
  }

  return (
    <div>
      <motion.div
        className="mb-7"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
          <Shield className="size-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-[28px] font-extrabold tracking-tight text-foreground">
          Authorize MCP Access
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{clientName}</span>{" "}
          wants to access your dubbl data via MCP
        </p>
      </motion.div>

      <motion.div
        className="space-y-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            This application will be able to:
          </p>
          <ul className="space-y-1.5 text-sm">
            <li>Read and manage your chart of accounts</li>
            <li>Create and manage journal entries</li>
            <li>Read and manage contacts, invoices, and bills</li>
            <li>Generate financial reports</li>
          </ul>
        </div>

        {organizations.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-medium">Select Organization</label>
            <Select value={selectedOrg} onValueChange={setSelectedOrg}>
              <SelectTrigger className="h-11 rounded-lg">
                <SelectValue placeholder="Choose an organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {organizations.length === 1 && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            Organization:{" "}
            <span className="font-medium">{organizations[0].name}</span>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-lg"
            onClick={handleDeny}
            disabled={loading}
          >
            <X className="mr-1.5 size-4" />
            Deny
          </Button>
          <Button
            className="h-11 flex-1 rounded-lg bg-emerald-600 shadow-md shadow-emerald-600/15 transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-600/20 active:scale-[0.98]"
            onClick={handleApprove}
            disabled={loading || !selectedOrg}
          >
            {loading ? "Authorizing..." : "Authorize"}
          </Button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60">
          OAuth 2.1 with PKCE &middot; Pro/Business plan required
        </p>
      </motion.div>
    </div>
  );
}
