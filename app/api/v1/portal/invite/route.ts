import { db } from "@/lib/db";
import { portalAccessToken } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { created, handleError } from "@/lib/api/response";
import { z } from "zod";
import { randomBytes } from "crypto";

const schema = z.object({
  contactId: z.string().uuid(),
  expiresInDays: z.number().min(1).max(365).optional().default(30),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const parsed = schema.parse(body);

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parsed.expiresInDays);

    const [access] = await db
      .insert(portalAccessToken)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        token,
        expiresAt,
      })
      .returning();

    return created({
      access,
      portalUrl: `/portal/${token}`,
    });
  } catch (err) {
    return handleError(err);
  }
}
