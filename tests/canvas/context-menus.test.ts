import { describe, it, expect, vi } from "vitest";
import { nodeMenuItems, paneMenuItems, type ContextMenuItem } from "@/lib/canvas/context-menus";

const summary = (items: ContextMenuItem[]) =>
  items.map((item) =>
    item.type === "separator"
      ? "---"
      : [item.label, item.shortcut ?? "", item.disabled ? "off" : "on", item.destructive ? "danger" : ""].join("|"),
  );

const paneOptions = (overrides: Partial<Parameters<typeof paneMenuItems>[0]> = {}) => ({
  hasNodes: true,
  hasSelection: true,
  onAddStep: vi.fn(),
  onAutoLayout: vi.fn(),
  onSelectAll: vi.fn(),
  onDeselectAll: vi.fn(),
  ...overrides,
});

describe("paneMenuItems", () => {
  it("lists the actions with their shortcuts", () => {
    expect(summary(paneMenuItems(paneOptions()))).toEqual([
      "Ajouter une étape|N|on|",
      "Ranger le workflow|⇧⌥T|on|",
      "---",
      "Tout sélectionner|⌘A|on|",
      "Tout désélectionner|Échap|on|",
    ]);
  });

  it("disables layout and select-all on an empty canvas, and deselect without a selection", () => {
    expect(summary(paneMenuItems(paneOptions({ hasNodes: false, hasSelection: false })))).toEqual([
      "Ajouter une étape|N|on|",
      "Ranger le workflow|⇧⌥T|off|",
      "---",
      "Tout sélectionner|⌘A|off|",
      "Tout désélectionner|Échap|off|",
    ]);
  });

  it("wires each item to its callback", () => {
    const options = paneOptions();
    for (const item of paneMenuItems(options)) if (item.type === "item") item.action();
    expect(options.onAddStep).toHaveBeenCalledTimes(1);
    expect(options.onAutoLayout).toHaveBeenCalledTimes(1);
    expect(options.onSelectAll).toHaveBeenCalledTimes(1);
    expect(options.onDeselectAll).toHaveBeenCalledTimes(1);
  });
});

describe("nodeMenuItems", () => {
  it("offers Dupliquer then a destructive Supprimer", () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const items = nodeMenuItems({ onDuplicate, onDelete });
    expect(summary(items)).toEqual(["Dupliquer|⌘D|on|", "---", "Supprimer|⌫|on|danger"]);
    for (const item of items) if (item.type === "item") item.action();
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
