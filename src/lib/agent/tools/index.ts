import { ToolDefinition } from "./types";

const _registry = new Map<string, ToolDefinition>();

export function registerTool<I>(def: ToolDefinition<I>) {
  if (_registry.has(def.name)) throw new Error(`Tool already registered: ${def.name}`);
  _registry.set(def.name, def as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return _registry.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(_registry.values());
}

// Tool imports go here (subsequent tasks add them so they self-register on module load).
