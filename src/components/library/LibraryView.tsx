"use client";

import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LIBRARY_TAB_IDS, LIBRARY_TAB_LABELS, libraryTabHref, parseLibraryTab } from "@/lib/library/library-tabs";
import InspirationsTab from "./InspirationsTab";
import LogosTab from "./LogosTab";
import PersonasTab from "./PersonasTab";

export default function LibraryView() {
  const searchParams = useSearchParams();
  const tab = parseLibraryTab(searchParams.get("onglet"));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-medium">Bibliothèque</h1>
        <p className="text-sm text-muted-foreground">
          Tes personnages, logos et images d&apos;inspiration, prêts à être utilisés dans tes miniatures.
        </p>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          // Next.js syncs history.replaceState into useSearchParams: no page refetch.
          window.history.replaceState(null, "", libraryTabHref(parseLibraryTab(String(value))));
        }}
      >
        <TabsList>
          {LIBRARY_TAB_IDS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {LIBRARY_TAB_LABELS[id]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="personnages" className="pt-4">
          <PersonasTab />
        </TabsContent>
        <TabsContent value="logos" className="pt-4">
          <LogosTab />
        </TabsContent>
        <TabsContent value="inspirations" className="pt-4">
          <InspirationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
