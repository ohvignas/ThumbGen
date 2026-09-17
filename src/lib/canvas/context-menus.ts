export type ContextMenuItem =
  | {
      type: "item";
      label: string;
      shortcut?: string;
      action: () => void;
      disabled?: boolean;
      destructive?: boolean;
    }
  | { type: "separator" };

/** Right-click on the canvas background. */
export function paneMenuItems(options: {
  hasNodes: boolean;
  hasSelection: boolean;
  onAddStep: () => void;
  onAutoLayout: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}): ContextMenuItem[] {
  return [
    { type: "item", label: "Ajouter une étape", shortcut: "N", action: options.onAddStep },
    {
      type: "item",
      label: "Ranger le workflow",
      shortcut: "⇧⌥T",
      action: options.onAutoLayout,
      disabled: !options.hasNodes,
    },
    { type: "separator" },
    {
      type: "item",
      label: "Tout sélectionner",
      shortcut: "⌘A",
      action: options.onSelectAll,
      disabled: !options.hasNodes,
    },
    {
      type: "item",
      label: "Tout désélectionner",
      shortcut: "Échap",
      action: options.onDeselectAll,
      disabled: !options.hasSelection,
    },
  ];
}

/** Right-click on a node. */
export function nodeMenuItems(options: { onDuplicate: () => void; onDelete: () => void }): ContextMenuItem[] {
  return [
    { type: "item", label: "Dupliquer", shortcut: "⌘D", action: options.onDuplicate },
    { type: "separator" },
    { type: "item", label: "Supprimer", shortcut: "⌫", action: options.onDelete, destructive: true },
  ];
}
