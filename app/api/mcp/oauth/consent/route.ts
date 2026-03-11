import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { mcpOAuthClient, mcpOAuthCode, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { z } from "zod";

const consentSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.string().default("S256"),
  state: z.string(),
  scope: z.string().optional(),
  organization_id: z.string(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = consentSchema.parse(body);

    // Validate client
    const client = await db.query.mcpOAuthClient.findFirst({
      where: eq(mcpOAuthClient.clientId, parsed.client_id),
    });

    if (!client) {
      return Response.json(
        { error: "Invalid client_id" },
        { status: 400 }
      );
    }

    if (!client.redirectUris.includes(parsed.redirect_uri)) {
      return Response.json(
        { error: "Invalid redirect_uri" },
        { status: 400 }
      );
    }

    // Verify user is a member of the org
    const mem = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, parsed.organization_id),
        eq(member.userId, session.user.id)
      ),
    });

    if (!mem) {
      return Response.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    // Generate authorization code
    const codeRaw = randomBytes(32).toString("hex");
    const codeHash = createHash("sha256").update(codeRaw).digest("hex");

    await db.insert(mcpOAuthCode).values({
      codeHash,
      userId: session.user.id,
      organizationId: parsed.organization_id,
      clientId: parsed.client_id,
      redirectUri: parsed.redirect_uri,
      codeChallenge: parsed.code_challenge,
      codeChallengeMethod: parsed.code_challenge_method,
      scopes: parsed.scope ?? "mcp",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // Build redirect URL
    const redirectParams = new URLSearchParams({
      code: codeRaw,
      state: parsed.state,
    });

    return Response.json({
      redirect_url: `${parsed.redirect_uri}?${redirectParams.toString()}`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: err.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    console.error("Consent error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
