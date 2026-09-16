import { Suspense } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import LibraryView from "@/components/library/LibraryView";
import { SidebarInset } from "@/components/ui/sidebar";

export const metadata = { title: "Bibliothèque · ThumbGen" };

/** Same shell as /miniatures; the body never scrolls, so the inset does. */
export default function BibliothequePage() {
  return (
    // AppSidebar still calls useReactFlow() until Task 13 removes it (and this provider).
    <ReactFlowProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-y-auto">
        {/* useSearchParams (?onglet=) needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <LibraryView />
        </Suspense>
      </SidebarInset>
    </ReactFlowProvider>
  );
}
