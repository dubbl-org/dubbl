import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveToken } from "@/lib/mcp/auth";
import { createMcpServer } from "@/lib/mcp/server";

async function handleMcpRequest(req: Request): Promise<Response> {
  // Extract Bearer token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer mcp_at_")) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing or invalid Bearer token" },
        id: null,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.slice(7);

  try {
    const ctx = await resolveToken(token);
    const server = createMcpServer(ctx);
    const transport = new WebStandardStreamableHTTPServerTransport();

    await server.connect(transport);

    const response = await transport.handleRequest(req);

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
        headers: response.headers,
      });
    }

    transport.close();
    server.close();
    return response;
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
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
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
