import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";
import { getAllSiteSettings, setSiteSetting } from "@/lib/site-settings";
import { z } from "zod";

export async function GET() {
  const result = await requireSiteAdmin();
  if (result instanceof NextResponse) return result;

  const settings = await getAllSiteSettings();

  return NextResponse.json({
    settings,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
  });
}

const updateSchema = z.object({
  registration_mode: z
    .enum(["open", "invite_only", "disabled"])
    .optional(),
  allowed_email_domains: z.string().optional(),
  allow_user_org_creation: z.enum(["true", "false"]).optional(),
  self_hosted_unlimited: z.enum(["true", "false", "auto"]).optional(),
});

export async function PATCH(request: Request) {
  const result = await requireSiteAdmin();
  if (result instanceof NextResponse) return result;

  try {
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const updates = Object.entries(parsed).filter(
      ([, v]) => v !== undefined
    ) as [string, string][];

    for (const [key, value] of updates) {
      await setSiteSetting(
        key as Parameters<typeof setSiteSetting>[0],
        value
      );
    }

    const settings = await getAllSiteSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
