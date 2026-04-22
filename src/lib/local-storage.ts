import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

type ProjectData = {
  nodes: Array<{
    id: string;
    type: string;
    position_x: number;
    position_y: number;
    data: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    source_handle: string | null;
    target_handle: string | null;
    edge_type: string;
  }>;
  updated_at: string;
};

type Store = Record<string, ProjectData>;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): Store {
  ensureDataDir();
  if (!fs.existsSync(PROJECTS_FILE)) {
    return {};
  }
  const raw = fs.readFileSync(PROJECTS_FILE, "utf-8");
  return JSON.parse(raw) as Store;
}

function writeStore(store: Store) {
  ensureDataDir();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function getProject(projectId: string): ProjectData | null {
  const store = readStore();
  return store[projectId] || null;
}

export function saveProject(
  projectId: string,
  nodes: ProjectData["nodes"],
  edges: ProjectData["edges"]
) {
  const store = readStore();
  store[projectId] = {
    nodes,
    edges,
    updated_at: new Date().toISOString(),
  };
  writeStore(store);
}
