import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cn } from "cn";
import ChannelSyncTrigger from "@/components/ChannelSyncTrigger";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toast";
import { getTypedSettings } from "@/lib/settings";
import type { Theme } from "@/lib/settings-schema";
import { THEME_SCRIPT, serverThemeClass, sidebarDefaultOpen } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThumbGen · Illith Studio",
  description: "AI-powered YouTube thumbnail studio with infinite canvas.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // cookies() first: it opts the layout into dynamic rendering before the database is read.
  const cookieStore = await cookies();
  const sidebarOpen = sidebarDefaultOpen(cookieStore.get("sidebar_state")?.value);
  // getTypedSettings() reads the database; every page renders through this
  // layout, so a DB read failure here must not take the whole app down —
  // fall back to the schema default theme instead.
  let theme: Theme = "dark";
  try {
    ({ theme } = getTypedSettings());
  } catch (error) {
    console.error("[layout] failed to read settings, falling back to the default theme", error);
  }

  return (
    <html
      lang="fr"
      data-theme={theme}
      className={cn("h-full antialiased", serverThemeClass(theme))}
      suppressHydrationWarning
    >
      <head>
        {/* Follows prefers-color-scheme while data-theme is "system"; does nothing otherwise. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className="min-h-full bg-background text-foreground"
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
        suppressHydrationWarning
      >
        <TooltipProvider>
          <ChannelSyncTrigger />
          {/* Reopens in the state the user left it (sidebar_state cookie written
              by ui/sidebar.tsx), expanded when there is no cookie yet. The
              SidebarTrigger in AppSidebar's header collapses it back to the 4rem
              icon rail (width matched to the old fixed rail). */}
          <SidebarProvider defaultOpen={sidebarOpen} style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
            {children}
            <Toaster />
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
