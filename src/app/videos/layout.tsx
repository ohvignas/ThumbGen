import { Suspense } from "react";
import AppSidebar from "@/components/panels/AppSidebar";
import StudioChatHost from "@/components/studio/StudioChatHost";
import { SidebarInset } from "@/components/ui/sidebar";

export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        {children}
        <Suspense fallback={null}>
          <StudioChatHost />
        </Suspense>
      </SidebarInset>
    </>
  );
}
