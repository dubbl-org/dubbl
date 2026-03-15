"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  UserPlus,
  X,
  Mail,
  Phone,
  Briefcase,
  Star,
} from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useContactContext, getOrgId } from "../layout";

export default function ContactPeoplePage() {
  const { id } = useParams<{ id: string }>();
  const { contact, fetchContact } = useContactContext();

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({
    name: "",
    email: "",
    phone: "",
    jobTitle: "",
    isPrimary: false,
  });

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newPerson.name.trim()) return;
    const orgId = getOrgId();
    if (!orgId) return;

    setAddingPerson(true);
    try {
      const res = await fetch(`/api/v1/contacts/${id}/people`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: newPerson.name,
          email: newPerson.email || null,
          phone: newPerson.phone || null,
          jobTitle: newPerson.jobTitle || null,
          isPrimary: newPerson.isPrimary,
        }),
      });

      if (!res.ok) throw new Error("Failed to add person");
      toast.success("Person added");
      setNewPerson({ name: "", email: "", phone: "", jobTitle: "", isPrimary: false });
      setShowAddPerson(false);
      fetchContact();
    } catch {
      toast.error("Failed to add person");
    } finally {
      setAddingPerson(false);
    }
  }

  return (
    <ContentReveal key="people">
      <div className="space-y-10">
        <Section title="Contact people" description="People associated with this contact organization.">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {(contact.people?.length ?? 0) > 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  {(contact.people?.length ?? 0)} {(contact.people?.length ?? 0) === 1 ? "person" : "people"}
                </p>
              ) : (
                <div />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddPerson(!showAddPerson)}
              >
                {showAddPerson ? (
                  <>
                    <X className="mr-2 size-3.5" />
                    Cancel
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 size-3.5" />
                    Add person
                  </>
                )}
              </Button>
            </div>

            {showAddPerson && (
              <form
                onSubmit={handleAddPerson}
                className="space-y-4 rounded-lg border border-dashed p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      placeholder="Full name"
                      value={newPerson.name}
                      onChange={(e) =>
                        setNewPerson({ ...newPerson, name: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      placeholder="Email address"
                      value={newPerson.email}
                      onChange={(e) =>
                        setNewPerson({ ...newPerson, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      placeholder="Phone number"
                      value={newPerson.phone}
                      onChange={(e) =>
                        setNewPerson({ ...newPerson, phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Job title</Label>
                    <Input
                      placeholder="Job title"
                      value={newPerson.jobTitle}
                      onChange={(e) =>
                        setNewPerson({ ...newPerson, jobTitle: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="personPrimary"
                      checked={newPerson.isPrimary}
                      onCheckedChange={(checked) =>
                        setNewPerson({ ...newPerson, isPrimary: checked === true })
                      }
                    />
                    <Label
                      htmlFor="personPrimary"
                      className="cursor-pointer text-sm font-normal"
                    >
                      Primary contact
                    </Label>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    loading={addingPerson}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <UserPlus className="mr-2 size-3.5" />
                    Add
                  </Button>
                </div>
              </form>
            )}

            {(contact.people?.length ?? 0) === 0 && !showAddPerson ? (
              <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed">
                <UserPlus className="mb-2 size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No contact people yet
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Add people associated with this contact
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(contact.people ?? []).map((person) => (
                  <div
                    key={person.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {person.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {person.name}
                        </span>
                        {person.isPrimary && (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px]"
                          >
                            <Star className="mr-1 size-3" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {person.jobTitle && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="size-3" />
                            {person.jobTitle}
                          </span>
                        )}
                        {person.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="size-3" />
                            {person.email}
                          </span>
                        )}
                        {person.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3" />
                            {person.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>
    </ContentReveal>
  );
}
