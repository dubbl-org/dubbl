"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Loader2, Mail, Send, Trash2 } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { Section } from "@/components/dashboard/section";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApi, useApiCache } from "@/lib/query/use-api";

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  useTls: boolean;
  isVerified: boolean;
  hasPassword: boolean;
  updatedAt: string;
}

const EMPTY = { smtpHost: "", smtpPort: "587", smtpUsername: "", smtpPassword: "", fromEmail: "", fromName: "", replyTo: "", useTls: true };

function headers(json = false): Record<string, string> {
  const orgId = localStorage.getItem("activeOrgId");
  return { ...(orgId ? { "x-organization-id": orgId } : {}), ...(json ? { "content-type": "application/json" } : {}) };
}

const EMAIL_CONFIG_URL = "/api/v1/email-config";

function toForm(c: EmailConfig | null): typeof EMPTY {
  return c
    ? { smtpHost: c.smtpHost, smtpPort: String(c.smtpPort), smtpUsername: c.smtpUsername, smtpPassword: "", fromEmail: c.fromEmail, fromName: c.fromName ?? "", replyTo: c.replyTo ?? "", useTls: c.useTls }
    : EMPTY;
}

export default function EmailSettingsPage() {
  useDocumentTitle("Settings · Email sending");
  const { confirm, dialog } = useConfirm();
  const { data, loading, error } = useApi<{ emailConfig?: EmailConfig | null; platformFrom?: string }>(EMAIL_CONFIG_URL);
  const cache = useApiCache();
  const config = data?.emailConfig ?? null;
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const form = draft ?? toForm(config);
  const setForm = (fn: (f: typeof EMPTY) => typeof EMPTY) => setDraft((d) => fn(d ?? form));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const fill = (c: EmailConfig | null) => {
    cache.set(EMAIL_CONFIG_URL, { ...data, emailConfig: c });
    setDraft(null);
  };

  useEffect(() => {
    if (error && !data) toast.error("Couldn't load your email settings");
  }, [error, data]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/email-config", {
        method: "PUT",
        headers: headers(true),
        body: JSON.stringify({
          smtpHost: form.smtpHost.trim(),
          smtpPort: Number(form.smtpPort) || 587,
          smtpUsername: form.smtpUsername.trim(),
          smtpPassword: form.smtpPassword || undefined,
          fromEmail: form.fromEmail.trim(),
          fromName: form.fromName.trim() || null,
          replyTo: form.replyTo.trim() || null,
          useTls: form.useTls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't save");
      fill(data.emailConfig);
      if (data.emailConfig?.isVerified) toast.success("Saved. Your mail server accepted the login");
      else toast.warning("Saved, but your mail server didn't accept the login. Check the details and try again");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/v1/email-config/test", { method: "POST", headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "The test email didn't send");
      toast.success(data.message ?? "Test email sent");
      if (config && !config.isVerified) cache.set(EMAIL_CONFIG_URL, { ...data, emailConfig: { ...config, isVerified: true } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The test email didn't send");
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Stop using your mail server?",
      description: "Invoices and other documents will be sent from dubbl's address again, with replies going to your workspace email.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch("/api/v1/email-config", { method: "DELETE", headers: headers() });
    if (!res.ok) return toast.error("Couldn't remove the settings");
    fill(null);
    toast.success("Removed. Emails go out from dubbl again");
  }

  if (loading) return <BrandLoader />;

  const usingOwn = Boolean(config?.isVerified);

  return (
    <ContentReveal className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Email sending</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Choose the address your invoices, quotes, credit notes, purchase orders and payment reminders are emailed from.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/80 px-4 py-3.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05]">
          {usingOwn ? <CheckCircle2 className="size-4 text-emerald-600" /> : config ? <CircleAlert className="size-4 text-amber-600" /> : <Mail className="size-4 text-muted-foreground" />}
        </span>
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-medium">
            {usingOwn
              ? `Sending from ${config!.fromName ? `${config!.fromName} <${config!.fromEmail}>` : config!.fromEmail}`
              : config
                ? "Your mail server isn't verified yet, so emails still go out from dubbl"
                : `Sending from ${data?.platformFrom ?? "dubbl <invoices@dubbl.dev>"}`}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {usingOwn
              ? "Documents are delivered through your own mail server, so they come from your address and land in your Sent folder."
              : "Replies go to your workspace email. Connect your own mail server below to send from your business address instead."}{" "}
            <Link href="/documents/emails" className="underline-offset-2 hover:text-foreground hover:underline">See what&apos;s been sent</Link>
          </p>
        </div>
        {config && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
            Send test email
          </Button>
        )}
      </div>

      <form onSubmit={save} className="space-y-8">
        <Section title="Mail server" description="The outgoing (SMTP) details from your email provider. Gmail and Outlook need an app password rather than your normal one.">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1.5">
              <Label className="text-xs">Server</Label>
              <Input required placeholder="smtp.yourprovider.com" value={form.smtpHost} onChange={set("smtpHost")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Port</Label>
              <Input required inputMode="numeric" value={form.smtpPort} onChange={set("smtpPort")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input required autoComplete="off" value={form.smtpUsername} onChange={set("smtpUsername")} />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                required={!config?.hasPassword}
                placeholder={config?.hasPassword ? "Saved. Type to replace" : ""}
                value={form.smtpPassword}
                onChange={set("smtpPassword")}
              />
            </div>
          </div>
          <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border/80 px-3 py-2.5">
            <span>
              <span className="block text-[13px] font-medium">Encrypted connection</span>
              <span className="block text-[12px] text-muted-foreground">Leave on unless your provider says otherwise.</span>
            </span>
            <Switch checked={form.useTls} onCheckedChange={(v) => setForm((f) => ({ ...f, useTls: v }))} />
          </label>
        </Section>

        <div className="h-px bg-border/70" />

        <Section title="Sender" description="How your emails appear in your customers' inbox.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">From address</Label>
              <Input required type="email" placeholder="billing@yourbusiness.com" value={form.fromEmail} onChange={set("fromEmail")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From name</Label>
              <Input placeholder="Your business name" value={form.fromName} onChange={set("fromName")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Replies go to (optional)</Label>
              <Input type="email" placeholder="Same as the from address" value={form.replyTo} onChange={set("replyTo")} />
            </div>
          </div>
        </Section>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-5">
          {config ? (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={remove}>
              <Trash2 className="mr-1.5 size-3.5" />
              Stop using my mail server
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {config ? "Save and check" : "Connect and check"}
          </Button>
        </div>
      </form>
      {dialog}
    </ContentReveal>
  );
}
