import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const subscribeSchema = z.object({
  hookUrl: z.string().url(),
  events: z.array(z.string()).min(1),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = subscribeSchema.parse(body);

    const secret = crypto.randomBytes(32).toString("hex");

    const [created] = await db
      .insert(webhook)
      .values({
        organizationId: ctx.organizationId,
        url: parsed.hookUrl,
        events: parsed.events,
        secret,
        isActive: true,
        metadata: { source: "zapier" },
      })
      .returning();

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
