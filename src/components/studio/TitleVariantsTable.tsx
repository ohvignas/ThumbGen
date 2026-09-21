"use client";

import { useState } from "react";
import type { StudioDraft, TitleVariant } from "@/lib/studio/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMPTY_VARIANT: TitleVariant = { title: "", thumbText: "", visualConcept: "" };

function asTuple(variants: TitleVariant[]): StudioDraft["titleVariants"] {
  return [
    { ...EMPTY_VARIANT, ...variants[0] },
    { ...EMPTY_VARIANT, ...variants[1] },
    { ...EMPTY_VARIANT, ...variants[2] },
  ];
}

export default function TitleVariantsTable({
  variants,
  onChange,
  videoId,
}: {
  variants: StudioDraft["titleVariants"];
  onChange: (next: StudioDraft["titleVariants"]) => void;
  videoId?: string;
}) {
  const rows = asTuple(variants);
  const [scores, setScores] = useState<Array<number | null>>([null, null, null]);
  const [pretesting, setPretesting] = useState(false);
  const [pretestMessage, setPretestMessage] = useState<string | null>(null);

  const update = (index: number, patch: Partial<TitleVariant>) => {
    const next = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    setScores((current) => current.map((score, rowIndex) => (rowIndex === index ? null : score)));
    setPretestMessage(null);
    onChange(asTuple(next));
  };

  const pretest = async () => {
    if (!videoId || pretesting) return;
    setPretesting(true);
    setPretestMessage(null);
    try {
      const response = await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}/pretest`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | { rows?: Array<{ score?: unknown; reason?: unknown }>; error?: unknown }
        | null;
      if (!response.ok || !Array.isArray(body?.rows)) {
        throw new Error(typeof body?.error === "string" ? body.error : "Pré-test impossible. Réessaie.");
      }
      setScores(body.rows.map((row) => (typeof row.score === "number" ? row.score : null)));
      const reason = body.rows.find((row) => typeof row.reason === "string" && row.reason)?.reason;
      setPretestMessage(typeof reason === "string" ? reason : null);
    } catch (error) {
      setPretestMessage(error instanceof Error ? error.message : "Pré-test impossible. Réessaie.");
    } finally {
      setPretesting(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Titre</th>
              <th className="px-3 py-2 font-medium">Texte miniature</th>
              <th className="px-3 py-2 font-medium">Concept visuel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t">
                <td className="px-3 py-2">
                  <div className="flex min-w-64 items-center gap-2">
                    <Input
                      aria-label={`Titre ${index + 1}`}
                      value={row.title}
                      onChange={(event) => update(index, { title: event.target.value })}
                    />
                    {scores[index] !== null && (
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        Jev {Math.round((scores[index] ?? 0) * 100)} %
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Input
                    aria-label={`Texte miniature ${index + 1}`}
                    value={row.thumbText}
                    onChange={(event) => update(index, { thumbText: event.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    aria-label={`Concept visuel ${index + 1}`}
                    value={row.visualConcept}
                    onChange={(event) => update(index, { visualConcept: event.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!videoId || pretesting || rows.every((row) => !row.title.trim())}
          onClick={() => void pretest()}
        >
          {pretesting ? "Pré-test en cours…" : "Pré-tester les titres"}
        </Button>
        {pretestMessage && (
          <p role="status" className="text-sm text-muted-foreground">
            {pretestMessage}
          </p>
        )}
      </div>
    </div>
  );
}
