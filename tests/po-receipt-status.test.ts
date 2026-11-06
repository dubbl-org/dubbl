import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePurchaseOrderStatusAfterReceipt } from "../lib/api/procurement";

// Quantities are stored x100 (5 units = 500).
test("PO receipt status: nothing in stays sent", () => {
  assert.equal(derivePurchaseOrderStatusAfterReceipt([{ quantity: 500, quantityReceived: 0 }]), "sent");
});

test("PO receipt status: a part delivery is partial", () => {
  assert.equal(
    derivePurchaseOrderStatusAfterReceipt([
      { quantity: 500, quantityReceived: 200 },
      { quantity: 100, quantityReceived: 0 },
    ]),
    "partial"
  );
});

test("PO receipt status: two part deliveries that complete every line are received", () => {
  assert.equal(
    derivePurchaseOrderStatusAfterReceipt([
      { quantity: 500, quantityReceived: 500 },
      { quantity: 150, quantityReceived: 150 },
    ]),
    "received"
  );
});

import { derivePurchaseOrderStatus, allocateBillToPurchaseOrderLines, releaseBilledQuantities, entriesStillToReverse } from "../lib/api/procurement";

test("PO status: billing a sent order marks it partial, then closed", () => {
  assert.equal(derivePurchaseOrderStatus([{ quantity: 500, quantityReceived: 0, quantityBilled: 0 }]), "sent");
  assert.equal(derivePurchaseOrderStatus([{ quantity: 500, quantityReceived: 0, quantityBilled: 200 }]), "partial");
  assert.equal(
    derivePurchaseOrderStatus([
      { quantity: 500, quantityReceived: 0, quantityBilled: 500 },
      { quantity: 100, quantityReceived: 0, quantityBilled: 100 },
    ]),
    "closed"
  );
});

test("PO status: receipts and bills don't overwrite each other", () => {
  // All in but only part billed stays "received" (All items in).
  assert.equal(derivePurchaseOrderStatus([{ quantity: 500, quantityReceived: 500, quantityBilled: 200 }]), "received");
  // Part received, nothing billed is partial; a bill doesn't push it back to sent.
  assert.equal(derivePurchaseOrderStatus([{ quantity: 500, quantityReceived: 200, quantityBilled: 0 }]), "partial");
  assert.equal(derivePurchaseOrderStatus([{ quantity: 500, quantityReceived: 200, quantityBilled: 100 }]), "partial");
});

test("PO billing allocation: receipt link, then stock item, then description, capped", () => {
  const po = [
    { id: "p1", quantity: 500, quantityBilled: 0, description: "Chairs", inventoryItemId: "chair" },
    { id: "p2", quantity: 200, quantityBilled: 100, description: "Desks" },
  ];
  const a = allocateBillToPurchaseOrderLines(
    [
      { quantity: 300, description: "Office chairs", inventoryItemId: "chair" },
      { quantity: 500, description: "desks" },
      { quantity: 100, description: "Shipping" },
    ],
    po
  );
  assert.equal(a.get("p1"), 300);
  assert.equal(a.get("p2"), 100); // only 1 desk was left to bill
  assert.equal(a.size, 2);
  const b = allocateBillToPurchaseOrderLines([{ quantity: 200, description: "x", purchaseOrderLineId: "p1" }], po);
  assert.equal(b.get("p1"), 200);
});

test("releasing a bill gives back exactly what it counted, never below zero", () => {
  const out = releaseBilledQuantities(
    [
      { id: "a", quantityBilled: 400 },
      { id: "b", quantityBilled: 200 },
      { id: "c", quantityBilled: 100 },
    ],
    [
      { purchaseOrderLineId: "a", quantity: 100 },
      { purchaseOrderLineId: "a", quantity: 200 },
      { purchaseOrderLineId: "b", quantity: 500 },
    ]
  );
  assert.equal(out.get("a"), 100);
  assert.equal(out.get("b"), 0);
  assert.equal(out.has("c"), false);
});

test("a fully billed PO goes back to sent once its only bill is released", () => {
  const lines = [{ id: "a", quantity: 400, quantityReceived: 0, quantityBilled: 400 }];
  assert.equal(derivePurchaseOrderStatus(lines), "closed");
  const after = releaseBilledQuantities(lines, [{ purchaseOrderLineId: "a", quantity: 400 }]);
  assert.equal(
    derivePurchaseOrderStatus(lines.map((l) => ({ ...l, quantityBilled: after.get(l.id) ?? l.quantityBilled }))),
    "sent"
  );
});

test("a voided bill's GRNI entries are reversed once, skipping ones already reversed", () => {
  const out = entriesStillToReverse(
    [
      { id: "e1", date: "2026-10-01" },
      { id: "e2", date: "2026-10-01" },
      { id: "e1", date: "2026-10-01" },
    ],
    ["e2", null]
  );
  assert.deepEqual(out.map((e) => e.id), ["e1"]);
});
