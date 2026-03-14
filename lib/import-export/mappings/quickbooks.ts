import type { ColumnAlias } from "../types";

export const quickbooksAccounts: ColumnAlias[] = [
  { targetField: "code", aliases: ["Account #", "Account Number", "AcctNum"] },
  { targetField: "name", aliases: ["Account Name", "Account", "Name"] },
  { targetField: "type", aliases: ["Account Type", "Type"] },
  { targetField: "subType", aliases: ["Detail Type", "Sub Type"] },
  { targetField: "description", aliases: ["Description", "Desc"] },
];

export const quickbooksContacts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Customer", "Vendor", "Display Name", "Company"] },
  { targetField: "email", aliases: ["Email", "Main Email", "Primary Email"] },
  { targetField: "phone", aliases: ["Phone", "Main Phone", "Primary Phone"] },
  { targetField: "type", aliases: ["Type", "Contact Type"] },
  { targetField: "taxNumber", aliases: ["Tax ID", "Tax Reg. No.", "Business Number"] },
  { targetField: "billingLine1", aliases: ["Billing Street", "Bill to Street", "Address"] },
  { targetField: "billingCity", aliases: ["Billing City", "Bill to City", "City"] },
  { targetField: "billingState", aliases: ["Billing State", "Bill to State", "State"] },
  { targetField: "billingPostalCode", aliases: ["Billing Zip", "Bill to Zip", "Postal Code"] },
  { targetField: "billingCountry", aliases: ["Billing Country", "Bill to Country", "Country"] },
];

export const quickbooksInvoices: ColumnAlias[] = [
  { targetField: "invoiceNumber", aliases: ["Invoice No", "Invoice #", "Num", "DocNumber"] },
  { targetField: "contactName", aliases: ["Customer", "Client", "Name"] },
  { targetField: "issueDate", aliases: ["Invoice Date", "Date", "Txn Date"] },
  { targetField: "dueDate", aliases: ["Due Date"] },
  { targetField: "lineDescription", aliases: ["Item Description", "Description", "Memo"] },
  { targetField: "lineQuantity", aliases: ["Quantity", "Qty"] },
  { targetField: "lineUnitPrice", aliases: ["Rate", "Unit Price", "Price"] },
  { targetField: "lineAmount", aliases: ["Amount", "Line Total"] },
  { targetField: "lineAccountCode", aliases: ["Account", "Income Account"] },
];

export const quickbooksBills: ColumnAlias[] = [
  { targetField: "billNumber", aliases: ["Bill No", "Ref No", "Num", "DocNumber"] },
  { targetField: "contactName", aliases: ["Vendor", "Supplier", "Name"] },
  { targetField: "issueDate", aliases: ["Bill Date", "Date", "Txn Date"] },
  { targetField: "dueDate", aliases: ["Due Date"] },
  { targetField: "lineDescription", aliases: ["Item Description", "Description", "Memo"] },
  { targetField: "lineQuantity", aliases: ["Quantity", "Qty"] },
  { targetField: "lineUnitPrice", aliases: ["Rate", "Unit Price", "Cost"] },
  { targetField: "lineAmount", aliases: ["Amount", "Line Total"] },
  { targetField: "lineAccountCode", aliases: ["Account", "Expense Account"] },
];

export const quickbooksEntries: ColumnAlias[] = [
  { targetField: "entryNumber", aliases: ["Entry No", "Trans #", "Num"] },
  { targetField: "date", aliases: ["Date", "Trans Date"] },
  { targetField: "description", aliases: ["Memo", "Description"] },
  { targetField: "reference", aliases: ["Ref Number", "Reference"] },
  { targetField: "lineAccountCode", aliases: ["Account", "Account Name"] },
  { targetField: "debit", aliases: ["Debit", "Debit Amount"] },
  { targetField: "credit", aliases: ["Credit", "Credit Amount"] },
];

export const quickbooksProducts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Item Name", "Product/Service", "Name"] },
  { targetField: "sku", aliases: ["SKU", "Item Code"] },
  { targetField: "description", aliases: ["Description", "Sales Description"] },
  { targetField: "unitPrice", aliases: ["Sales Price", "Rate", "Price"] },
  { targetField: "costPrice", aliases: ["Cost", "Purchase Cost", "Expense Cost"] },
  { targetField: "type", aliases: ["Type", "Item Type"] },
  { targetField: "quantityOnHand", aliases: ["Quantity On Hand", "Qty on Hand", "QOH"] },
];

export const quickbooksBankTransactions: ColumnAlias[] = [
  { targetField: "date", aliases: ["Date", "Trans Date", "Txn Date"] },
  { targetField: "description", aliases: ["Description", "Memo", "Payee"] },
  { targetField: "amount", aliases: ["Amount", "Net Amount"] },
  { targetField: "reference", aliases: ["Reference", "Check No", "Ref No"] },
  { targetField: "bankAccountCode", aliases: ["Account", "Bank Account"] },
];
