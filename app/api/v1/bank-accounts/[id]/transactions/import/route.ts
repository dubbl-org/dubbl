import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  commitBankStatementImport,
  previewBankStatementImport,
} from "@/lib/banking/importer";
import { z } from "zod";

const importSchema = z.object({
  mode: z.enum(["preview", "commit"]).default("commit"),
  fileName: z.string().nullable().optional(),
  content: z.string().min(1).optional(),
  format: z
    .enum([
      "csv",
      "tsv",
      "qif",
      "ofx",
      "qfx",
      "qbo",
      "camt052",
      "camt053",
      "camt054",
      "mt940",
      "mt942",
      "bai2",
    ])
    .nullable()
    .optional(),
  csv: z.string().optional(),
  mapping: z
    .object({
      date: z.string().optional(),
      description: z.string().optional(),
      amount: z.string().optional(),
      debit: z.string().optional(),
      credit: z.string().optional(),
      balance: z.string().optional(),
      reference: z.string().optional(),
      payee: z.string().optional(),
      counterparty: z.string().optional(),
    })
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Verify bank account belongs to organization
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank account");

    const body = importSchema.parse(await request.json());
    const content = body.content || body.csv;

    if (!content) {
      return validationError("Statement content is required");
    }

    if (body.mode === "preview") {
      const preview = await previewBankStatementImport(id, {
        fileName: body.fileName,
        content,
        format: body.format,
        mapping: body.mapping,
      });
      return NextResponse.json({ preview });
    }

    const result = await commitBankStatementImport(ctx.organizationId, id, {
      fileName: body.fileName,
      content,
      format: body.format,
      mapping: body.mapping,
    });

    await logAudit({ ctx, action: "import", entityType: "bank_transaction", entityId: ctx.organizationId,
      changes: { count: result.imported, importId: result.importId, format: result.format, fileName: body.fileName, duplicates: result.duplicateCount }, request });

    return NextResponse.json({ import: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
