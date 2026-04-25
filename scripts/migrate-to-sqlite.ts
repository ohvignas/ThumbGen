/**
 * One-shot migration: data/*.json + data/{generated,swipe-files,logos,face-reactions}/*
 * → data/thumbgen.db
 *
 * Usage: npx tsx scripts/migrate-to-sqlite.ts
 *
 * Idempotent: safe to run multiple times. Existing rows are kept.
 */
import fs from "fs";
import path from "path";
import { getDb, extToMime } from "../src/lib/db";

const DATA_DIR = path.join(process.cwd(), "data");

function fileBytes(p: string): Buffer | null {
  try { return fs.readFileSync(p); } catch { return null; }
}

function migrateProjects() {
  const projectsFile = path.join(DATA_DIR, "projects.json");
  const metaFile = path.join(DATA_DIR, "projects-meta.json");
  if (!fs.existsSync(projectsFile)) {
    console.log("→ no projects.json, skipping projects");
    return;
  }

  const store = JSON.parse(fs.readFileSync(projectsFile, "utf-8")) as Record<string, {
    nodes?: Array<{ id: string; type: string; position_x: number; position_y: number; data: string }>;
    edges?: Array<{ id: string; source: string; target: string; source_handle?: string | null; target_handle?: string | null; edge_type?: string }>;
    updated_at?: string;
  }>;

  const meta = fs.existsSync(metaFile)
    ? (JSON.parse(fs.readFileSync(metaFile, "utf-8")) as Array<{ id: string; name: string; createdAt: string; updatedAt: string }>)
    : [];

  const db = getDb();
  const upsertMeta = db.prepare(`
    INSERT INTO projects_meta (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
  `);
  const upsertProj = db.prepare(`
    INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges, updated_at = excluded.updated_at
  `);

  for (const [id, proj] of Object.entries(store)) {
    const nodes = (proj.nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position_x, y: n.position_y },
      data: (() => { try { return JSON.parse(n.data || "{}"); } catch { return {}; } })(),
    }));
    const edges = (proj.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.source_handle ?? null,
      targetHandle: e.target_handle ?? null,
      type: e.edge_type || "custom",
    }));

    const m = meta.find((x) => x.id === id);
    const createdAt = m?.createdAt || new Date().toISOString();
    const updatedAt = proj.updated_at || m?.updatedAt || new Date().toISOString();
    const name = m?.name || (id === "default" ? "Mon projet" : id);

    upsertMeta.run(id, name, createdAt, updatedAt);
    upsertProj.run(id, JSON.stringify(nodes), JSON.stringify(edges), updatedAt);
    console.log(`  ✓ project ${id} (${nodes.length} nodes, ${edges.length} edges)`);
  }
}

function migrateSettings() {
  const file = path.join(DATA_DIR, "settings.json");
  if (!fs.existsSync(file)) return;
  const settings = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, string | undefined>;
  const upsert = getDb().prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  for (const [k, v] of Object.entries(settings)) {
    if (v) upsert.run(k, v);
  }
  console.log(`  ✓ settings (${Object.keys(settings).length} keys)`);
}

function migrateImages(table: string, dir: string, manifestKey: "title" | "label" | null) {
  const folder = path.join(DATA_DIR, dir);
  if (!fs.existsSync(folder)) return;

  const manifestFile = path.join(folder, "manifest.json");
  const manifest: Array<Record<string, unknown>> = fs.existsSync(manifestFile)
    ? JSON.parse(fs.readFileSync(manifestFile, "utf-8"))
    : [];

  const files = fs.readdirSync(folder).filter((f) => !f.startsWith(".") && f !== "manifest.json");

  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`);

  let count = 0;
  for (const f of files) {
    const idFromName = f.split(".")[0];
    if (exists.get(idFromName)) continue;

    const buf = fileBytes(path.join(folder, f));
    if (!buf) continue;

    const ext = path.extname(f).slice(1) || "png";
    const mime = extToMime(ext);

    const meta = manifest.find((m) => m.filename === f);

    if (table === "generated_images") {
      db.prepare(`INSERT INTO generated_images (id, mime_type, data) VALUES (?, ?, ?)`).run(idFromName, mime, buf);
    } else {
      const labelOrTitle = manifestKey && meta ? String(meta[manifestKey] || "") : "";
      db.prepare(`INSERT INTO ${table} (id, ${manifestKey}, mime_type, size, data) VALUES (?, ?, ?, ?, ?)`).run(
        idFromName,
        labelOrTitle || (manifestKey === "title" ? "Reference" : "Logo"),
        mime,
        buf.length,
        buf,
      );
    }
    count++;
  }
  console.log(`  ✓ ${table} (${count} files imported, ${files.length - count} already in db)`);
}

function main() {
  console.log("→ migrating settings.json");
  migrateSettings();
  console.log("→ migrating projects.json + projects-meta.json");
  migrateProjects();
  console.log("→ migrating data/generated/");
  migrateImages("generated_images", "generated", null);
  console.log("→ migrating data/swipe-files/");
  migrateImages("swipe_files", "swipe-files", "title");
  console.log("→ migrating data/logos/");
  migrateImages("logos", "logos", "label");
  console.log("→ migrating data/face-reactions/");
  migrateImages("face_reactions", "face-reactions", "label");
  console.log("\n✓ migration complete → data/thumbgen.db");
  console.log("  (the old JSON files and image folders are kept; you can delete them once verified)");
}

main();
