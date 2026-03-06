"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface LinkedAccount {
  id: string;
  provider: string;
  type: string;
}

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  credentials: "Email & Password",
};

export function EditProfileDialog({
  open,
  onOpenChange,
  user,
}: EditProfileDialogProps) {
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [hasPassword, setHasPassword] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(user?.name || "");
      fetchAccounts();
    }
  }, [open, user?.name]);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/v1/user/accounts");
      const data = await res.json();
      if (data.accounts) {
        const oauthAccounts = data.accounts.filter(
          (a: LinkedAccount) => a.type !== "credentials"
        );
        setAccounts(oauthAccounts);
        setHasPassword(
          data.accounts.some((a: LinkedAccount) => a.type === "credentials")
        );
      }
    } catch {
      // ignore
    }
  }

  async function saveName() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Profile updated");
      onOpenChange(false);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function unlinkAccount(id: string) {
    setUnlinking(id);
    try {
      const res = await fetch(`/api/v1/user/accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success("Account unlinked");
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setUnlinking(null);
    }
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "?";

  const canUnlink = accounts.length > 1 || hasPassword;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription className="text-[13px]">
            Manage your account details and linked providers.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="profile" className="mt-4">
          <TabsList className="w-full rounded-none border-b bg-transparent px-6 justify-start gap-4 h-auto p-0">
            <TabsTrigger
              value="profile"
              className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-0 text-[13px] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="accounts"
              className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-0 text-[13px] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Linked Accounts
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="px-6 pb-6 pt-5 space-y-5 mt-0">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarImage src={user?.image || undefined} />
                <AvatarFallback className="text-sm bg-muted text-muted-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                value={user?.email || ""}
                disabled
                className="text-muted-foreground"
              />
            </div>
            <Button
              onClick={saveName}
              disabled={saving || !name}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </TabsContent>
          <TabsContent value="accounts" className="px-6 pb-6 pt-5 mt-0">
            {accounts.length === 0 && !hasPassword ? (
              <div className="py-8 text-center">
                <Shield className="mx-auto size-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No linked accounts found.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {hasPassword && (
                  <div className="flex items-center justify-between rounded-md px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded bg-muted">
                        <Shield className="size-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm">Email & Password</p>
                        <p className="text-[11px] text-muted-foreground">{user?.email}</p>
                      </div>
                    </div>
                  </div>
                )}
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-md px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded bg-muted">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {(PROVIDER_LABELS[account.provider] || account.provider)[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm">
                          {PROVIDER_LABELS[account.provider] || account.provider}
                        </p>
                        <p className="text-[11px] text-muted-foreground capitalize">
                          {account.type}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-red-600"
                      disabled={!canUnlink || unlinking === account.id}
                      onClick={() => unlinkAccount(account.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
