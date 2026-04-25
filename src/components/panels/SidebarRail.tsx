"use client";

import Link from "next/link";
import Image from "next/image";
import { ReactNode } from "react";

/**
 * Persistent left rail. Pure presentation, no ReactFlow dependency.
 * Used by:
 *   - Sidebar.tsx (home / canvas — wraps it with expandable panels)
 *   - /usage page (rail only)
 */

export function RailIcon({
  children,
  title,
  active,
  onClick,
  href,
}: {
  children: ReactNode;
  title: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const className = "rail-icon";
  const styleVars = {
    "--rail-active": active ? "1" : "0",
  } as React.CSSProperties;
  const inner = (
    <span
      className={className}
      style={styleVars}
      data-active={active ? "true" : "false"}
      title={title}
      aria-label={title}
    >
      {children}
    </span>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return (
    <button onClick={onClick} className="rail-button" title={title} aria-label={title}>
      {inner}
    </button>
  );
}

export default function SidebarRail({
  children,
  footer,
}: {
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside className="sidebar-rail">
      <Link href="/" className="rail-brand" title="ThumbGen home" aria-label="ThumbGen home">
        <span className="rail-brand-mark">
          <Image src="/illith.svg" alt="" width={26} height={26} priority />
        </span>
      </Link>

      <div className="rail-stack">{children}</div>

      <div className="rail-spacer" />

      {footer && <div className="rail-footer">{footer}</div>}

      <style jsx>{`
        .sidebar-rail {
          position: relative;
          z-index: 10;
          width: 64px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 0 18px;
          background: var(--ink-1);
          border-right: 1px solid var(--line-faint);
        }
        .rail-brand {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          margin-bottom: 22px;
          border-radius: 12px;
          transition: background 0.18s ease;
        }
        .rail-brand:hover { background: var(--brand-tint); }
        .rail-brand-mark {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
        }
        .rail-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .rail-spacer { flex: 1; }
        .rail-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding-top: 10px;
          border-top: 1px solid var(--line-faint);
          width: 100%;
        }
      `}</style>

      <style jsx global>{`
        .rail-button {
          background: none;
          border: 0;
          padding: 0;
          cursor: pointer;
        }
        .rail-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          color: var(--bone-muted);
          transition: color 0.15s ease, background 0.15s ease, box-shadow 0.2s ease;
          position: relative;
        }
        .rail-icon:hover {
          color: var(--bone);
          background: rgba(255, 255, 255, 0.04);
        }
        .rail-icon[data-active="true"] {
          color: var(--bone);
          background: var(--brand-tint);
          box-shadow: inset 0 0 0 1px rgba(230, 0, 126, 0.55);
        }
        .rail-icon[data-active="true"]::before {
          content: "";
          position: absolute;
          left: -8px;
          top: 10px;
          bottom: 10px;
          width: 2px;
          background: var(--brand);
          border-radius: 2px;
        }
      `}</style>
    </aside>
  );
}

/* — Shared rail icons (so Sidebar and pages stay visually consistent) — */

export const RailIcons = {
  faces: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  ),
  models: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 15l5-5 4 4 4-6 5 7" />
      <circle cx="15" cy="8" r="1.5" />
    </svg>
  ),
  swipe: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="8" height="8" rx="1" />
      <rect x="14" y="2" width="8" height="8" rx="1" />
      <rect x="2" y="14" width="8" height="8" rx="1" />
      <rect x="14" y="14" width="8" height="8" rx="1" />
    </svg>
  ),
  logos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
      <circle cx="17" cy="17" r="3" />
    </svg>
  ),
  usage: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
      <circle cx="11" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  workspace: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18M9 3v18" />
    </svg>
  ),
};
