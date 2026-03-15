import type { ColumnAlias } from "../types";

export const waveAccounts: ColumnAlias[] = [
  { targetField: "code", aliases: ["Account Number", "Number"] },
  { targetField: "name", aliases: ["Account Name", "Name"] },
  { targetField: "type", aliases: ["Account Type", "Type"] },
  { targetField: "subType", aliases: ["Account Sub-Type", "Sub Type"] },
  { targetField: "description", aliases: ["Description"] },
];

export const waveContacts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Customer Name", "Vendor Name", "Name", "Company Name", "First Name", "Last Name", "Display Name"] },
  { targetField: "email", aliases: ["Email"] },
  { targetField: "phone", aliases: ["Phone"] },
  { targetField: "type", aliases: ["Type", "Contact Type"] },
  { targetField: "taxNumber", aliases: ["Tax Number"] },
  { targetField: "billingLine1", aliases: ["Address Line 1", "Street"] },
  { targetField: "billingCity", aliases: ["City"] },
  { targetField: "billingState", aliases: ["Province/State", "State", "Province"] },
  { targetField: "billingPostalCode", aliases: ["Postal Code/Zip Code", "Postal Code", "Zip Code", "Zip"] },
  { targetField: "billingCountry", aliases: ["Country"] },
];

export const waveInvoices: ColumnAlias[] = [
  { targetField: "invoiceNumber", aliases: ["Invoice Number", "Number"] },
  { targetField: "contactName", aliases: ["Customer", "Customer Name"] },
  { targetField: "issueDate", aliases: ["Invoice Date", "Date"] },
  { targetField: "dueDate", aliases: ["Due Date"] },
  { targetField: "lineDescription", aliases: ["Description", "Product / Service", "Item", "Line Description"] },
  { targetField: "lineQuantity", aliases: ["Quantity"] },
  { targetField: "lineUnitPrice", aliases: ["Price", "Unit Price"] },
  { targetField: "lineAmount", aliases: ["Amount", "Line Total"] },
  { targetField: "lineAccountCode", aliases: ["Account", "Income Account"] },
];

export const waveBills: ColumnAlias[] = [
  { targetField: "billNumber", aliases: ["Bill Number", "Number", "Reference"] },
  { targetField: "contactName", aliases: ["Vendor", "Vendor Name"] },
  { targetField: "issueDate", aliases: ["Bill Date", "Date"] },
  { targetField: "dueDate", aliases: ["Due Date"] },
  { targetField: "lineDescription", aliases: ["Description", "Item", "Line Description"] },
  { targetField: "lineQuantity", aliases: ["Quantity"] },
  { targetField: "lineUnitPrice", aliases: ["Price", "Unit Price"] },
  { targetField: "lineAmount", aliases: ["Amount", "Line Total"] },
  { targetField: "lineAccountCode", aliases: ["Account", "Expense Account"] },
];

export const waveEntries: ColumnAlias[] = [
  { targetField: "entryNumber", aliases: ["Entry Number", "Number"] },
  { targetField: "date", aliases: ["Date", "Transaction Date"] },
  { targetField: "description", aliases: ["Description", "Memo"] },
  { targetField: "reference", aliases: ["Reference"] },
  { targetField: "lineAccountCode", aliases: ["Account", "Account Name"] },
  { targetField: "debit", aliases: ["Debit"] },
  { targetField: "credit", aliases: ["Credit"] },
];

export const waveProducts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Product Name", "Name"] },
  { targetField: "sku", aliases: ["SKU"] },
  { targetField: "description", aliases: ["Description"] },
  { targetField: "unitPrice", aliases: ["Price", "Sale Price"] },
  { targetField: "costPrice", aliases: ["Cost", "Purchase Price"] },
  { targetField: "type", aliases: ["Type"] },
  { targetField: "quantityOnHand", aliases: ["Quantity On Hand", "Stock"] },
];

export const waveBankTransactions: ColumnAlias[] = [
  { targetField: "date", aliases: ["Date", "Transaction Date"] },
  { targetField: "description", aliases: ["Description", "Payee"] },
  { targetField: "amount", aliases: ["Amount", "Net Amount"] },
  { targetField: "reference", aliases: ["Reference", "Check Number"] },
  { targetField: "bankAccountCode", aliases: ["Account", "Bank Account"] },
];
