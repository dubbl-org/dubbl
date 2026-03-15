import {
  contact,
  invoice,
  bill,
  chartAccount,
  journalEntry,
  inventoryItem,
  expenseClaim,
  quote,
  creditNote,
  debitNote,
  purchaseOrder,
  bankAccount,
  payment,
  recurringTemplate,
  project,
  fixedAsset,
  budget,
  loan,
  document,
  documentTemplate,
  dataBackup,
} from "@/lib/db/schema";
import type { PgTable } from "drizzle-orm/pg-core";

export interface TrashableEntity {
  type: string;
  label: string;
  table: PgTable;
  nameCol: string;
  permission: string;
}

export const TRASHABLE_ENTITIES: TrashableEntity[] = [
  { type: "contact", label: "Contact", table: contact, nameCol: "name", permission: "manage:contacts" },
  { type: "invoice", label: "Invoice", table: invoice, nameCol: "invoiceNumber", permission: "manage:invoices" },
  { type: "bill", label: "Bill", table: bill, nameCol: "billNumber", permission: "manage:bills" },
  { type: "account", label: "Account", table: chartAccount, nameCol: "name", permission: "manage:accounts" },
  { type: "journal_entry", label: "Journal Entry", table: journalEntry, nameCol: "description", permission: "manage:accounts" },
  { type: "product", label: "Product", table: inventoryItem, nameCol: "name", permission: "manage:inventory" },
  { type: "expense", label: "Expense", table: expenseClaim, nameCol: "description", permission: "manage:expenses" },
  { type: "quote", label: "Quote", table: quote, nameCol: "quoteNumber", permission: "manage:invoices" },
  { type: "credit_note", label: "Credit Note", table: creditNote, nameCol: "creditNoteNumber", permission: "manage:credit-notes" },
  { type: "debit_note", label: "Debit Note", table: debitNote, nameCol: "debitNoteNumber", permission: "manage:debit-notes" },
  { type: "purchase_order", label: "Purchase Order", table: purchaseOrder, nameCol: "poNumber", permission: "manage:bills" },
  { type: "bank_account", label: "Bank Account", table: bankAccount, nameCol: "accountName", permission: "manage:banking" },
  { type: "payment", label: "Payment", table: payment, nameCol: "paymentNumber", permission: "manage:payments" },
  { type: "recurring_template", label: "Recurring Template", table: recurringTemplate, nameCol: "name", permission: "manage:recurring" },
  { type: "project", label: "Project", table: project, nameCol: "name", permission: "manage:projects" },
  { type: "fixed_asset", label: "Fixed Asset", table: fixedAsset, nameCol: "name", permission: "manage:assets" },
  { type: "budget", label: "Budget", table: budget, nameCol: "name", permission: "manage:budgets" },
  { type: "loan", label: "Loan", table: loan, nameCol: "name", permission: "manage:banking" },
  { type: "document", label: "Document", table: document, nameCol: "fileName", permission: "view:data" },
  { type: "document_template", label: "Template", table: documentTemplate, nameCol: "name", permission: "manage:invoices" },
  { type: "data_backup", label: "Backup", table: dataBackup, nameCol: "type", permission: "delete:organization" },
];

export function getTrashEntity(type: string): TrashableEntity | undefined {
  return TRASHABLE_ENTITIES.find((e) => e.type === type);
}
