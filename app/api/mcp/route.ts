import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveToken } from "@/lib/mcp/auth";
import { createMcpServer } from "@/lib/mcp/server";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

async function handleMcpRequest(req: Request): Promise<Response> {
  // Extract Bearer token
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer mcp_at_")) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing or invalid Bearer token" },
        id: null,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${APP_URL}/.well-known/oauth-protected-resource/api/mcp"`,
          ...CORS_HEADERS,
        },
      }
    );
  }

  const token = authHeader.slice(7);

  try {
    const ctx = await resolveToken(token);
    const server = createMcpServer(ctx);
    const transport = new WebStandardStreamableHTTPServerTransport();

    await server.connect(transport);

    const response = await transport.handleRequest(req);

    // Add CORS headers to the response
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      headers.set(key, value);
    }

    // Clean up after response is consumed
    if (response.body) {
      const originalBody = response.body;
      const transform = new TransformStream({
        flush() {
          transport.close();
          server.close();
        },
      });
      const newBody = originalBody.pipeThrough(transform);
      return new Response(newBody, {
        status: response.status,
        headers,
      });
    }

    transport.close();
    server.close();
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    const status =
      err instanceof Error && "status" in err
        ? (err as { status: number }).status
        : 500;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message },
        id: null,
      }),
      { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
