import type { ReactNode } from "react";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

export function LibraryGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>;
}

export function LibraryGridSkeleton({ count = 4, aspect = "aspect-video" }: { count?: number; aspect?: string }) {
  return (
    <LibraryGrid>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn("w-full rounded-xl", aspect)} />
      ))}
    </LibraryGrid>
  );
}
