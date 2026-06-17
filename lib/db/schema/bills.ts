import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  pgEnum,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";
import { contact } from "./contacts";
import { journalEntry, chartAccount, taxRate, costCenter } from "./bookkeeping";
import { inventoryItem, warehouse } from "./inventory";

export const billStatusEnum = pgEnum("bill_status", [
  "draft",
  "pending_approval",
  "received",
  "partial",
  "paid",
  "overdue",
  "void",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "sent",
  "partial",
  "received",
  "closed",
  "void",
]);

export const debitNoteStatusEnum = pgEnum("debit_note_status", [
  "draft",
  "sent",
  "applied",
  "void",
]);

export const requisitionStatusEnum = pgEnum("requisition_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "converted",
]);

export const landedCostAllocationMethodEnum = pgEnum("landed_cost_allocation_method", [
  "by_value",
  "by_quantity",
  "by_weight",
  "manual",
]);

export const landedCostStatusEnum = pgEnum("landed_cost_status", [
  "draft",
  "allocated",
]);

export const goodsReceiptStatusEnum = pgEnum("goods_receipt_status", [
  "draft",
  "received",
  "billed",
  "void",
]);

// Bill
export const bill = pgTable("bill", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contact.id),
  billNumber: text("bill_number").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: billStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  amountPaid: integer("amount_paid").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  receivedAt: timestamp("received_at", { mode: "date" }),
  paidAt: timestamp("paid_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  rejectedAt: timestamp("rejected_at", { mode: "date" }),
  rejectionReason: text("rejection_reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const billLine = pgTable("bill_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bill.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  discountPercent: integer("discount_percent").notNull().default(0), // basis points: 1000 = 10%
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  // When set, this line is a stock purchase: posts to the item's Inventory
  // account and increases on-hand qty/value instead of expensing.
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItem.id),
  warehouseId: uuid("warehouse_id").references(() => warehouse.id),
  goodsReceiptLineId: uuid("goods_receipt_line_id"),
  // Job-costing dimension (plain uuid; project lives in ./projects).
  projectId: uuid("project_id"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Purchase Order
export const purchaseOrder = pgTable("purchase_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contact.id),
  poNumber: text("po_number").notNull(),
  issueDate: date("issue_date").notNull(),
  deliveryDate: date("delivery_date"),
  status: purchaseOrderStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  convertedBillId: uuid("converted_bill_id"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const purchaseOrderLine = pgTable("purchase_order_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrder.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItem.id),
  warehouseId: uuid("warehouse_id").references(() => warehouse.id),
  // Running tallies for three-way match (qty x100 like quantity).
  quantityReceived: integer("quantity_received").notNull().default(0),
  quantityBilled: integer("quantity_billed").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Debit Note (purchase return - reduces AP)
export const debitNote = pgTable("debit_note", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contact.id),
  billId: uuid("bill_id").references(() => bill.id), // original bill, nullable
  debitNoteNumber: text("debit_note_number").notNull(),
  issueDate: date("issue_date").notNull(),
  status: debitNoteStatusEnum("status").notNull().default("draft"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  amountApplied: integer("amount_applied").notNull().default(0),
  amountRemaining: integer("amount_remaining").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  sentAt: timestamp("sent_at", { mode: "date" }),
  voidedAt: timestamp("voided_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const debitNoteLine = pgTable("debit_note_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  debitNoteId: uuid("debit_note_id").notNull().references(() => debitNote.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Purchase Requisition
export const purchaseRequisition = pgTable("purchase_requisition", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contact.id),
  requisitionNumber: text("requisition_number").notNull(),
  requestDate: date("request_date").notNull(),
  requiredDate: date("required_date"),
  status: requisitionStatusEnum("status").notNull().default("draft"),
  requestedBy: uuid("requested_by").references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  rejectedAt: timestamp("rejected_at", { mode: "date" }),
  rejectionReason: text("rejection_reason"),
  reference: text("reference"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  convertedPoId: uuid("converted_po_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const purchaseRequisitionLine = pgTable("purchase_requisition_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  requisitionId: uuid("requisition_id").notNull().references(() => purchaseRequisition.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100),
  unitPrice: integer("unit_price").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  taxAmount: integer("tax_amount").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Landed Cost Allocation
export const landedCostAllocation = pgTable("landed_cost_allocation", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  billId: uuid("bill_id").references(() => bill.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
  allocationMethod: landedCostAllocationMethodEnum("allocation_method").notNull().default("by_value"),
  status: landedCostStatusEnum("status").notNull().default("draft"),
  totalCostAmount: integer("total_cost_amount").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  allocatedAt: timestamp("allocated_at", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const landedCostComponent = pgTable("landed_cost_component", {
  id: uuid("id").primaryKey().defaultRandom(),
  allocationId: uuid("allocation_id").notNull().references(() => landedCostAllocation.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: integer("amount").notNull().default(0),
  accountId: uuid("account_id").references(() => chartAccount.id),
});

export const landedCostLineAllocation = pgTable("landed_cost_line_allocation", {
  id: uuid("id").primaryKey().defaultRandom(),
  allocationId: uuid("allocation_id").notNull().references(() => landedCostAllocation.id, { onDelete: "cascade" }),
  componentId: uuid("component_id").notNull().references(() => landedCostComponent.id, { onDelete: "cascade" }),
  purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLine.id),
  allocatedAmount: integer("allocated_amount").notNull().default(0),
  allocationBasis: integer("allocation_basis"), // value used for calculation
});

// Goods Receipt (GRN) — records physical receipt of goods, optionally
// against a purchase order. Posts to GRNI when stock lines are received.
export const goodsReceipt = pgTable("goods_receipt", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
  contactId: uuid("contact_id").notNull().references(() => contact.id),
  receiptNumber: text("receipt_number").notNull(),
  date: date("date").notNull(),
  status: goodsReceiptStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const goodsReceiptLine = pgTable("goods_receipt_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  goodsReceiptId: uuid("goods_receipt_id").notNull().references(() => goodsReceipt.id, { onDelete: "cascade" }),
  purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLine.id),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItem.id),
  warehouseId: uuid("warehouse_id").references(() => warehouse.id),
  description: text("description").notNull(),
  // Quantity received (x100 like other qty fields).
  quantityReceived: integer("quantity_received").notNull().default(0),
  // Unit cost in integer cents.
  unitCost: integer("unit_cost").notNull().default(0),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Bill <-> Purchase Order join — supports MULTIPLE bills per PO (and a bill
// drawing from multiple POs). The legacy purchaseOrder.convertedBillId remains
// for backward compatibility but new linkage should use this join table.
export const billPurchaseOrder = pgTable("bill_purchase_order", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bill.id, { onDelete: "cascade" }),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrder.id, { onDelete: "cascade" }),
}, (t) => ({
  uniqueBillPo: uniqueIndex("bill_purchase_order_bill_po_unique").on(t.billId, t.purchaseOrderId),
}));

// Procurement settings — per-org three-way-match tolerances and controls.
export const procurementSettings = pgTable("procurement_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().unique().references(() => organization.id, { onDelete: "cascade" }),
  // Tolerances in basis points (e.g. 500 = 5%).
  priceTolerancePercent: integer("price_tolerance_percent").notNull().default(0),
  qtyTolerancePercent: integer("qty_tolerance_percent").notNull().default(0),
  requireGrnBeforeBill: boolean("require_grn_before_bill").notNull().default(false),
  blockOverBill: boolean("block_over_bill").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const billRelations = relations(bill, ({ one, many }) => ({
  organization: one(organization, { fields: [bill.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [bill.contactId], references: [contact.id] }),
  journalEntry: one(journalEntry, { fields: [bill.journalEntryId], references: [journalEntry.id] }),
  createdByUser: one(users, { fields: [bill.createdBy], references: [users.id] }),
  lines: many(billLine),
  debitNotes: many(debitNote),
  purchaseOrders: many(billPurchaseOrder),
}));

export const billLineRelations = relations(billLine, ({ one }) => ({
  bill: one(bill, { fields: [billLine.billId], references: [bill.id] }),
  account: one(chartAccount, { fields: [billLine.accountId], references: [chartAccount.id] }),
  taxRate: one(taxRate, { fields: [billLine.taxRateId], references: [taxRate.id] }),
  costCenter: one(costCenter, { fields: [billLine.costCenterId], references: [costCenter.id] }),
}));

export const purchaseOrderRelations = relations(purchaseOrder, ({ one, many }) => ({
  organization: one(organization, { fields: [purchaseOrder.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [purchaseOrder.contactId], references: [contact.id] }),
  createdByUser: one(users, { fields: [purchaseOrder.createdBy], references: [users.id] }),
  lines: many(purchaseOrderLine),
  bills: many(billPurchaseOrder),
  goodsReceipts: many(goodsReceipt),
}));

export const purchaseOrderLineRelations = relations(purchaseOrderLine, ({ one }) => ({
  purchaseOrder: one(purchaseOrder, { fields: [purchaseOrderLine.purchaseOrderId], references: [purchaseOrder.id] }),
  account: one(chartAccount, { fields: [purchaseOrderLine.accountId], references: [chartAccount.id] }),
  taxRate: one(taxRate, { fields: [purchaseOrderLine.taxRateId], references: [taxRate.id] }),
  costCenter: one(costCenter, { fields: [purchaseOrderLine.costCenterId], references: [costCenter.id] }),
}));

export const debitNoteRelations = relations(debitNote, ({ one, many }) => ({
  organization: one(organization, { fields: [debitNote.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [debitNote.contactId], references: [contact.id] }),
  bill: one(bill, { fields: [debitNote.billId], references: [bill.id] }),
  journalEntry: one(journalEntry, { fields: [debitNote.journalEntryId], references: [journalEntry.id] }),
  createdByUser: one(users, { fields: [debitNote.createdBy], references: [users.id] }),
  lines: many(debitNoteLine),
}));

export const debitNoteLineRelations = relations(debitNoteLine, ({ one }) => ({
  debitNote: one(debitNote, { fields: [debitNoteLine.debitNoteId], references: [debitNote.id] }),
  account: one(chartAccount, { fields: [debitNoteLine.accountId], references: [chartAccount.id] }),
  taxRate: one(taxRate, { fields: [debitNoteLine.taxRateId], references: [taxRate.id] }),
  costCenter: one(costCenter, { fields: [debitNoteLine.costCenterId], references: [costCenter.id] }),
}));

export const purchaseRequisitionRelations = relations(purchaseRequisition, ({ one, many }) => ({
  organization: one(organization, { fields: [purchaseRequisition.organizationId], references: [organization.id] }),
  contact: one(contact, { fields: [purchaseRequisition.contactId], references: [contact.id] }),
  requestedByUser: one(users, { fields: [purchaseRequisition.requestedBy], references: [users.id], relationName: "requisitionRequester" }),
  approvedByUser: one(users, { fields: [purchaseRequisition.approvedBy], references: [users.id], relationName: "requisitionApprover" }),
  lines: many(purchaseRequisitionLine),
}));

export const purchaseRequisitionLineRelations = relations(purchaseRequisitionLine, ({ one }) => ({
  requisition: one(purchaseRequisition, { fields: [purchaseRequisitionLine.requisitionId], references: [purchaseRequisition.id] }),
  account: one(chartAccount, { fields: [purchaseRequisitionLine.accountId], references: [chartAccount.id] }),
  taxRate: one(taxRate, { fields: [purchaseRequisitionLine.taxRateId], references: [taxRate.id] }),
}));

export const landedCostAllocationRelations = relations(landedCostAllocation, ({ one, many }) => ({
  organization: one(organization, { fields: [landedCostAllocation.organizationId], references: [organization.id] }),
  bill: one(bill, { fields: [landedCostAllocation.billId], references: [bill.id] }),
  purchaseOrder: one(purchaseOrder, { fields: [landedCostAllocation.purchaseOrderId], references: [purchaseOrder.id] }),
  journalEntry: one(journalEntry, { fields: [landedCostAllocation.journalEntryId], references: [journalEntry.id] }),
  createdByUser: one(users, { fields: [landedCostAllocation.createdBy], references: [users.id] }),
  components: many(landedCostComponent),
  lineAllocations: many(landedCostLineAllocation),
}));

export const landedCostComponentRelations = relations(landedCostComponent, ({ one }) => ({
  allocation: one(landedCostAllocation, { fields: [landedCostComponent.allocationId], references: [landedCostAllocation.id] }),
  account: one(chartAccount, { fields: [landedCostComponent.accountId], references: [chartAccount.id] }),
}));

export const landedCostLineAllocationRelations = relations(landedCostLineAllocation, ({ one }) => ({
  allocation: one(landedCostAllocation, { fields: [landedCostLineAllocation.allocationId], references: [landedCostAllocation.id] }),
  component: one(landedCostComponent, { fields: [landedCostLineAllocation.componentId], references: [landedCostComponent.id] }),
  purchaseOrderLine: one(purchaseOrderLine, { fields: [landedCostLineAllocation.purchaseOrderLineId], references: [purchaseOrderLine.id] }),
}));

export const goodsReceiptRelations = relations(goodsReceipt, ({ one, many }) => ({
  organization: one(organization, { fields: [goodsReceipt.organizationId], references: [organization.id] }),
  purchaseOrder: one(purchaseOrder, { fields: [goodsReceipt.purchaseOrderId], references: [purchaseOrder.id] }),
  contact: one(contact, { fields: [goodsReceipt.contactId], references: [contact.id] }),
  createdByUser: one(users, { fields: [goodsReceipt.createdBy], references: [users.id] }),
  lines: many(goodsReceiptLine),
}));

export const goodsReceiptLineRelations = relations(goodsReceiptLine, ({ one }) => ({
  goodsReceipt: one(goodsReceipt, { fields: [goodsReceiptLine.goodsReceiptId], references: [goodsReceipt.id] }),
  purchaseOrderLine: one(purchaseOrderLine, { fields: [goodsReceiptLine.purchaseOrderLineId], references: [purchaseOrderLine.id] }),
  inventoryItem: one(inventoryItem, { fields: [goodsReceiptLine.inventoryItemId], references: [inventoryItem.id] }),
  warehouse: one(warehouse, { fields: [goodsReceiptLine.warehouseId], references: [warehouse.id] }),
  journalEntry: one(journalEntry, { fields: [goodsReceiptLine.journalEntryId], references: [journalEntry.id] }),
}));

export const billPurchaseOrderRelations = relations(billPurchaseOrder, ({ one }) => ({
  bill: one(bill, { fields: [billPurchaseOrder.billId], references: [bill.id] }),
  purchaseOrder: one(purchaseOrder, { fields: [billPurchaseOrder.purchaseOrderId], references: [purchaseOrder.id] }),
}));

export const procurementSettingsRelations = relations(procurementSettings, ({ one }) => ({
  organization: one(organization, { fields: [procurementSettings.organizationId], references: [organization.id] }),
}));
