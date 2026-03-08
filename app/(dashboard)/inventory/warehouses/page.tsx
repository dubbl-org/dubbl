"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Warehouse,
  Pencil,
  Trash2,
  MapPin,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

interface WarehouseItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export default function WarehousesPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formAddress, setFormAddress] = useState("");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  function fetchWarehouses() {
    if (!orgId) return;
    fetch("/api/v1/warehouses", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.warehouses) setWarehouses(data.warehouses);
      })
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchWarehouses();
  }, [orgId]);

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormCode("");
    setFormAddress("");
    setSheetOpen(true);
  }

  function openEdit(warehouse: WarehouseItem) {
    setEditing(warehouse);
    setFormName(warehouse.name);
    setFormCode(warehouse.code);
    setFormAddress(warehouse.address || "");
    setSheetOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);

    try {
      const payload = { name: formName, code: formCode, address: formAddress || null };

      if (editing) {
        const res = await fetch(`/api/v1/warehouses/${editing.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update warehouse");
        }
        toast.success("Warehouse updated");
      } else {
        const res = await fetch("/api/v1/warehouses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create warehouse");
        }
        toast.success("Warehouse created");
      }

      setSheetOpen(false);
      setEditing(null);
      fetchWarehouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(warehouse: WarehouseItem) {
    if (!orgId) return;

    const confirmed = await confirm({
      title: `Delete "${warehouse.name}"?`,
      description:
        "This warehouse will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/v1/warehouses/${warehouse.id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete warehouse");
      }
      toast.success("Warehouse deleted");
      fetchWarehouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleSetDefault(warehouse: WarehouseItem) {
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/warehouses/${warehouse.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set default");
      }
      toast.success(`"${warehouse.name}" set as default`);
      fetchWarehouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set default");
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Warehouses</h1>
          <p className="text-sm text-muted-foreground">
            Manage your warehouse locations for inventory tracking.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={openCreate}
        >
          <Plus className="mr-1.5 size-3.5" />
          New Warehouse
        </Button>
      </div>

      {/* Warehouse list */}
      {warehouses.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No warehouses yet"
          description="Create your first warehouse to organize inventory by location."
        >
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={openCreate}
          >
            New Warehouse
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((warehouse) => (
            <div
              key={warehouse.id}
              className="rounded-xl border bg-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      warehouse.isActive
                        ? "bg-emerald-50 dark:bg-emerald-950/40"
                        : "bg-muted"
                    )}
                  >
                    <Warehouse
                      className={cn(
                        "size-4",
                        warehouse.isActive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {warehouse.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {warehouse.code}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {warehouse.isDefault && (
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 text-[11px]"
                    >
                      Default
                    </Badge>
                  )}
                  {!warehouse.isActive && (
                    <Badge variant="outline" className="text-[11px]">
                      Inactive
                    </Badge>
                  )}
                </div>
              </div>

              {warehouse.address && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{warehouse.address}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 pt-1 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => openEdit(warehouse)}
                >
                  <Pencil className="size-3 mr-1" />
                  Edit
                </Button>
                {!warehouse.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleSetDefault(warehouse)}
                  >
                    <Star className="size-3 mr-1" />
                    Set Default
                  </Button>
                )}
                {!warehouse.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                    onClick={() => handleDelete(warehouse)}
                  >
                    <Trash2 className="size-3 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(v) => {
          if (!v) {
            setSheetOpen(false);
            setEditing(null);
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editing ? "Edit Warehouse" : "New Warehouse"}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="space-y-4 px-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Main Warehouse"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. WH-001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="e.g. 123 Storage Ln, City"
              />
            </div>
          </form>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSheetOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </ContentReveal>
  );
}
