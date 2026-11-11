import { NextRequest } from "next/server";
import crypto from "crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { mcpRequestOrigin, originFromHeaders } from "@/lib/agent/mcp/signed-links";
import { ensureMcpApiKey } from "@/lib/settings";
import "@/lib/agent/tools/all"; // populate registry

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A stateful transport serves exactly one session, so each initialize gets its
// own server + transport, keyed by session id. Later requests carry the
// Mcp-Session-Id header and are routed to their transport.
const _transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

async function createTransport(): Promise<WebStandardStreamableHTTPServerTransport> {
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      _transports.set(id, transport);
    },
    onsessionclosed: (id) => {
      _transports.delete(id);
    },
  });
  await server.connect(transport);
  return transport;
}

function sessionNotFound(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null },
    { status: 404 },
  );
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
  const sessionId = req.headers.get("mcp-session-id");
  let transport: WebStandardStreamableHTTPServerTransport | undefined;
  if (sessionId) {
    transport = _transports.get(sessionId);
    // 404 tells the client to re-initialize (e.g. after a server restart).
    if (!transport) return sessionNotFound();
  } else {
    transport = await createTransport();
  }
  // Tools that hand back a link (upload, export) need the origin the client used.
  const origin = originFromHeaders(req.headers, req.url);
  const active = transport;
  return origin ? await mcpRequestOrigin.run(origin, () => active.handleRequest(req)) : await active.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
