"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

/**
 * One miniature's workspace. Same shell as the old index route, except the
 * project comes from the URL so a thumbnail can be linked to and reopened
 * directly from the gallery.
 */
export default function MiniaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <ReactFlowProvider>
      <AppSidebar />
      <SidebarInset>
        <Canvas projectId={id} />
      </SidebarInset>
    </ReactFlowProvider>
  );
}
