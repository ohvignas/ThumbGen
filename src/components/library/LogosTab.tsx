"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function LogosTab() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>Logos</EmptyTitle>
        <EmptyDescription>Cet onglet arrive bientôt.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
