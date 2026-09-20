import { cn } from "cn";

/** Small `#ID` overlay on a generated thumbnail the user can point at in chat. */
export default function ImageIdBadge({
  id,
  className,
}: {
  id: string | null | undefined;
  className?: string;
}) {
  if (!id) return null;
  return (
    <span
      data-image-id={id}
      title={`Mentionner ${id} dans le chat avec @`}
      className={cn(
        "pointer-events-none absolute bottom-2 left-2 z-10 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-white shadow-sm",
        className,
      )}
    >
      {id}
    </span>
  );
}
