"use client";

import AppSidebar from "@/components/panels/AppSidebar";
import SettingsNav from "@/components/settings/SettingsNav";
import { SidebarInset } from "@/components/ui/sidebar";

// The body never scrolls (globals.css), so the inset is the scroll container.
export default function ReglagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <header className="mb-8">
            <h1 className="font-heading text-2xl font-medium">Réglages</h1>
            <p className="text-sm text-muted-foreground">
              Clés des modèles, agent, génération, chaîne, intégrations, données et apparence de ThumbGen.
            </p>
          </header>
          <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
            <SettingsNav />
            <div className="grid min-w-0 content-start gap-6">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </>
  );
}
