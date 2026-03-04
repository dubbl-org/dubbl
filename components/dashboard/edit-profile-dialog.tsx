"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="profile">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1">
              Profile
            </TabsTrigger>
            <TabsTrigger value="accounts" className="flex-1">
              Linked Accounts
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="space-y-4 pt-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={user?.image || undefined} />
                <AvatarFallback className="text-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              onClick={saveName}
              disabled={saving || !name}
              size="sm"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </TabsContent>
          <TabsContent value="accounts" className="space-y-2 pt-4">
            {accounts.length === 0 && !hasPassword ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No linked accounts.
              </p>
            ) : (
              <>
                {hasPassword && (
                  <div className="flex items-center justify-between py-2 px-1">
                    <span className="text-sm">Email & Password</span>
                  </div>
                )}
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between py-2 px-1"
                  >
                    <span className="text-sm capitalize">
                      {PROVIDER_LABELS[account.provider] || account.provider}
                    </span>
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
