"use client";

import { useState, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas-store";

type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export default function ProjectBar() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentId, setCurrentId] = useState("default");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const loadProjects = () => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => {});
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const switchProject = async (projectId: string) => {
    setCurrentId(projectId);
    setMenuOpen(false);
    await loadProject(projectId);
  };

  const createProject = async () => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nouveau projet" }),
    });
    const { id } = await res.json();
    loadProjects();
    await switchProject(id);
  };

  const renameProject = async (projectId: string, name: string) => {
    await fetch(`/api/projects?id=${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setRenaming(null);
    loadProjects();
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm("Supprimer ce projet et toutes ses données ?")) return;
    await fetch(`/api/projects?id=${projectId}`, { method: "DELETE" });
    const remaining = projects.filter((p) => p.id !== projectId);
    if (remaining.length === 0 || currentId === projectId) {
      // If no projects left or deleted current, create a fresh one
      if (remaining.length === 0) {
        await createProject();
      } else {
        await switchProject(remaining[0].id);
        loadProjects();
      }
    } else {
      loadProjects();
    }
  };

  const currentProject = projects.find((p) => p.id === currentId);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
        style={{
          background: "var(--node-bg)",
          color: "var(--text-secondary)",
          border: "1px solid var(--surface)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        {currentProject?.name || "Mon projet"}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {menuOpen && (
        <div
          className="absolute left-0 top-full mt-2 rounded-xl overflow-hidden shadow-2xl z-50"
          style={{
            background: "var(--node-bg)",
            border: "1px solid var(--surface)",
            minWidth: 260,
          }}
        >
          {/* Project list */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-2 px-3 py-2 transition-all cursor-pointer"
                style={{
                  background: p.id === currentId ? "var(--surface)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (p.id !== currentId) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                }}
                onMouseLeave={(e) => {
                  if (p.id !== currentId) e.currentTarget.style.background = "transparent";
                }}
                onClick={() => switchProject(p.id)}
              >
                {p.id === currentId && (
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
                )}
                {renaming === p.id ? (
                  <input
                    ref={renameRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) renameProject(p.id, renameValue.trim());
                      else setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renameValue.trim()) renameProject(p.id, renameValue.trim());
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-xs bg-transparent focus:outline-none px-1 rounded"
                    style={{ color: "var(--text-primary)", border: "1px solid var(--accent)" }}
                  />
                ) : (
                  <span
                    className="flex-1 text-xs truncate"
                    style={{
                      color: p.id === currentId ? "var(--text-primary)" : "var(--text-secondary)",
                      paddingLeft: p.id !== currentId ? "14px" : 0,
                    }}
                  >
                    {p.name}
                  </span>
                )}

                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameValue(p.name);
                      setRenaming(p.id);
                    }}
                    className="p-1 rounded"
                    style={{ color: "var(--text-muted)" }}
                    title="Renommer"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {projects.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id);
                      }}
                      className="p-1 rounded"
                      style={{ color: "#EF9092" }}
                      title="Supprimer"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* New project button */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                createProject();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-all"
              style={{ color: "var(--accent)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nouveau projet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
