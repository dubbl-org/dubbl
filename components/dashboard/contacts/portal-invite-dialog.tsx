"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { copyText, invitePortal, portalLink, type PortalInviteResult } from "./actions";

const EXPIRY = [
  { value: "7", label: "1 week" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

/**
 * Give a customer a private portal link. Pass `contact` to invite someone
 * specific; otherwise the dialog asks who to invite.
 */
export function PortalInviteDialog({
  open,
  onOpenChange,
  contact,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: { id: string; name: string; email: string | null } | null;
  onCreated?: () => void;
}) {
  const [contactId, setContactId] = useState("");
  const [days, setDays] = useState("30");
  // null = not touched yet, so the default follows whichever contact is shown.
  const [sendEmailChoice, setSendEmail] = useState<boolean | null>(null);
  const sendEmail = sendEmailChoice ?? (contact ? Boolean(contact.email) : true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PortalInviteResult | null>(null);

  const targetId = contact?.id ?? contactId;

  function reset(next: boolean) {
    if (!next) {
      setContactId("");
      setDays("30");
      setMessage("");
      setResult(null);
      setSendEmail(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    if (!targetId) {
      toast.error("Pick who to invite");
      return;
    }
    setBusy(true);
    try {
      const data = await invitePortal({ contactId: targetId, expiresInDays: Number(days), sendEmail, message: message.trim() || undefined });
      setResult(data);
      if (data.emailed) toast.success("Portal link emailed");
      else if (sendEmail && data.emailError) toast.warning("Link created, but not emailed", { description: data.emailError });
      else toast.success("Portal link created");
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the portal link");
    } finally {
      setBusy(false);
    }
  }

  const link = result ? portalLink(result.portalUrl) : "";

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{result ? "Portal link ready" : contact ? `Invite ${contact.name} to the portal` : "Invite a customer to the portal"}</DialogTitle>
          <DialogDescription>
            {result
              ? "Anyone with this link can see this customer's invoices, statements, quotes and payments until it expires."
              : "They get a private page with their invoices, statements, quotes and payments. No account or password needed."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-foreground/[0.04] p-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/80">{link}</span>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[12.5px]" onClick={() => copyText(link, "Link copied")}>
                <Copy className="size-3" />
                Copy
              </Button>
            </div>
            {result.emailed ? (
              <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-700 dark:text-emerald-400">
                <Check className="size-3.5" /> Emailed to the customer
              </p>
            ) : result.emailError ? (
              <p className="text-[12.5px] text-amber-700 dark:text-amber-400">{result.emailError}</p>
            ) : null}
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            {!contact && (
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <ContactPicker value={contactId} onChange={setContactId} placeholder="Pick a customer…" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Link works for</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start justify-between gap-4 rounded-lg border border-border/80 px-3 py-2.5">
              <span>
                <span className="block text-[13px] font-medium">Email them the link</span>
                <span className="block text-[12px] text-muted-foreground">
                  {contact && !contact.email ? "This contact has no email address" : "Sent from your workspace's email settings"}
                </span>
              </span>
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} disabled={Boolean(contact && !contact.email)} />
            </label>
            {sendEmail && (
              <div className="space-y-1.5">
                <Label>Personal note (optional)</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Hi! You can now see all your invoices here…" />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(link, "_blank")}>
                <ExternalLink className="size-3.5" />
                Open portal
              </Button>
              <Button size="sm" onClick={() => reset(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => reset(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={busy || !targetId} className="gap-1.5">
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Create link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
