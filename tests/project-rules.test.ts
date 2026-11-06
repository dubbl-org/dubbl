import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessAtLeast,
  fixedPriceInvoiceAmount,
  isPastDue,
  localISODate,
  localWeekDates,
  resolveProjectAccess,
  summarizeTimeEntries,
  timeEntryAmount,
  timeEntryChangeError,
} from "../lib/projects/rules";

test("org owners and admins always manage a project", () => {
  for (const orgRole of ["owner", "admin"]) {
    assert.equal(
      resolveProjectAccess({ orgRole, canManageProjects: false, projectRole: "viewer", projectHasManager: true }),
      "manage"
    );
  }
});

test("without manage:projects everyone else can only view", () => {
  assert.equal(
    resolveProjectAccess({ orgRole: "member", canManageProjects: false, projectRole: "manager", projectHasManager: true }),
    "view"
  );
});

test("the project role applies on top of manage:projects", () => {
  const base = { orgRole: "member", canManageProjects: true, projectHasManager: true };
  assert.equal(resolveProjectAccess({ ...base, projectRole: "manager" }), "manage");
  assert.equal(resolveProjectAccess({ ...base, projectRole: "contributor" }), "contribute");
  assert.equal(resolveProjectAccess({ ...base, projectRole: "viewer" }), "view");
});

test("non-members contribute, and manage while the project has no manager", () => {
  const base = { orgRole: "member", canManageProjects: true, projectRole: null };
  assert.equal(resolveProjectAccess({ ...base, projectHasManager: true }), "contribute");
  assert.equal(resolveProjectAccess({ ...base, projectHasManager: false }), "manage");
});

test("accessAtLeast orders view < contribute < manage", () => {
  assert.equal(accessAtLeast("manage", "contribute"), true);
  assert.equal(accessAtLeast("contribute", "contribute"), true);
  assert.equal(accessAtLeast("contribute", "manage"), false);
  assert.equal(accessAtLeast("view", "contribute"), false);
});

test("timeEntryAmount is hours times the cents rate, rounded", () => {
  assert.equal(timeEntryAmount(90, 10000), 15000);
  assert.equal(timeEntryAmount(20, 10000), 3333);
  assert.equal(timeEntryAmount(0, 10000), 0);
});

test("summarizeTimeEntries only counts billable time as money", () => {
  const s = summarizeTimeEntries([
    { minutes: 60, hourlyRate: 10000, isBillable: true, invoiceId: null },
    { minutes: 30, hourlyRate: 10000, isBillable: true, invoiceId: "inv-1" },
    { minutes: 120, hourlyRate: 10000, isBillable: false, invoiceId: null },
  ]);
  assert.equal(s.totalMinutes, 210);
  assert.equal(s.billableMinutes, 90);
  assert.equal(s.billableAmount, 15000);
  assert.equal(s.unbilledMinutes, 60);
  assert.equal(s.unbilledAmount, 10000);
  assert.equal(s.avgRate, 10000);
});

test("summarizeTimeEntries with no billable time has a zero average rate", () => {
  const s = summarizeTimeEntries([{ minutes: 60, hourlyRate: 5000, isBillable: false, invoiceId: null }]);
  assert.equal(s.billableAmount, 0);
  assert.equal(s.avgRate, 0);
});

test("fixedPriceInvoiceAmount never bills more than what is left", () => {
  assert.equal(fixedPriceInvoiceAmount(100000, 0, 40), 40000);
  assert.equal(fixedPriceInvoiceAmount(100000, 40000, 80), 60000);
  assert.equal(fixedPriceInvoiceAmount(100000, 100000, 10), 0);
  assert.equal(fixedPriceInvoiceAmount(100000, 0, 150), 100000);
  assert.equal(fixedPriceInvoiceAmount(100000, 0, -5), 0);
});

test("localISODate uses the local calendar day", () => {
  assert.equal(localISODate(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  assert.equal(localISODate(new Date(2026, 11, 31, 0, 5)), "2026-12-31");
});

test("localWeekDates runs Monday to Sunday around the date", () => {
  // Wednesday 14 October 2026
  assert.deepEqual(localWeekDates(new Date(2026, 9, 14, 12)), [
    "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
  ]);
  // A Sunday belongs to the week that started the Monday before.
  assert.equal(localWeekDates(new Date(2026, 9, 18, 9))[0], "2026-10-12");
});

test("isPastDue compares local dates and ignores missing ones", () => {
  assert.equal(isPastDue("2026-10-13", "2026-10-14"), true);
  assert.equal(isPastDue("2026-10-14", "2026-10-14"), false);
  assert.equal(isPastDue(null, "2026-10-14"), false);
});

const entry = { userId: "u1", invoiceId: null as string | null, date: "2026-10-01", minutes: 60, isBillable: true, hourlyRate: 10000 };

test("people without manage access can only change their own time", () => {
  assert.deepEqual(timeEntryChangeError(entry, { minutes: 30 }, { userId: "u2", access: "contribute" })?.status, 403);
  assert.equal(timeEntryChangeError(entry, { minutes: 30 }, { userId: "u1", access: "contribute" }), null);
  assert.equal(timeEntryChangeError(entry, "delete", { userId: "u2", access: "manage" }), null);
});

test("invoiced time can't be deleted and only description and task can change", () => {
  const invoiced = { ...entry, invoiceId: "inv-1" };
  const who = { userId: "u1", access: "manage" as const };
  assert.equal(timeEntryChangeError(invoiced, "delete", who)?.status, 409);
  assert.equal(timeEntryChangeError(invoiced, { minutes: 30 }, who)?.status, 409);
  assert.equal(timeEntryChangeError(invoiced, { isBillable: false }, who)?.status, 409);
  // Sending the same values back is fine.
  assert.equal(timeEntryChangeError(invoiced, { minutes: 60, date: "2026-10-01" }, who), null);
  assert.equal(timeEntryChangeError(invoiced, {}, who), null);
});
