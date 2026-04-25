import { Blueprint } from "./schema";

type Node = Blueprint["nodes"][number];

export type DiffOps = {
  create: Node[];
  update: Node[];
  delete: string[];
};

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function diffBlueprints(current: Blueprint, target: Blueprint): DiffOps {
  const currentMap = new Map(current.nodes.map((n) => [n.id, n]));
  const targetMap = new Map(target.nodes.map((n) => [n.id, n]));

  const create: Node[] = [];
  const update: Node[] = [];
  const del: string[] = [];

  for (const [id, node] of targetMap) {
    const cur = currentMap.get(id);
    if (!cur) {
      create.push(node);
    } else if (stableStringify(cur) !== stableStringify(node)) {
      update.push(node);
    }
  }
  for (const id of currentMap.keys()) {
    if (!targetMap.has(id)) del.push(id);
  }
  return { create, update, delete: del };
}
