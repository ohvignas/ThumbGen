"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BarChart3, Film, Library, Settings as SettingsIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { RunIndicator } from "@/components/agent-runs/RunIndicator";

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <Link href="/" className="flex size-9 shrink-0 items-center justify-center rounded-xl" aria-label="ThumbGen home">
            <Image src="/illith.svg" alt="" width={24} height={24} priority />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium leading-tight">ThumbGen</span>
            <span className="truncate text-xs text-sidebar-foreground/60 leading-tight">Illith Studio</span>
          </div>
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Mes miniatures"
                  isActive={pathname === "/miniatures"}
                  onClick={() => router.push("/miniatures")}
                >
                  <Film />
                  <span>Mes miniatures</span>
                </SidebarMenuButton>
                {/* Aggregated: the sidebar lists no project (visible in the collapsed rail too). */}
                <RunIndicator className="pointer-events-none absolute top-1.5 right-1.5" />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Bibliothèque"
                  isActive={pathname.startsWith("/bibliotheque")}
                  onClick={() => router.push("/bibliotheque")}
                >
                  <Library />
                  <span>Bibliothèque</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Usage et coûts" isActive={pathname === "/usage"} onClick={() => router.push("/usage")}>
              <BarChart3 />
              <span>Usage</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Réglages"
              isActive={pathname.startsWith("/reglages")}
              onClick={() => router.push("/reglages")}
            >
              <SettingsIcon />
              <span>Réglages</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
