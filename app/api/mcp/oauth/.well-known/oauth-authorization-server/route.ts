const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET() {
  return Response.json({
    issuer: APP_URL,
    authorization_endpoint: `${APP_URL}/api/mcp/oauth/authorize`,
    token_endpoint: `${APP_URL}/api/mcp/oauth/token`,
    registration_endpoint: `${APP_URL}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}
