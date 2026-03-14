import type { SourceSystem, ImportEntity, ColumnAlias } from "../types";
import * as qb from "./quickbooks";
import * as xero from "./xero";
import * as fb from "./freshbooks";
import * as wave from "./wave";

type MappingRegistry = Record<string, ColumnAlias[]>;

const registry: MappingRegistry = {
  // QuickBooks
  "quickbooks:accounts": qb.quickbooksAccounts,
  "quickbooks:contacts": qb.quickbooksContacts,
  "quickbooks:invoices": qb.quickbooksInvoices,
  "quickbooks:bills": qb.quickbooksBills,
  "quickbooks:entries": qb.quickbooksEntries,
  "quickbooks:products": qb.quickbooksProducts,
  "quickbooks:bank-transactions": qb.quickbooksBankTransactions,

  // Xero
  "xero:accounts": xero.xeroAccounts,
  "xero:contacts": xero.xeroContacts,
  "xero:invoices": xero.xeroInvoices,
  "xero:bills": xero.xeroBills,
  "xero:entries": xero.xeroEntries,
  "xero:products": xero.xeroProducts,
  "xero:bank-transactions": xero.xeroBankTransactions,

  // FreshBooks
  "freshbooks:accounts": fb.freshbooksAccounts,
  "freshbooks:contacts": fb.freshbooksContacts,
  "freshbooks:invoices": fb.freshbooksInvoices,
  "freshbooks:bills": fb.freshbooksBills,
  "freshbooks:entries": fb.freshbooksEntries,
  "freshbooks:products": fb.freshbooksProducts,
  "freshbooks:bank-transactions": fb.freshbooksBankTransactions,

  // Wave
  "wave:accounts": wave.waveAccounts,
  "wave:contacts": wave.waveContacts,
  "wave:invoices": wave.waveInvoices,
  "wave:bills": wave.waveBills,
  "wave:entries": wave.waveEntries,
  "wave:products": wave.waveProducts,
  "wave:bank-transactions": wave.waveBankTransactions,
};

/**
 * Get column aliases for a source/entity combination.
 * Returns empty array for "custom" source or unknown combos.
 */
export function getMapping(source: SourceSystem, entity: ImportEntity): ColumnAlias[] {
  if (source === "custom") return [];
  return registry[`${source}:${entity}`] || [];
}

/**
 * Convert ColumnAlias[] to a Record<targetField, aliases[]> for
 * passing to the BulkImportWizard component.
 */
export function aliasesToRecord(aliases: ColumnAlias[]): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const a of aliases) {
    record[a.targetField] = a.aliases;
  }
  return record;
}
