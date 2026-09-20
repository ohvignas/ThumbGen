"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { ChevronRight, Copy, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import {
  DEBUG_LEVEL_LABEL,
  DEBUG_SCOPE_LABEL,
  countDebugLogErrors,
  filterDebugLogEntries,
  formatDebugLogClock,
  formatDebugLogDetails,
  inferDebugLogLevel,
  type DebugLogsView,
} from "@/lib/debug-log-format";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatDebugLogs,
  mergeDebugLogs,
  readDebugLogs,
  subscribeDebugLogs,
  type DebugLogEntry,
  type DebugLogLevel,
  type DebugScope,
} from "@/lib/debug-log";
import { useCanvasStore } from "@/store/canvas-store";

const POLL_OPEN_MS = 1500;
const POLL_CLOSED_MS = 4000;
const VIEW_STORAGE_KEY = "thumbgen.logs.view";

function readStoredLogsView(): DebugLogsView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "all" ? "all" : "workflow";
  } catch {
    return "workflow";
  }
}

function persistLogsView(view: DebugLogsView): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private mode: the choice just won't persist.
  }
}

const SCOPE_CHIP: Record<DebugScope, string> = {
  "canvas-load": "border-violet-400/50 bg-violet-500/15 text-violet-800 dark:text-violet-200",
  "canvas-save": "border-cyan-400/50 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200",
  generate: "border-orange-400/50 bg-orange-500/15 text-orange-800 dark:text-orange-200",
  agent: "border-indigo-400/50 bg-indigo-500/15 text-indigo-800 dark:text-indigo-200",
  chat: "border-emerald-400/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
};

const SCOPE_BAR: Record<DebugScope, string> = {
  "canvas-load": "bg-violet-500",
  "canvas-save": "bg-cyan-500",
  generate: "bg-orange-500",
  agent: "bg-indigo-500",
  chat: "bg-emerald-500",
};

const LEVEL_ROW: Record<DebugLogLevel, string> = {
  error: "bg-red-500/10",
  warn: "bg-amber-500/10",
  success: "bg-emerald-500/5",
  start: "bg-sky-500/5",
  info: "bg-transparent",
};

const LEVEL_TEXT: Record<DebugLogLevel, string> = {
  error: "text-red-700 dark:text-red-300",
  warn: "text-amber-800 dark:text-amber-200",
  success: "text-emerald-800 dark:text-emerald-200",
  start: "text-sky-800 dark:text-sky-200",
  info: "text-foreground",
};

const ORIGIN_CHIP: Record<DebugLogEntry["origin"], string> = {
  client: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  server: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-200",
};

