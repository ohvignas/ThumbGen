import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThumbGen · Illith Studio",
  description: "AI-powered YouTube thumbnail studio with infinite canvas.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased dark" suppressHydrationWarning>
      <body
        className="min-h-full"
        style={{
          background: "var(--ink-1)",
          color: "var(--bone)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
