"use client";

import { ReactNode, useState, useRef, useEffect } from "react";

export default function NodeShell({
  children,
  title,
  icon,
  onDelete,
  onDuplicate,
  onRename,
  onRemoveBg,
  removingBg,
  extraMenuItems,
  accentColor,
  headerExtra,
  width = 460,
}: {
  children: ReactNode;
  title: string;
  icon?: ReactNode;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onRename?: (newName: string) => void;
  onRemoveBg?: () => void;
  removingBg?: boolean;
  extraMenuItems?: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
  accentColor?: string;
  headerExtra?: ReactNode;
  width?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

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

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== title && onRename) {
      onRename(trimmed);
    }
    setRenaming(false);
  };

  return (
    <div
      className="node-card dark overflow-visible rounded-xl border transition-all text-(--text-primary)"
      style={{
        width,
        background: "var(--node-bg)",
        fontFamily: "Arial, Helvetica, sans-serif",
        borderColor: accentColor ? accentColor + "40" : "var(--line-faint)",
      }}
    >
      {/* Color stripe */}
      {accentColor && (
        <div style={{ height: 3, background: accentColor, borderRadius: "12px 12px 0 0" }} />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {renaming ? (
            <input
              ref={renameRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              className="text-sm font-medium bg-transparent focus:outline-none nopan nodrag px-1 rounded"
              style={{
                color: "var(--text-primary)",
                border: "1px solid var(--bone-soft)",
                minWidth: 60,
              }}
            />
          ) : (
            <span
              className="text-xs font-medium truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {title}
            </span>
          )}
        </div>
        {headerExtra && <div className="ml-auto mr-1 flex min-w-0 items-center">{headerExtra}</div>}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded-md transition-colors nopan nodrag"
            style={{ color: "var(--text-muted)" }}
            aria-label="Actions du nœud"
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="4" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="12" cy="8" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden min-w-[140px] py-1 z-50 nopan nodrag"
              style={{
                background: "var(--node-bg)",
                border: "1px solid var(--line-strong)",
              }}
            >
              {onRename && (
                <NodeMenuItem
                  label="Renommer"
                  onClick={() => {
                    setRenameValue(title);
                    setRenaming(true);
                    setMenuOpen(false);
                  }}
                />
              )}
              {extraMenuItems?.map((item) => (
                <NodeMenuItem
                  key={item.label}
                  label={item.label}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onClick();
                    setMenuOpen(false);
                  }}
                />
              ))}
              {onRemoveBg && (
                <NodeMenuItem
                  label={removingBg ? "Suppression…" : "Retirer le fond"}
                  onClick={() => {
                    if (!removingBg) onRemoveBg();
                    setMenuOpen(false);
                  }}
                />
              )}
              {onDuplicate && (
                <NodeMenuItem
                  label="Dupliquer"
                  onClick={() => {
                    onDuplicate();
                    setMenuOpen(false);
                  }}
                />
              )}
              {onDelete && (
                <NodeMenuItem
                  label="Supprimer"
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                  danger
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pb-3">{children}</div>
    </div>
  );
}

function NodeMenuItem({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-2 text-xs transition-colors"
      style={{
        color: danger ? "var(--ember)" : "var(--text-secondary)",
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}
