"use client";

import { useMemo, useRef } from "react";
import { Bell, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { CATEGORIES, TYPES } from "./meta";

interface Preference {
  type: string;
  channel: "in_app" | "email";
  enabled: boolean;
  digestIntervalMinutes?: number;
}

type Channel = "inApp" | "email";
type PrefState = Record<string, { inApp: boolean; email: boolean }>;
type PrefsResponse = { preferences?: Required<Preference>[] };

const PREFS_URL = "/api/v1/notifications/preferences";

const DIGESTS = [
  { value: 0, label: "Right away" },
  { value: 30, label: "Every 30 min" },
  { value: 120, label: "Every 2 hours" },
];

function defaults(): PrefState {
  return Object.fromEntries(TYPES.map((t) => [t.type, { inApp: true, email: false }]));
}

function toForm(data: PrefsResponse | undefined): { prefs: PrefState; digest: number } {
  const prefs = defaults();
  let interval: number | null = null;
  for (const p of data?.preferences ?? []) {
    if (!prefs[p.type]) continue;
    if (p.channel === "in_app") prefs[p.type].inApp = p.enabled;
    else {
      prefs[p.type].email = p.enabled;
      interval ??= p.digestIntervalMinutes;
    }
  }
  return { prefs, digest: interval ?? 120 };
}

// Write changes into the cached answer, the way the server will store them
function upsert(data: PrefsResponse, changes: Preference[]): PrefsResponse {
  const list = [...(data.preferences ?? [])];
  for (const c of changes) {
    const i = list.findIndex((p) => p.type === c.type && p.channel === c.channel);
    if (i >= 0) list[i] = { ...list[i], enabled: c.enabled, digestIntervalMinutes: c.digestIntervalMinutes ?? list[i].digestIntervalMinutes };
    else list.push({ ...c, digestIntervalMinutes: c.digestIntervalMinutes ?? 30 });
  }
  return { ...data, preferences: list };
}

async function save(preferences: Preference[]) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(PREFS_URL, {
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
  // Loads when the sheet opens; `keepPrevious` holds the switches steady while it animates closed
  const { data, loading, error } = useApi<PrefsResponse>(open ? PREFS_URL : null, { keepPrevious: true });
  const cache = useApiCache();
  const { prefs, digest } = useMemo(() => toForm(data), [data]);
  const failed = Boolean(error && !data);
  const inboxChanged = useRef(false);

  // Flip the switches in the cached answer first, then save; put them back if the save fails
  const apply = async (changes: Preference[], undo: Preference[]) => {
    cache.update<PrefsResponse>(PREFS_URL, (d) => upsert(d, changes));
    try {
      await save(changes);
      return true;
    } catch {
      cache.update<PrefsResponse>(PREFS_URL, (d) => upsert(d, undo));
      return false;
    }
  };

  const toggle = async (type: string, channel: Channel, enabled: boolean) => {
    const change = (on: boolean): Preference =>
      channel === "inApp"
        ? { type, channel: "in_app", enabled: on }
        : { type, channel: "email", enabled: on, digestIntervalMinutes: digest };
    if (await apply([change(enabled)], [change(!enabled)])) {
      if (channel === "inApp") inboxChanged.current = true;
    } else {
      toast.error("Couldn't save that change. Try again.");
    }
  };

  const changeDigest = async (value: number) => {
    const email = (minutes: number) => TYPES.map((t): Preference => ({ type: t.type, channel: "email", enabled: prefs[t.type].email, digestIntervalMinutes: minutes }));
    if (!(await apply(email(value), email(digest)))) toast.error("Couldn't change email timing. Try again.");
  };

  const setAll = async (channel: Channel, enabled: boolean) => {
    const all = (on: (type: string) => boolean) =>
      TYPES.map((t): Preference =>
        channel === "inApp"
          ? { type: t.type, channel: "in_app", enabled: on(t.type) }
          : { type: t.type, channel: "email", enabled: on(t.type), digestIntervalMinutes: digest }
      );
    if (await apply(all(() => enabled), all((type) => prefs[type][channel]))) {
      if (channel === "inApp") inboxChanged.current = true;
    } else {
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
