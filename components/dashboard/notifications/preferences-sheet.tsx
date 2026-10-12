"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CATEGORIES, TYPES } from "./meta";

interface Preference {
  type: string;
  channel: "in_app" | "email";
  enabled: boolean;
  digestIntervalMinutes?: number;
}

type Channel = "inApp" | "email";
type PrefState = Record<string, { inApp: boolean; email: boolean }>;

const DIGESTS = [
  { value: 0, label: "Right away" },
  { value: 30, label: "Every 30 min" },
  { value: 120, label: "Every 2 hours" },
];

function defaults(): PrefState {
  return Object.fromEntries(TYPES.map((t) => [t.type, { inApp: true, email: false }]));
}

async function save(preferences: Preference[]) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch("/api/v1/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: JSON.stringify({ preferences }),
  });
  if (!res.ok) throw new Error("save failed");
}

/**
 * Per-type switches for the inbox and email, saved as they're flipped.
 * `onInboxChange` fires when an inbox switch changed, so the list can reload.
 */
export function PreferencesSheet({
  open,
  onOpenChange,
  onInboxChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInboxChange: () => void;
}) {
  const [prefs, setPrefs] = useState<PrefState>(defaults);
  const [digest, setDigest] = useState(120);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const inboxChanged = useRef(false);

  useEffect(() => {
    if (!open) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/notifications/preferences", { headers: { "x-organization-id": orgId } });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { preferences?: Required<Preference>[] };
        if (cancelled) return;
        const next = defaults();
        let interval: number | null = null;
        for (const p of data.preferences ?? []) {
          if (!next[p.type]) continue;
          if (p.channel === "in_app") next[p.type].inApp = p.enabled;
          else {
            next[p.type].email = p.enabled;
            interval ??= p.digestIntervalMinutes;
          }
        }
        setPrefs(next);
        if (interval != null) setDigest(interval);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggle = async (type: string, channel: Channel, enabled: boolean) => {
    setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: enabled } }));
    try {
      await save([
        channel === "inApp"
          ? { type, channel: "in_app", enabled }
          : { type, channel: "email", enabled, digestIntervalMinutes: digest },
      ]);
      if (channel === "inApp") inboxChanged.current = true;
    } catch {
      setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: !enabled } }));
      toast.error("Couldn't save that change. Try again.");
    }
  };

  const changeDigest = async (value: number) => {
    const before = digest;
    setDigest(value);
    try {
      await save(TYPES.map((t) => ({ type: t.type, channel: "email", enabled: prefs[t.type].email, digestIntervalMinutes: value })));
    } catch {
      setDigest(before);
      toast.error("Couldn't change email timing. Try again.");
    }
  };

  const setAll = async (channel: Channel, enabled: boolean) => {
    const before = prefs;
    setPrefs((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, [channel]: enabled }])));
    try {
      await save(
        TYPES.map((t) =>
          channel === "inApp"
            ? { type: t.type, channel: "in_app", enabled }
            : { type: t.type, channel: "email", enabled, digestIntervalMinutes: digest }
        )
      );
      if (channel === "inApp") inboxChanged.current = true;
    } catch {
      setPrefs(before);
      toast.error("Couldn't save that change. Try again.");
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && inboxChanged.current) {
      inboxChanged.current = false;
      onInboxChange();
    }
    onOpenChange(next);
  };

  const anyEmail = Object.values(prefs).some((v) => v.email);
  const allInbox = Object.values(prefs).every((v) => v.inApp);
  const allEmail = Object.values(prefs).every((v) => v.email);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/[0.06] backdrop-blur-none"
        className="w-full gap-0 p-0 shadow-[-16px_0_48px_-24px_rgba(0,0,0,0.25)] sm:max-w-[460px]"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 pl-5 pr-2">
          <SheetTitle className="text-[14px] font-semibold">Notification preferences</SheetTitle>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            aria-label="Close"
            className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SheetDescription className="px-5 pb-1 pt-4 text-[13px] leading-relaxed text-muted-foreground">
            Choose what shows up in your inbox and what we email you. Changes save as you go.
          </SheetDescription>

          {failed ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">We couldn&apos;t load your preferences. Close this and try again.</p>
          ) : (
            <>
              {/* Column heads */}
              <div className="sticky top-0 z-10 mt-3 flex h-9 items-center border-y border-border/60 bg-background/95 px-5 text-[12px] font-medium text-muted-foreground backdrop-blur-sm">
                <span className="flex-1">Notify me when</span>
                <ColumnHead icon={Bell} label="Inbox" on={allInbox} onClick={() => setAll("inApp", !allInbox)} disabled={loading} />
                <ColumnHead icon={Mail} label="Email" on={allEmail} onClick={() => setAll("email", !allEmail)} disabled={loading} />
              </div>

              {CATEGORIES.map((c) => {
                const types = TYPES.filter((t) => t.category === c.key);
                if (types.length === 0) return null;
                return (
                  <section key={c.key} className="border-b border-border/50 px-5 py-2.5 last:border-0">
                    <p className="flex items-center gap-1.5 py-1 text-[11.5px] font-medium text-muted-foreground">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.label}
                    </p>
                    {types.map((t) => {
                      const Icon = t.icon;
                      const val = prefs[t.type];
                      return (
                        <div key={t.type} className="flex items-center gap-3 py-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${t.color}17`, color: t.color }}>
                            <Icon className="size-3.5" strokeWidth={1.9} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{t.label}</p>
                            <p className="truncate text-[12px] text-muted-foreground">{t.description}</p>
                          </div>
                          {loading ? (
                            <>
                              <Skeleton className="mx-3 h-5 w-9 rounded-full" />
                              <Skeleton className="mx-3 h-5 w-9 rounded-full" />
                            </>
                          ) : (
                            <>
                              <span className="flex w-[60px] justify-center">
                                <Switch checked={val.inApp} onCheckedChange={(v) => toggle(t.type, "inApp", v)} aria-label={`${t.label} in inbox`} />
                              </span>
                              <span className="flex w-[60px] justify-center">
                                <Switch checked={val.email} onCheckedChange={(v) => toggle(t.type, "email", v)} aria-label={`${t.label} by email`} />
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })}

              {/* Email timing */}
              <div className="border-t border-border/60 px-5 py-4">
                <p className="text-[13px] font-medium">Email timing</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {anyEmail
                    ? "Notifications that arrive close together are bundled into one email."
                    : "Turn on email for at least one type to get emails."}
                </p>
                <div className={cn("mt-3 inline-flex rounded-lg bg-foreground/[0.035] p-0.5", !anyEmail && "pointer-events-none opacity-50")}>
                  {DIGESTS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => d.value !== digest && changeDigest(d.value)}
                      className={cn(
                        "h-7 rounded-md px-3 text-[12.5px] transition-colors",
                        digest === d.value ? "bg-foreground/[0.07] font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ColumnHead({ icon: Icon, label, on, onClick, disabled }: { icon: typeof Bell; label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={on ? `Turn off ${label.toLowerCase()} for everything` : `Turn on ${label.toLowerCase()} for everything`}
      className="flex w-[60px] items-center justify-center gap-1 rounded-md py-1 transition-colors hover:text-foreground disabled:opacity-50"
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}
