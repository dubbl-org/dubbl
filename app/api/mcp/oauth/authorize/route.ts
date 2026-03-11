import { db } from "@/lib/db";
import { mcpOAuthClient } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const state = url.searchParams.get("state");
  const scope = url.searchParams.get("scope");
  const responseType = url.searchParams.get("response_type");

  // Validate required params
  if (!clientId || !redirectUri || !codeChallenge || !state) {
    return Response.json(
      {
        error: "invalid_request",
        error_description:
          "Missing required parameters: client_id, redirect_uri, code_challenge, state",
      },
      { status: 400 }
    );
  }

  if (responseType && responseType !== "code") {
    return Response.json(
      { error: "unsupported_response_type" },
      { status: 400 }
    );
  }

  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    return Response.json(
      { error: "invalid_request", error_description: "Only S256 code challenge method is supported" },
      { status: 400 }
    );
  }

  // Validate client
  const client = await db.query.mcpOAuthClient.findFirst({
    where: eq(mcpOAuthClient.clientId, clientId),
  });

  if (!client) {
    return Response.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 }
    );
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return Response.json(
      { error: "invalid_request", error_description: "redirect_uri not registered" },
      { status: 400 }
    );
  }

  // Check session
  const session = await auth();
  if (!session?.user?.id) {
    // Redirect to sign-in with callback back here
    const callbackUrl = encodeURIComponent(request.url);
    return Response.redirect(
      `${APP_URL}/sign-in?callbackUrl=${callbackUrl}`,
      302
    );
  }

  // Redirect to consent page
  const consentParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod || "S256",
    state,
    ...(scope ? { scope } : {}),
    client_name: client.clientName || clientId,
  });

  return Response.redirect(
    `${APP_URL}/mcp-authorize?${consentParams.toString()}`,
    302
  );
}
