import type { ColumnAlias } from "../types";

export const freshbooksAccounts: ColumnAlias[] = [
  { targetField: "code", aliases: ["Account Number", "Number"] },
  { targetField: "name", aliases: ["Account Name", "Name"] },
  { targetField: "type", aliases: ["Account Type", "Type", "Parent Type"] },
  { targetField: "subType", aliases: ["Sub Type", "Account Sub Type"] },
  { targetField: "description", aliases: ["Description"] },
];

export const freshbooksContacts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Organization", "Client Name", "Vendor Name", "Display Name", "Company Name", "First Name", "Last Name"] },
  { targetField: "email", aliases: ["Email", "Email Address"] },
  { targetField: "phone", aliases: ["Phone", "Work Phone", "Phone Number"] },
  { targetField: "type", aliases: ["Type"] },
  { targetField: "taxNumber", aliases: ["Tax Number", "VAT Number"] },
  { targetField: "billingLine1", aliases: ["Street", "Street Address", "Address Line 1"] },
  { targetField: "billingCity", aliases: ["City"] },
  { targetField: "billingState", aliases: ["Province", "State"] },
  { targetField: "billingPostalCode", aliases: ["Postal Code", "Zip", "Zip Code"] },
  { targetField: "billingCountry", aliases: ["Country"] },
];

export const freshbooksInvoices: ColumnAlias[] = [
  { targetField: "invoiceNumber", aliases: ["Invoice Number", "Number"] },
  { targetField: "contactName", aliases: ["Client", "Customer Name", "Client Name"] },
  { targetField: "issueDate", aliases: ["Date Created", "Invoice Date", "Date", "Create Date"] },
  { targetField: "dueDate", aliases: ["Date Due", "Due Date"] },
  { targetField: "lineDescription", aliases: ["Item Name", "Description", "Line Description"] },
  { targetField: "lineQuantity", aliases: ["Quantity", "Qty"] },
  { targetField: "lineUnitPrice", aliases: ["Rate", "Unit Cost"] },
  { targetField: "lineAmount", aliases: ["Line Total", "Amount"] },
  { targetField: "lineAccountCode", aliases: ["Category", "Account"] },
];

export const freshbooksBills: ColumnAlias[] = [
  { targetField: "billNumber", aliases: ["Bill Number", "Number", "Reference"] },
  { targetField: "contactName", aliases: ["Vendor", "Vendor Name"] },
  { targetField: "issueDate", aliases: ["Date", "Bill Date"] },
  { targetField: "dueDate", aliases: ["Due Date"] },
  { targetField: "lineDescription", aliases: ["Description", "Line Description"] },
  { targetField: "lineQuantity", aliases: ["Quantity", "Qty"] },
  { targetField: "lineUnitPrice", aliases: ["Rate", "Unit Cost"] },
  { targetField: "lineAmount", aliases: ["Amount", "Line Total"] },
  { targetField: "lineAccountCode", aliases: ["Category", "Account"] },
];

export const freshbooksEntries: ColumnAlias[] = [
  { targetField: "entryNumber", aliases: ["Entry Number", "Number"] },
  { targetField: "date", aliases: ["Date"] },
  { targetField: "description", aliases: ["Description", "Memo"] },
  { targetField: "reference", aliases: ["Reference"] },
  { targetField: "lineAccountCode", aliases: ["Account", "Account Name"] },
  { targetField: "debit", aliases: ["Debit"] },
  { targetField: "credit", aliases: ["Credit"] },
];

export const freshbooksProducts: ColumnAlias[] = [
  { targetField: "name", aliases: ["Item Name", "Name"] },
  { targetField: "sku", aliases: ["SKU", "Code"] },
  { targetField: "description", aliases: ["Description"] },
  { targetField: "unitPrice", aliases: ["Rate", "Unit Cost"] },
  { targetField: "costPrice", aliases: ["Cost", "Buy Cost"] },
  { targetField: "type", aliases: ["Type"] },
  { targetField: "quantityOnHand", aliases: ["Quantity", "Stock"] },
];

export const freshbooksBankTransactions: ColumnAlias[] = [
  { targetField: "date", aliases: ["Date", "Transaction Date"] },
  { targetField: "description", aliases: ["Description", "Payee"] },
  { targetField: "amount", aliases: ["Amount", "Total"] },
  { targetField: "reference", aliases: ["Reference", "Check Number"] },
  { targetField: "bankAccountCode", aliases: ["Account", "Bank Account"] },
  { targetField: "debit", aliases: ["Amount Spent"] },
  { targetField: "credit", aliases: ["Amount Earned"] },
];
