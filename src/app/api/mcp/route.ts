import { NextRequest } from "next/server";
import crypto from "crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { ensureMcpApiKey } from "@/lib/settings";
import "@/lib/agent/tools/all"; // populate registry

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One server instance per process; sessions are tracked by the transport.
let _transport: WebStandardStreamableHTTPServerTransport | null = null;
async function getTransport(): Promise<WebStandardStreamableHTTPServerTransport> {
  if (_transport) return _transport;
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);
  _transport = transport;
  return transport;
}

function isAuthorized(req: NextRequest): boolean {
  const expected = ensureMcpApiKey();
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "");
  return got === expected;
}

/**
 * Origin allowlist: localhost only by default. To allow remote use, set
 * THUMBGEN_PUBLIC_HOST=your.host.example.com (no scheme, no port).
 */
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // CLI clients (curl, mcp-cli, etc.) omit Origin
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (process.env.THUMBGEN_PUBLIC_HOST && host === process.env.THUMBGEN_PUBLIC_HOST) return true;
  return false;
}

async function handle(req: NextRequest): Promise<Response> {
  if (!originAllowed(req)) return new Response("Forbidden origin", { status: 403 });
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const transport = await getTransport();
  return await transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
