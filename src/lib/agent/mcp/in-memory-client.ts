import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./server";
import "@/lib/agent/tools/all"; // ensure registry is populated

let cached: Client | null = null;

/**
 * Returns a process-cached MCP Client connected via in-memory transport
 * to a server that exposes the full ThumbGen tool registry.
 *
 * Used by the browser agent loop (`/api/agent/chat`) to dispatch tool calls
 * through the same MCP path that remote clients use, ensuring consistency.
 */
export async function getInMemoryMcpClient(): Promise<Client> {
  if (cached) return cached;
  const server = buildMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "thumbgen-browser-agent", version: "1.0.0" });
  await client.connect(clientTransport);
  cached = client;
  return client;
}