async function fetchServerLogs(projectId: string): Promise<DebugLogEntry[]> {
  try {
    const res = await fetch(`/api/debug-logs?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { entries?: DebugLogEntry[] };
    return Array.isArray(body.entries) ? body.entries : [];
  } catch {
    return [];
  }
}

function errorLabel(count: number): string {
  return count === 1 ? "1 erreur" : `${count} erreurs`;
}

function WorkflowLogRow({ entry }: { entry: DebugLogEntry }) {
  const [open, setOpen] = useState(false);
  const level = inferDebugLogLevel(entry);
  const details = formatDebugLogDetails(entry.data);
  const payload = entry.data && Object.keys(entry.data).length > 0 ? JSON.stringify(entry.data, null, 2) : "";

  return (
    <article
      className={cn("relative rounded-md border border-border/60 pl-2.5", LEVEL_ROW[level])}
      data-workflow-log-row
      data-log-scope={entry.scope}
      data-log-level={level}
      data-log-origin={entry.origin}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.5 rounded-l-md", SCOPE_BAR[entry.scope])} />
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 pt-1.5 pb-1 font-mono text-[11px] leading-4">
        <time className="text-muted-foreground tabular-nums" dateTime={entry.ts}>
          {formatDebugLogClock(entry.ts)}
        </time>
        <span className={cn("rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide", ORIGIN_CHIP[entry.origin])}>
          {entry.origin === "server" ? "serveur" : "client"}
        </span>
        <span
          className={cn("rounded border px-1 py-px text-[10px] font-medium", SCOPE_CHIP[entry.scope])}
          title={entry.scope}
        >
          {DEBUG_SCOPE_LABEL[entry.scope]}
        </span>
        <span className={cn("min-w-0 font-sans text-xs font-medium", LEVEL_TEXT[level])}>{entry.message}</span>
        <span className={cn("ml-auto text-[10px] uppercase tracking-wide", LEVEL_TEXT[level])}>{DEBUG_LEVEL_LABEL[level]}</span>
      </div>
      {details ? (
        <p className="px-2 pb-1.5 font-mono text-[11px] leading-4 text-muted-foreground" data-workflow-log-details>
          {details}
        </p>
      ) : null}
      {payload ? (
        <div className="px-2 pb-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
          >
            <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
            JSON
          </button>
          {open ? (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-2 font-mono text-[10px] leading-4 text-foreground">
              {payload}
            </pre>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function WorkflowLogsSheet() {
  const projectId = useCanvasStore((s) => s.currentProjectId);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DebugLogsView>(readStoredLogsView);
  const [clientLogs, setClientLogs] = useState<DebugLogEntry[]>(() => readDebugLogs(projectId));
  const [serverLogs, setServerLogs] = useState<DebugLogEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const setLogsView = (next: DebugLogsView) => {
    setView(next);
    persistLogsView(next);
  };

  useEffect(() => {
    const refresh = () => setClientLogs(readDebugLogs(projectId));
    refresh();
    return subscribeDebugLogs(refresh);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const pull = () => {
      void fetchServerLogs(projectId).then((entries) => {
        if (!cancelled) setServerLogs(entries);
      });
    };
    pull();
    const timer = window.setInterval(pull, open ? POLL_OPEN_MS : POLL_CLOSED_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, projectId]);

  const entries = useMemo(() => mergeDebugLogs(clientLogs, serverLogs), [clientLogs, serverLogs]);
  const visible = useMemo(() => filterDebugLogEntries(entries, view), [entries, view]);
  const errorCount = useMemo(() => countDebugLogErrors(entries), [entries]);
  const visibleText = useMemo(() => formatDebugLogs(visible), [visible]);
  const allText = useMemo(() => formatDebugLogs(entries), [entries]);
  const hiddenCount = entries.length - visible.length;

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [open, visible.length, view]);

  const copyText = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title });
    } catch {
      toast({ title: "Impossible de copier les logs" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant={errorCount > 0 ? "destructive" : "outline"}
            size="sm"
            className={cn(
              "gap-1.5",
              errorCount > 0 &&
                "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white dark:border-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500",
            )}
            data-workflow-logs
            data-error-count={errorCount}
            aria-label={errorCount > 0 ? `Logs, ${errorLabel(errorCount)}` : "Logs"}
          />
        }
      >
        <ScrollText data-icon="inline-start" />
        Logs
        {errorCount > 0 ? (
          <span
            data-workflow-log-errors
            className="inline-flex min-w-4 items-center justify-center rounded-full bg-white/25 px-1.5 text-[10px] font-semibold leading-4"
          >
            {errorCount}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Logs du workflow</SheetTitle>
          <SheetDescription>
            {view === "workflow"
              ? "Génération, agent, chat et erreurs. Les sauvegardes auto et le poll sont masqués."
              : "Journal complet de cette session (agent, canvas, génération, chat). Secrets et pixels masqués."}
            {errorCount > 0 ? ` ${errorLabel(errorCount)}.` : ""}
            {view === "workflow" && hiddenCount > 0 ? ` ${hiddenCount} événements process masqués.` : ""}
          </SheetDescription>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="Filtre des logs"
            value={[view]}
            data-logs-view={view}
            onValueChange={(value) => {
              const next = value[0] === "all" ? "all" : value[0] === "workflow" ? "workflow" : null;
              if (next) setLogsView(next);
            }}
          >
            <ToggleGroupItem value="workflow" data-logs-view-option="workflow">
              Workflow
            </ToggleGroupItem>
            <ToggleGroupItem value="all" data-logs-view-option="all">
              Tous les process
            </ToggleGroupItem>
          </ToggleGroup>
        </SheetHeader>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3" data-workflow-log-list data-logs-view={view}>
          {visible.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {visible.map((entry, index) => (
                <WorkflowLogRow key={`${entry.origin}-${entry.id}-${entry.ts}-${index}`} entry={entry} />
              ))}
            </div>
          ) : entries.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun événement de workflow. Passe à « Tous les process » pour voir les sauvegardes et le poll.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun log pour cette session.</p>
          )}
          <pre className="sr-only" data-workflow-log-text>
            {visibleText}
          </pre>
        </div>
        <SheetFooter className="flex-row flex-wrap border-t">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            data-copy-visible
            onClick={() => void copyText(visibleText, view === "workflow" ? "Logs du workflow copiés" : "Logs copiés")}
            disabled={!visibleText}
          >
            <Copy data-icon="inline-start" />
            Copier les logs
          </Button>
          {view === "workflow" && hiddenCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="gap-1.5"
              data-copy-all
              onClick={() => void copyText(allText, "Tous les logs copiés")}
              disabled={!allText}
            >
              Copier tout
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
