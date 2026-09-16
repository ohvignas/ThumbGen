"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function PersonasTab() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>Personnages</EmptyTitle>
        <EmptyDescription>Cet onglet arrive bientôt.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
