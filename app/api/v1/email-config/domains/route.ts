import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { emailConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, error } from "@/lib/api/response";
import { decryptPassword } from "@/lib/email/smtp-client";
import { z } from "zod";

const createSchema = z.object({
  domain: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const config = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (!config || config.provider !== "resend" || !config.resendApiKey) {
      return error("Resend not configured. Switch to Resend provider first.", 400);
    }

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const apiKey = decryptPassword(config.resendApiKey);
    const resend = new Resend(apiKey);

    const { data, error: resendError } = await resend.domains.create({
      name: parsed.domain,
    });

    if (resendError) {
      return error(resendError.message, 400);
    }

    await db
      .update(emailConfig)
      .set({
        resendDomainId: data!.id,
        customDomain: parsed.domain,
        domainVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(emailConfig.id, config.id));

    return NextResponse.json({ domain: data }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const config = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (!config || config.provider !== "resend" || !config.resendApiKey || !config.resendDomainId) {
      return NextResponse.json({ domain: null });
    }

    const apiKey = decryptPassword(config.resendApiKey);
    const resend = new Resend(apiKey);

    const { data, error: resendError } = await resend.domains.get(config.resendDomainId);

    if (resendError) {
      return error(resendError.message, 400);
    }

    // Update verified status
    const verified = data!.status === "verified";
    if (verified !== config.domainVerified) {
      await db
        .update(emailConfig)
        .set({ domainVerified: verified, updatedAt: new Date() })
        .where(eq(emailConfig.id, config.id));
    }

    return NextResponse.json({ domain: data });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const config = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (!config || !config.resendApiKey || !config.resendDomainId) {
      return error("No custom domain configured", 400);
    }

    const apiKey = decryptPassword(config.resendApiKey);
    const resend = new Resend(apiKey);

    await resend.domains.remove(config.resendDomainId);

    await db
      .update(emailConfig)
      .set({
        resendDomainId: null,
        customDomain: null,
        domainVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(emailConfig.id, config.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
