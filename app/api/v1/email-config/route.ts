import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { encryptPassword, verifyConnection } from "@/lib/email/smtp-client";
import { verifyResendKey } from "@/lib/email/resend-client";
import { z } from "zod";

const upsertSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("smtp"),
    smtpHost: z.string().min(1),
    smtpPort: z.number().int().default(587),
    smtpUsername: z.string().min(1),
    smtpPassword: z.string().min(1),
    fromEmail: z.string().email(),
    fromName: z.string().nullable().optional(),
    replyTo: z.string().email().nullable().optional(),
    useTls: z.boolean().default(true),
  }),
  z.object({
    provider: z.literal("resend"),
    resendApiKey: z.string().min(1),
    fromEmail: z.string().email(),
    fromName: z.string().nullable().optional(),
    replyTo: z.string().email().nullable().optional(),
  }),
]);

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const config = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    return NextResponse.json({ emailConfig: config || null });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const body = await request.json();
    const parsed = upsertSchema.parse(body);

    const existing = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (parsed.provider === "smtp") {
      const encryptedPassword = encryptPassword(parsed.smtpPassword);

      const isVerified = await verifyConnection({
        smtpHost: parsed.smtpHost,
        smtpPort: parsed.smtpPort,
        smtpUsername: parsed.smtpUsername,
        smtpPassword: encryptedPassword,
        fromEmail: parsed.fromEmail,
        fromName: parsed.fromName || null,
        replyTo: parsed.replyTo || null,
        useTls: parsed.useTls,
      });

      const values = {
        provider: "smtp" as const,
        smtpHost: parsed.smtpHost,
        smtpPort: parsed.smtpPort,
        smtpUsername: parsed.smtpUsername,
        smtpPassword: encryptedPassword,
        resendApiKey: null,
        resendDomainId: null,
        customDomain: null,
        domainVerified: false,
        fromEmail: parsed.fromEmail,
        fromName: parsed.fromName || null,
        replyTo: parsed.replyTo || null,
        useTls: parsed.useTls,
        isVerified,
        updatedAt: new Date(),
      };

      if (existing) {
        const [updated] = await db
          .update(emailConfig)
          .set(values)
          .where(eq(emailConfig.id, existing.id))
          .returning();
        return NextResponse.json({ emailConfig: updated });
      } else {
        const [created] = await db
          .insert(emailConfig)
          .values({ ...values, organizationId: ctx.organizationId })
          .returning();
        return NextResponse.json({ emailConfig: created }, { status: 201 });
      }
    } else {
      // Resend provider
      const encryptedKey = encryptPassword(parsed.resendApiKey);
      const isVerified = await verifyResendKey(parsed.resendApiKey);

      const values = {
        provider: "resend" as const,
        smtpHost: null,
        smtpPort: null,
        smtpUsername: null,
        smtpPassword: null,
        resendApiKey: encryptedKey,
        fromEmail: parsed.fromEmail,
        fromName: parsed.fromName || null,
        replyTo: parsed.replyTo || null,
        useTls: true,
        isVerified,
        updatedAt: new Date(),
      };

      if (existing) {
        const [updated] = await db
          .update(emailConfig)
          .set(values)
          .where(eq(emailConfig.id, existing.id))
          .returning();
        return NextResponse.json({ emailConfig: updated });
      } else {
        const [created] = await db
          .insert(emailConfig)
          .values({ ...values, organizationId: ctx.organizationId })
          .returning();
        return NextResponse.json({ emailConfig: created }, { status: 201 });
      }
    }
  } catch (err) {
    return handleError(err);
  }
}
