import { db } from "@/lib/db";
import { mcpOAuthClient } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { z } from "zod";

const registerSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.parse(body);

    const clientId = `mcp_${randomUUID().replace(/-/g, "")}`;

    const [client] = await db
      .insert(mcpOAuthClient)
      .values({
        clientId,
        redirectUris: parsed.redirect_uris,
        clientName: parsed.client_name ?? null,
      })
      .returning();

    return Response.json(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "invalid_client_metadata", error_description: err.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    console.error("Client registration error:", err);
    return Response.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}
