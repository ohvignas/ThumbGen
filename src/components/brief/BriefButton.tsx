"use client";
import { useState } from "react";
import { NotebookTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useBriefStore } from "@/store/brief-store";
import BriefPanel from "./BriefPanel";

/** « Fiche » in the chat header: optional memory the agent and the user share. */
export default function BriefButton({ conversationId }: { conversationId: string | null }) {
  const [open, setOpen] = useState(false);
  const brief = useBriefStore((s) => (conversationId !== null && s.conversationId === conversationId ? s.brief : null));
  const patch = useBriefStore((s) => s.patch);
  if (!conversationId) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void useBriefStore.getState().load(conversationId);
      }}
    >
      <SheetTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label="Fiche" />}>
        <NotebookTextIcon data-icon="inline-start" />
        Fiche
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Fiche miniature</SheetTitle>
          <SheetDescription>
            {brief ? "Mémoire optionnelle, modifiable. L'agent la relit à chaque tour." : "L'agent l'écrit quand une décision vaut le coup d'être gardée."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {brief ? <BriefPanel brief={brief} onPatch={patch} /> : <p className="text-sm text-muted-foreground">Aucune fiche pour cette conversation.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
