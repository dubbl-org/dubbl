"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Mail, Loader2, CheckCircle2, XCircle, Globe, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";

interface EmailConfig {
  id: string;
  provider: "smtp" | "resend";
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  useTls: boolean;
  isVerified: boolean;
  customDomain: string | null;
  domainVerified: boolean;
}

interface DomainInfo {
  id: string;
  name: string;
  status: string;
  records: Array<{
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
    priority?: number;
  }>;
}

export default function EmailSettingsPage() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [provider, setProvider] = useState<"smtp" | "resend">("smtp");

  // SMTP fields
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [useTls, setUseTls] = useState(true);

  // Resend fields
  const [resendApiKey, setResendApiKey] = useState("");

  // Shared fields
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");

  // Domain
  const [domain, setDomain] = useState<DomainInfo | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);

  function getOrgId() {
    return localStorage.getItem("activeOrgId") || "";
  }

  async function fetchConfig() {
    const orgId = getOrgId();
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/email-config", {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      const c = data.emailConfig;
      if (c) {
        setConfig(c);
        setProvider(c.provider);
        setSmtpHost(c.smtpHost || "");
        setSmtpPort(String(c.smtpPort || 587));
        setSmtpUsername(c.smtpUsername || "");
        setFromEmail(c.fromEmail);
        setFromName(c.fromName || "");
        setReplyTo(c.replyTo || "");
        setUseTls(c.useTls);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchDomain() {
    const orgId = getOrgId();
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/email-config/domains", {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      setDomain(data.domain || null);
    } catch {
      // Domain info optional
    }
  }

  useEffect(() => {
    fetchConfig();
    fetchDomain();
  }, []);

  async function save() {
    const orgId = getOrgId();
    if (!orgId) return;
    setSaving(true);
    try {
      const body =
        provider === "smtp"
          ? {
              provider: "smtp",
              smtpHost,
              smtpPort: parseInt(smtpPort, 10),
              smtpUsername,
              smtpPassword: smtpPassword || "placeholder",
              fromEmail,
              fromName: fromName || null,
              replyTo: replyTo || null,
              useTls,
            }
          : {
              provider: "resend",
              resendApiKey: resendApiKey || "placeholder",
              fromEmail,
              fromName: fromName || null,
              replyTo: replyTo || null,
            };

      const res = await fetch("/api/v1/email-config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setConfig(data.emailConfig);
      toast.success("Email configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    const orgId = getOrgId();
    if (!orgId) return;
    setTesting(true);
    try {
      const res = await fetch("/api/v1/email-config/test", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Test email sent");
        fetchConfig();
      } else {
        toast.error(data.error || "Test failed");
      }
    } catch {
      toast.error("Failed to send test email");
    } finally {
      setTesting(false);
    }
  }

  async function addCustomDomain() {
    const orgId = getOrgId();
    if (!orgId || !newDomain) return;
    setAddingDomain(true);
    try {
      const res = await fetch("/api/v1/email-config/domains", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ domain: newDomain }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewDomain("");
      toast.success("Domain added");
      fetchDomain();
      fetchConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAddingDomain(false);
    }
  }

  async function removeDomain() {
    const orgId = getOrgId();
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/email-config/domains", {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDomain(null);
      toast.success("Domain removed");
      fetchConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove domain");
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Email Configuration</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Configure how emails are sent from your organization.
          </p>
        </div>
        {config && (
          <Badge variant={config.isVerified ? "default" : "secondary"}>
            {config.isVerified ? (
              <><CheckCircle2 className="mr-1 size-3" /> Verified</>
            ) : (
              <><XCircle className="mr-1 size-3" /> Not verified</>
            )}
          </Badge>
        )}
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label>Email Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as "smtp" | "resend")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="smtp">SMTP</SelectItem>
              <SelectItem value="resend">Resend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {provider === "smtp" ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SMTP Host</Label>
                <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
              </div>
              <div className="space-y-2">
                <Label>SMTP Port</Label>
                <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={config ? "Unchanged" : ""} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={useTls} onCheckedChange={setUseTls} />
              <Label>Use TLS</Label>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label>Resend API Key</Label>
            <Input
              type="password"
              value={resendApiKey}
              onChange={(e) => setResendApiKey(e.target.value)}
              placeholder={config?.provider === "resend" ? "Unchanged" : "re_..."}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>From Email</Label>
            <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="billing@acme.com" />
          </div>
          <div className="space-y-2">
            <Label>From Name</Label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Acme Billing" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Reply-To (optional)</Label>
          <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="support@acme.com" />
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Mail className="mr-2 size-4" />}
            Save Configuration
          </Button>
          {config && (
            <Button variant="outline" onClick={sendTest} disabled={testing}>
              {testing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              Send Test Email
            </Button>
          )}
        </div>
      </div>

      {/* Custom Domain section (Resend only) */}
      {provider === "resend" && config?.provider === "resend" && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Custom Domain</h3>
          </div>

          {domain ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{domain.name}</p>
                  <Badge variant={domain.status === "verified" ? "default" : "secondary"} className="mt-1">
                    {domain.status}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" onClick={removeDomain} className="text-red-600">
                  Remove
                </Button>
              </div>

              {domain.status !== "verified" && domain.records && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Add these DNS records to verify your domain:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="p-2">Type</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Value</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {domain.records.map((r, i) => (
                          <tr key={i} className="border-b">
                            <td className="p-2 font-mono">{r.type}</td>
                            <td className="p-2 font-mono max-w-[200px] truncate">{r.name}</td>
                            <td className="p-2 font-mono max-w-[300px] truncate">{r.value}</td>
                            <td className="p-2">
                              <Badge variant={r.status === "verified" ? "default" : "secondary"} className="text-[10px]">
                                {r.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchDomain}>
                    Check Status
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="mail.acme.com"
                className="max-w-xs"
              />
              <Button
                variant="outline"
                onClick={addCustomDomain}
                disabled={!newDomain || addingDomain}
              >
                {addingDomain ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Add Domain
              </Button>
            </div>
          )}
        </div>
      )}
    </ContentReveal>
  );
}
