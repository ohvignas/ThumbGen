"use client";

import { useEffect, useRef } from "react";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import MiniaturesView from "./MiniaturesView";

// globals.css sets `body { overflow: hidden }` so the canvas cannot scroll the
// document. This page has to scroll inside the inset, same as /bibliotheque
// and /reglages. The inset takes focus when nothing else does, so arrow keys,
// Page Down, and Space move the list and not a clipped document.
export default function MiniaturesPage() {
  const insetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const main = insetRef.current;
    if (!main) return;
    const active = document.activeElement;
    if (active === document.body || active === document.documentElement || active === null) {
      main.focus({ preventScroll: true });
    }
  }, []);

  return (
    <>
      <AppSidebar />
      <SidebarInset ref={insetRef} tabIndex={-1} className="h-svh overflow-y-auto outline-none">
        <MiniaturesView />
      </SidebarInset>
    </>
  );
}
