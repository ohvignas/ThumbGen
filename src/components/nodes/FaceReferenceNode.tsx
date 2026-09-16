"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { libraryTabHref } from "@/lib/library/library-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, personaNodeData, type PersonaSummary } from "@/lib/personas";
import NodeShell from "./NodeShell";

/* eslint-disable @next/next/no-img-element */

/**
 * Personnage (node type "faceReference", kept for saved data). Faces are
 * Personnages only: pick one from the library, or go create one. A former
 * single-photo face node is converted to a reference image on load
 * (see migrateCanvas).
 */
export default function FaceReferenceNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  // null until a list was loaded successfully (a failed load never counts as « deleted »).
  const [personas, setPersonas] = useState<PersonaSummary[] | null>(null);

  const loadPersonas = useCallback(() => {
    fetch("/api/personas", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PersonaSummary[]>) : null))
      .then((rows) => {
        if (rows) setPersonas(rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  // « Créer un personnage » opens the Bibliothèque in another browser tab:
  // coming back to this one refreshes the list.
  useEffect(() => {
    window.addEventListener("focus", loadPersonas);
    return () => window.removeEventListener("focus", loadPersonas);
  }, [loadPersonas]);

  const angles = data.personaAngles;
  const personaDeleted = Boolean(
    data.personaId && personas && !personas.some((persona) => persona.id === data.personaId),
  );
  const hasPersona =
    !personaDeleted && Boolean(data.personaId || (angles && (angles.front || angles.left || angles.right)));

  const items = (personas ?? []).map((persona) => ({ value: persona.id, label: persona.label }));
  if (data.personaId && !personaDeleted && !items.some((item) => item.value === data.personaId)) {
    items.unshift({ value: data.personaId, label: data.label || "Personnage" });
  }

  const choosePersona = (value: string | null) => {
    if (!value) return;
    const persona = personas?.find((candidate) => candidate.id === value);
    if (persona) updateNodeData(id, personaNodeData(persona));
  };

  return (
    <NodeShell
      title={data.label || "Personnage"}
      onDelete={() => removeNode(id)}
      onRename={(newName) => updateNodeData(id, { label: newName })}
      width={280}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
        </svg>
      }
    >
      <div className="flex flex-col gap-2">
        {hasPersona && (
          <div className="grid grid-cols-3 gap-1.5">
            {PERSONA_ANGLES.map((angle) => (
              <div key={angle} className="overflow-hidden rounded-lg bg-(--surface)">
                {angles?.[angle] ? (
                  <img src={angles[angle]} alt={PERSONA_ANGLE_LABELS[angle]} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center text-[9px] text-(--text-muted)">—</div>
                )}
              </div>
            ))}
          </div>
        )}

        <Select
          items={items}
          value={personaDeleted ? null : (data.personaId ?? null)}
          onValueChange={choosePersona}
          onOpenChange={(open) => {
            if (open) loadPersonas();
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Personnage"
            className="nodrag nopan w-full border-(--line) bg-(--surface) text-(--text-primary) data-placeholder:text-(--text-muted)"
          >
            <SelectValue placeholder="Choisir un personnage" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!hasPersona && (
          <>
            {personaDeleted && (
              <p className="text-[11px] text-(--text-muted)">Personnage supprimé de la bibliothèque.</p>
            )}
            {personas?.length === 0 && (
              <p className="text-[11px] text-(--text-muted)">Aucun personnage dans ta bibliothèque.</p>
            )}
            <button
              type="button"
              onClick={() => window.open(libraryTabHref("personnages"), "_blank", "noopener")}
              className="nodrag nopan self-start text-xs text-(--canvas-accent) hover:underline"
            >
              Créer un personnage
            </button>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="face" />
    </NodeShell>
  );
}
