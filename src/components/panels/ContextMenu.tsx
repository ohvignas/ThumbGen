"use client";

import { useEffect, useRef } from "react";

type MenuItem = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  hint?: string;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

export default function ContextMenu({
  x,
  y,
  sections,
  items,
  onClose,
}: {
  x: number;
  y: number;
  sections?: MenuSection[];
  items?: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Support both flat items and sections
  const allSections: MenuSection[] = sections
    ? sections
    : items
      ? [{ title: "", items }]
      : [];

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-xl overflow-hidden min-w-[220px] py-1"
      style={{
        left: x,
        top: y,
        background: "var(--node-bg)",
        border: "1px solid var(--surface)",
        maxHeight: "80vh",
        overflowY: "auto",
      }}
    >
      {allSections.map((section, si) => (
        <div key={si}>
          {si > 0 && (
            <div className="mx-3 my-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
          )}
          {section.title && (
            <div
              className="px-4 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              {section.title}
            </div>
          )}
          {section.items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  onClose();
                }
              }}
              disabled={item.disabled}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left"
              style={{
                color: item.disabled ? "var(--text-muted)" : "var(--text-secondary)",
                opacity: item.disabled ? 0.4 : 1,
                cursor: item.disabled ? "not-allowed" : "pointer",
              }}
              title={item.disabled && item.hint ? item.hint : ""}
              onMouseEnter={(e) => {
                if (!item.disabled) e.currentTarget.style.background = "var(--surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.disabled && item.hint && (
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>inactif</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
