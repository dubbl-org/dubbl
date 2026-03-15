import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  chartAccount, contact, invoice, bill,
  journalEntry, inventoryItem, bankTransaction, bankAccount,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";

// Simple ZIP implementation using store method (no compression) for browser compatibility
function createZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const entries: Array<{ name: Uint8Array; data: Uint8Array; offset: number }> = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;

    // Local file header
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression (store)
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, 0, true); // crc32 (skipped for simplicity)
    view.setUint32(18, data.length, true); // compressed size
    view.setUint32(22, data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true); // name length
    view.setUint16(28, 0, true); // extra length
    header.set(nameBytes, 30);

    entries.push({ name: nameBytes, data, offset });
    parts.push(header, data);
    offset += header.length + data.length;
  }

  // Central directory
  const centralStart = offset;
  for (const entry of entries) {
    const cd = new Uint8Array(46 + entry.name.length);
    const view = new DataView(cd.buffer);
    view.setUint32(0, 0x02014b50, true); // signature
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed
    view.setUint16(8, 0, true); // flags
    view.setUint16(10, 0, true); // compression
    view.setUint16(12, 0, true); // mod time
    view.setUint16(14, 0, true); // mod date
    view.setUint32(16, 0, true); // crc32
    view.setUint32(20, entry.data.length, true); // compressed size
    view.setUint32(24, entry.data.length, true); // uncompressed size
    view.setUint16(28, entry.name.length, true); // name length
    view.setUint16(30, 0, true); // extra length
    view.setUint16(32, 0, true); // comment length
    view.setUint16(34, 0, true); // disk start
    view.setUint16(36, 0, true); // internal attrs
    view.setUint32(38, 0, true); // external attrs
    view.setUint32(42, entry.offset, true); // local header offset
    cd.set(entry.name, 46);

    parts.push(cd);
    offset += cd.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // signature
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // central dir disk
  eocdView.setUint16(8, entries.length, true); // entries on disk
  eocdView.setUint16(10, entries.length, true); // total entries
  eocdView.setUint32(12, offset - centralStart, true); // central dir size
  eocdView.setUint32(16, centralStart, true); // central dir offset
  eocdView.setUint16(20, 0, true); // comment length
  parts.push(eocd);

  // Concatenate all parts
  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const encoder = new TextEncoder();
    const csvFiles: Array<{ name: string; data: Uint8Array }> = [];

    // Accounts
    const accounts = await db.query.chartAccount.findMany({
      where: and(eq(chartAccount.organizationId, ctx.organizationId), notDeleted(chartAccount.deletedAt)),
    });
    csvFiles.push({
      name: "accounts.csv",
      data: encoder.encode(generateCSV(
        accounts.map(a => ({
          code: a.code, name: a.name, type: a.type,
          subType: a.subType || "", description: a.description || "",
          isActive: a.isActive ? "true" : "false",
        })),
        ["code", "name", "type", "subType", "description", "isActive"]
      )),
    });

    // Contacts
    const contacts = await db.query.contact.findMany({
      where: and(eq(contact.organizationId, ctx.organizationId), notDeleted(contact.deletedAt)),
    });
    csvFiles.push({
      name: "contacts.csv",
      data: encoder.encode(generateCSV(
        contacts.map(c => ({
          name: c.name, email: c.email || "", phone: c.phone || "",
          type: c.type, taxNumber: c.taxNumber || "",
        })),
        ["name", "email", "phone", "type", "taxNumber"]
      )),
    });

    // Invoices
    const invoices = await db.query.invoice.findMany({
      where: and(eq(invoice.organizationId, ctx.organizationId), notDeleted(invoice.deletedAt)),
      with: { contact: true, lines: true },
    });
    const invoiceRows: Record<string, unknown>[] = [];
    for (const inv of invoices) {
      if (inv.lines?.length) {
        for (const line of inv.lines) {
          invoiceRows.push({
            invoiceNumber: inv.invoiceNumber, contactName: inv.contact?.name || "",
            date: inv.issueDate, dueDate: inv.dueDate, status: inv.status,
            lineDescription: line.description, lineAmount: centsToDecimal(line.amount),
          });
        }
      } else {
        invoiceRows.push({
          invoiceNumber: inv.invoiceNumber, contactName: inv.contact?.name || "",
          date: inv.issueDate, dueDate: inv.dueDate, status: inv.status,
          lineDescription: "", lineAmount: centsToDecimal(inv.total),
        });
      }
    }
    csvFiles.push({
      name: "invoices.csv",
      data: encoder.encode(generateCSV(invoiceRows,
        ["invoiceNumber", "contactName", "date", "dueDate", "status", "lineDescription", "lineAmount"]
      )),
    });

    // Bills
    const bills = await db.query.bill.findMany({
      where: and(eq(bill.organizationId, ctx.organizationId), notDeleted(bill.deletedAt)),
      with: { contact: true, lines: true },
    });
    const billRows: Record<string, unknown>[] = [];
    for (const b of bills) {
      if (b.lines?.length) {
        for (const line of b.lines) {
          billRows.push({
            billNumber: b.billNumber, contactName: b.contact?.name || "",
            date: b.issueDate, dueDate: b.dueDate, status: b.status,
            lineDescription: line.description, lineAmount: centsToDecimal(line.amount),
          });
        }
      } else {
        billRows.push({
          billNumber: b.billNumber, contactName: b.contact?.name || "",
          date: b.issueDate, dueDate: b.dueDate, status: b.status,
          lineDescription: "", lineAmount: centsToDecimal(b.total),
        });
      }
    }
    csvFiles.push({
      name: "bills.csv",
      data: encoder.encode(generateCSV(billRows,
        ["billNumber", "contactName", "date", "dueDate", "status", "lineDescription", "lineAmount"]
      )),
    });

    // Journal Entries
    const entries = await db.query.journalEntry.findMany({
      where: and(eq(journalEntry.organizationId, ctx.organizationId), notDeleted(journalEntry.deletedAt)),
      with: { lines: { with: { account: true } } },
    });
    const entryRows: Record<string, unknown>[] = [];
    for (const entry of entries) {
      for (const line of entry.lines || []) {
        entryRows.push({
          entryNumber: entry.entryNumber, date: entry.date,
          description: entry.description, reference: entry.reference || "",
          lineAccountCode: line.account?.code || "",
          debit: line.debitAmount > 0 ? centsToDecimal(line.debitAmount) : "",
          credit: line.creditAmount > 0 ? centsToDecimal(line.creditAmount) : "",
        });
      }
    }
    csvFiles.push({
      name: "journal-entries.csv",
      data: encoder.encode(generateCSV(entryRows,
        ["entryNumber", "date", "description", "reference", "lineAccountCode", "debit", "credit"]
      )),
    });

    // Products
    const products = await db.query.inventoryItem.findMany({
      where: and(eq(inventoryItem.organizationId, ctx.organizationId), notDeleted(inventoryItem.deletedAt)),
    });
    csvFiles.push({
      name: "products.csv",
      data: encoder.encode(generateCSV(
        products.map(p => ({
          name: p.name, sku: p.sku || "", description: p.description || "",
          unitPrice: centsToDecimal(p.salePrice), costPrice: centsToDecimal(p.purchasePrice),
          quantityOnHand: p.quantityOnHand,
        })),
        ["name", "sku", "description", "unitPrice", "costPrice", "quantityOnHand"]
      )),
    });

    // Bank Transactions
    const bankAccounts = await db.query.bankAccount.findMany({
      where: eq(bankAccount.organizationId, ctx.organizationId),
      columns: { id: true, accountName: true },
    });
    const baMap = new Map(bankAccounts.map(ba => [ba.id, ba.accountName]));
    const txnRows: Record<string, unknown>[] = [];
    for (const ba of bankAccounts) {
      const txns = await db.query.bankTransaction.findMany({
        where: eq(bankTransaction.bankAccountId, ba.id),
      });
      for (const t of txns) {
        txnRows.push({
          date: t.date, description: t.description,
          amount: centsToDecimal(t.amount), reference: t.reference || "",
          bankAccountName: baMap.get(t.bankAccountId) || "",
          reconciled: t.status === "reconciled" ? "true" : "false",
        });
      }
    }
    csvFiles.push({
      name: "bank-transactions.csv",
      data: encoder.encode(generateCSV(txnRows,
        ["date", "description", "amount", "reference", "bankAccountName", "reconciled"]
      )),
    });

    const zipData = createZip(csvFiles);
    return new NextResponse(zipData.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=dubbl-export.zip",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
