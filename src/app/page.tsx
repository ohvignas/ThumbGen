"use client";

import dynamic from "next/dynamic";
import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

export default function Home() {
  // AppSidebar calls useReactFlow() (for screenToFlowPosition when adding
  // nodes from the sidebar), so it needs the same ReactFlowProvider as the
  // actual <ReactFlow> instance inside Canvas — shared here at the page
  // level now that AppSidebar mounts as Canvas's sibling instead of nesting
  // inside <ReactFlow> (see the matching note in Canvas.tsx).
  return (
    <ReactFlowProvider>
      <AppSidebar />
      <SidebarInset>
        <Canvas />
      </SidebarInset>
    </ReactFlowProvider>
  );
}
