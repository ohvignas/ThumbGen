"use client";

import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import MiniaturesView from "./MiniaturesView";

export default function MiniaturesPage() {
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <MiniaturesView />
      </SidebarInset>
    </>
  );
}
