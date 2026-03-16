"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Zap,
  ExternalLink,
  RefreshCw,
  Unplug,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

interface SyncLogEntry {
  id: string;
  eventType: string;
  stripeEventId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BankAccountItem {
  id: string;
  accountName: string;
  bankName: string | null;
}

interface IntegrationItem {
  id: string;
  connected: boolean;
  displayName?: string | null;
  label: string;
  status?: string;
  stripeAccountId?: string;
  livemode?: boolean;
  lastSyncAt?: string;
  initialSyncCompleted?: boolean;
  initialSyncDays?: number;
  errorMessage?: string;
  clearingAccountId?: string;
  revenueAccountId?: string;
  feesAccountId?: string;
  payoutBankAccountId?: string;
  healthy?: boolean;
  healthError?: string | null;
}

function getOrgId() {
  return localStorage.getItem("activeOrgId") || "";
}

function orgHeaders(extra?: Record<string, string>) {
  return { "x-organization-id": getOrgId(), ...extra };
}

export default function StripeIntegrationPage() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountItem[]>([]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/integrations/stripe/status", {
        headers: orgHeaders(),
      });
      const json = await res.json();
      setConnected(json.connected ?? false);
      setIntegrations(json.integrations || []);
    } catch {
      toast.error("Failed to load Stripe integration status");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const [accRes, bankRes] = await Promise.all([
        fetch("/api/v1/accounts", { headers: orgHeaders() }),
        fetch("/api/v1/bank-accounts", { headers: orgHeaders() }),
      ]);
      const accJson = await accRes.json();
      const bankJson = await bankRes.json();
      setAccounts(accJson.data || accJson.accounts || []);
      setBankAccounts(bankJson.data || bankJson.bankAccounts || []);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchAccounts();
  }, [fetchStatus, fetchAccounts]);

  // Check for URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      toast.success("Stripe account connected successfully");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const error = params.get("error");
    if (error) {
      const messages: Record<string, string> = {
        account_already_connected: "This Stripe account is already connected",
        missing_params: "Missing OAuth parameters",
        invalid_state: "Invalid OAuth state",
        oauth_failed: "OAuth authorization failed",
        server_error: "An unexpected error occurred",
      };
      toast.error(messages[error] || `Connection failed: ${error}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/v1/integrations/stripe/connect", {
        headers: orgHeaders(),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        toast.error(json.error || "Failed to initiate connection");
        setConnecting(false);
      }
    } catch {
      toast.error("Failed to initiate Stripe connection");
      setConnecting(false);
    }
  }

  async function handleSync(integrationId: string) {
    setSyncingId(integrationId);
    try {
      const res = await fetch("/api/v1/integrations/stripe/sync", {
        method: "POST",
        headers: orgHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ integrationId }),
      });
      if (res.ok) {
        toast.success("Sync started");
        setTimeout(fetchStatus, 3000);
      } else {
        toast.error("Failed to start sync");
      }
    } catch {
      toast.error("Failed to start sync");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDisconnect(integrationId: string) {
    if (!confirm("Are you sure you want to disconnect this Stripe account? This will stop syncing new transactions.")) return;
    setDisconnectingId(integrationId);
    try {
      const res = await fetch("/api/v1/integrations/stripe/disconnect", {
        method: "POST",
        headers: orgHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ integrationId }),
      });
      if (res.ok) {
        toast.success("Stripe account disconnected");
        fetchStatus();
      } else {
        toast.error("Failed to disconnect");
      }
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnectingId(null);
    }
  }

  async function updateMapping(integrationId: string, field: string, value: string) {
    try {
      const res = await fetch("/api/v1/integrations/stripe/settings", {
        method: "PATCH",
        headers: orgHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ integrationId, [field]: value }),
      });
      if (res.ok) {
        toast.success("Settings updated");
        fetchStatus();
      } else {
        toast.error("Failed to update settings");
      }
    } catch {
      toast.error("Failed to update settings");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Stripe Integration</h1>
          <p className="text-sm text-muted-foreground">
            Connect your Stripe account to automatically sync charges, fees, refunds, and payouts into your accounting.
          </p>
        </div>

        <div className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Zap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="font-medium">Connect Stripe</h2>
              <p className="text-sm text-muted-foreground">
                Authorize dubbl to read your Stripe data
              </p>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p>When connected, dubbl will automatically:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Record each charge as revenue with proper journal entries</li>
              <li>Track Stripe processing fees as expenses</li>
              <li>Record refunds as revenue reversals</li>
              <li>Reconcile payouts to your bank account</li>
              <li>Sync Stripe customers as contacts</li>
            </ul>
          </div>

          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect Stripe Account
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stripe Integration</h1>
          <p className="text-sm text-muted-foreground">
            Manage your connected Stripe {integrations.length === 1 ? "account" : "accounts"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleConnect} disabled={connecting}>
          {connecting ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-2 h-3.5 w-3.5" />
          )}
          Connect another account
        </Button>
      </div>

      {integrations.map((integration) => (
        <IntegrationCard
          key={integration.id}
          integration={integration}
          accounts={accounts}
          bankAccounts={bankAccounts}
          syncing={syncingId === integration.id}
          disconnecting={disconnectingId === integration.id}
          onSync={() => handleSync(integration.id)}
          onDisconnect={() => handleDisconnect(integration.id)}
          onUpdateMapping={(field, value) => updateMapping(integration.id, field, value)}
        />
      ))}
    </div>
  );
}

function IntegrationCard({
  integration,
  accounts,
  bankAccounts,
  syncing,
  disconnecting,
  onSync,
  onDisconnect,
  onUpdateMapping,
}: {
  integration: IntegrationItem;
  accounts: Account[];
  bankAccounts: BankAccountItem[];
  syncing: boolean;
  disconnecting: boolean;
  onSync: () => void;
  onDisconnect: () => void;
  onUpdateMapping: (field: string, value: string) => void;
}) {
  const statusColor = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    disconnected: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  }[integration.status || "active"];

  const StatusIcon = {
    active: CheckCircle2,
    error: XCircle,
    disconnected: AlertCircle,
  }[integration.status || "active"] || AlertCircle;

  const maskedAccountId = integration.stripeAccountId
    ? `${integration.stripeAccountId.slice(0, 8)}...${integration.stripeAccountId.slice(-4)}`
    : "";

  const accountsConfigured = !!(integration.clearingAccountId && integration.revenueAccountId && integration.feesAccountId);
  const accountDisplayName = integration.displayName || integration.label;

  return (
    <div className="rounded-lg border space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-medium">{accountDisplayName}</h2>
            <span className="text-sm text-muted-foreground font-mono">{maskedAccountId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onSync} disabled={syncing || !accountsConfigured}>
            {syncing ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            disabled={disconnecting}
            className="text-destructive hover:text-destructive"
          >
            {disconnecting ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unplug className="mr-2 h-3.5 w-3.5" />
            )}
            Disconnect
          </Button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <Badge className={statusColor}>
          <StatusIcon className="mr-1 h-3 w-3" />
          {integration.status}
        </Badge>
        {integration.livemode ? (
          <Badge variant="outline" className="text-xs">Live</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">Test</Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {integration.lastSyncAt
            ? `Last sync: ${new Date(integration.lastSyncAt).toLocaleString()}`
            : "Not synced yet"}
        </span>
      </div>

      {integration.errorMessage && (
        <p className="text-sm text-destructive">{integration.errorMessage}</p>
      )}
      {!integration.initialSyncCompleted && accountsConfigured && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Initial sync in progress...
        </p>
      )}

      {/* Account mapping warning */}
      {!accountsConfigured && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Account mappings required</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Select a clearing, revenue, and fees account below before running a sync.
            </p>
          </div>
        </div>
      )}

      {/* Account Mappings */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Account Mappings</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Clearing Account (Asset)</Label>
            <Select
              value={integration.clearingAccountId || ""}
              onValueChange={(v) => onUpdateMapping("clearingAccountId", v)}
            >
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.type === "asset")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Revenue Account</Label>
            <Select
              value={integration.revenueAccountId || ""}
              onValueChange={(v) => onUpdateMapping("revenueAccountId", v)}
            >
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.type === "revenue")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fees Account (Expense)</Label>
            <Select
              value={integration.feesAccountId || ""}
              onValueChange={(v) => onUpdateMapping("feesAccountId", v)}
            >
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.type === "expense")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payout Bank Account</Label>
            <Select
              value={integration.payoutBankAccountId || ""}
              onValueChange={(v) => onUpdateMapping("payoutBankAccountId", v)}
            >
              <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((ba) => (
                  <SelectItem key={ba.id} value={ba.id}>
                    {ba.accountName}{ba.bankName ? ` (${ba.bankName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
