"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function InspirationsTab() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>Inspirations</EmptyTitle>
        <EmptyDescription>Cet onglet arrive bientôt.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
