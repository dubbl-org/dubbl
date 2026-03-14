import type { ColumnAlias } from "../types";

export const xeroAccounts: ColumnAlias[] = [
  { targetField: "code", aliases: ["Code", "Account Code", "*Code"] },
  { targetField: "name", aliases: ["Name", "Account Name", "*Name"] },
  { targetField: "type", aliases: ["Type", "Account Type", "*Type"] },
  { targetField: "subType", aliases: ["Tax Type", "Sub Type"] },
  { targetField: "description", aliases: ["Description"] },
];

export const xeroContacts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Contact Name", "Name", "*Contact Name"] },
  { targetField: "email", aliases: ["Email", "Email Address"] },
  { targetField: "phone", aliases: ["Phone", "Phone Number"] },
  { targetField: "type", aliases: ["Contact Type", "Type"] },
  { targetField: "taxNumber", aliases: ["Tax Number", "ABN", "VAT Number"] },
  { targetField: "billingLine1", aliases: ["Billing Address 1", "POAddressLine1", "Street Address"] },
  { targetField: "billingCity", aliases: ["Billing City", "POCity", "City"] },
  { targetField: "billingState", aliases: ["Billing Region", "PORegion", "State"] },
  { targetField: "billingPostalCode", aliases: ["Billing Post Code", "POPostalCode", "Post Code"] },
  { targetField: "billingCountry", aliases: ["Billing Country", "POCountry", "Country"] },
];

export const xeroInvoices: ColumnAlias[] = [
  { targetField: "invoiceNumber", aliases: ["Invoice Number", "InvoiceNumber", "*InvoiceNumber"] },
  { targetField: "contactName", aliases: ["Contact", "ContactName", "*ContactName"] },
  { targetField: "issueDate", aliases: ["Invoice Date", "InvoiceDate", "*InvoiceDate"] },
  { targetField: "dueDate", aliases: ["Due Date", "DueDate", "*DueDate"] },
  { targetField: "lineDescription", aliases: ["Description"] },
  { targetField: "lineQuantity", aliases: ["Quantity"] },
  { targetField: "lineUnitPrice", aliases: ["Unit Amount", "UnitAmount"] },
  { targetField: "lineAmount", aliases: ["Line Amount", "LineAmount"] },
  { targetField: "lineAccountCode", aliases: ["Account Code", "AccountCode"] },
];

export const xeroBills: ColumnAlias[] = [
  { targetField: "billNumber", aliases: ["Invoice Number", "InvoiceNumber", "Bill Number"] },
  { targetField: "contactName", aliases: ["Contact", "ContactName", "*ContactName"] },
  { targetField: "issueDate", aliases: ["Invoice Date", "InvoiceDate", "Date"] },
  { targetField: "dueDate", aliases: ["Due Date", "DueDate"] },
  { targetField: "lineDescription", aliases: ["Description"] },
  { targetField: "lineQuantity", aliases: ["Quantity"] },
  { targetField: "lineUnitPrice", aliases: ["Unit Amount", "UnitAmount"] },
  { targetField: "lineAmount", aliases: ["Line Amount", "LineAmount"] },
  { targetField: "lineAccountCode", aliases: ["Account Code", "AccountCode"] },
];

export const xeroEntries: ColumnAlias[] = [
  { targetField: "entryNumber", aliases: ["Journal Number", "JournalNumber"] },
  { targetField: "date", aliases: ["Date", "JournalDate"] },
  { targetField: "description", aliases: ["Description", "Narration"] },
  { targetField: "reference", aliases: ["Reference"] },
  { targetField: "lineAccountCode", aliases: ["Account Code", "AccountCode"] },
  { targetField: "debit", aliases: ["Debit Amount", "Debit", "NetAmount"] },
  { targetField: "credit", aliases: ["Credit Amount", "Credit"] },
];

export const xeroProducts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Item Name", "Name", "*Name"] },
  { targetField: "sku", aliases: ["Item Code", "Code", "*Code"] },
  { targetField: "description", aliases: ["Description", "Sales Description"] },
  { targetField: "unitPrice", aliases: ["Sales Unit Price", "Unit Price"] },
  { targetField: "costPrice", aliases: ["Purchase Unit Price", "Cost Price"] },
  { targetField: "type", aliases: ["Item Type", "Type"] },
  { targetField: "quantityOnHand", aliases: ["Quantity On Hand", "QOH"] },
];

export const xeroBankTransactions: ColumnAlias[] = [
  { targetField: "date", aliases: ["Date"] },
  { targetField: "description", aliases: ["Description", "Payee", "Reference"] },
  { targetField: "amount", aliases: ["Amount", "Total"] },
  { targetField: "reference", aliases: ["Reference", "Cheque Number"] },
  { targetField: "bankAccountCode", aliases: ["Bank Account", "Account Code"] },
];
