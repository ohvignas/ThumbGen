"use client";

import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import MiniaturesView from "./MiniaturesView";

// AppSidebar calls useReactFlow() for its drag-to-canvas handlers, so it needs
// a provider even on pages without a canvas.
export default function MiniaturesPage() {
  return (
    <ReactFlowProvider>
      <AppSidebar />
      <SidebarInset>
        <MiniaturesView />
      </SidebarInset>
    </ReactFlowProvider>
  );
}
