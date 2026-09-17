"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useStoreApi } from "@xyflow/react";
import { ArrowRight, Search, SearchX } from "lucide-react";
import { cn } from "cn";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useCanvasStore, type NodeData, type NodePickerState } from "@/store/canvas-store";
import { CATALOG_CATEGORIES, searchCatalog, type CatalogEntry } from "@/lib/canvas/node-catalog";
import { pickerBaseEntries, pickerSubtitle, planPickerAdd } from "@/lib/canvas/picker-actions";
import { viewportCenterPosition } from "@/lib/canvas/placement";

/**
 * « Ajouter une étape » — side panel listing the node catalogue. Opened through
 * the canvas store (`openNodePicker`) by the empty state, the N shortcut, the
 * canvas context menu, a wire released on empty space and the generator's
 * « + Ajouter » buttons. Closes after adding.
 */
export default function NodePicker({ generatorDefaults }: { generatorDefaults: NodeData }) {
  const nodePicker = useCanvasStore((s) => s.nodePicker);
  const closeNodePicker = useCanvasStore((s) => s.closeNodePicker);
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <Sheet
      open={nodePicker !== null}
      onOpenChange={(open) => {
        if (!open) closeNodePicker();
      }}
    >
      <SheetContent
        side="right"
        initialFocus={searchRef}
        className="gap-0 p-0 data-[side=right]:w-[380px] data-[side=right]:sm:max-w-[380px]"
      >
        {nodePicker && (
          <NodePickerBody state={nodePicker} generatorDefaults={generatorDefaults} searchRef={searchRef} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function NodePickerBody({
  state,
  generatorDefaults,
  searchRef,
}: {
  state: NodePickerState;
  generatorDefaults: NodeData;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const nodes = useCanvasStore((s) => s.nodes);
  const addNode = useCanvasStore((s) => s.addNode);
  const addNodeAndConnect = useCanvasStore((s) => s.addNodeAndConnect);
  const closeNodePicker = useCanvasStore((s) => s.closeNodePicker);
  const flowStore = useStoreApi();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const baseEntries = useMemo(() => pickerBaseEntries(state, nodes), [state, nodes]);
  const results = useMemo(() => searchCatalog(query, baseEntries), [query, baseEntries]);
  const active = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const add = (entry: CatalogEntry) => {
    const { width, height, transform } = flowStore.getState();
    const plan = planPickerAdd({
      state,
      entry,
      nodes,
      viewCenter: viewportCenterPosition({ width, height }, transform),
      generatorDefaults,
    });
    if (!plan) return;
    if (plan.mode === "connect") {
      addNodeAndConnect(
        plan.nodeType,
        plan.position,
        plan.connectTo,
        plan.connectToHandle,
        plan.newNodeHandle,
        plan.data,
        plan.newNodeIsTarget,
      );
    } else {
      addNode(plan.nodeType, plan.position, plan.data);
    }
    closeNodePicker();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(Math.min(active + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      add(results[active]);
    }
  };

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle>Ajouter une étape</SheetTitle>
        <SheetDescription>{pickerSubtitle(state, nodes.length)}</SheetDescription>
      </SheetHeader>

      <div className="p-3">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Rechercher une étape…"
            aria-label="Rechercher une étape"
          />
        </InputGroup>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {results.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>Aucune étape ne correspond</EmptyTitle>
              <EmptyDescription>Essaie un autre mot, par exemple « logo » ou « texte ».</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          CATALOG_CATEGORIES.map((category) => {
            const rows = results
              .map((entry, index) => ({ entry, index }))
              .filter((row) => row.entry.category === category.id);
            if (rows.length === 0) return null;
            return (
              <div key={category.id} className="mb-2">
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">{category.label}</div>
                {rows.map(({ entry, index }) => {
                  const Icon = entry.icon;
                  const isActive = index === active;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      data-index={index}
                      data-active={isActive || undefined}
                      onMouseMove={() => {
                        if (!isActive) setActiveIndex(index);
                      }}
                      onClick={() => add(entry)}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "text-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-2 left-0 w-0.5 rounded-full",
                          isActive ? "bg-primary" : "bg-transparent",
                        )}
                      />
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{entry.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{entry.description}</span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-opacity",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
