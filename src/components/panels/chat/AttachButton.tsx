"use client";
import { useRef, useState } from "react";
import LibraryPickerDialog from "@/components/library/LibraryPickerDialog";
import { libraryPickToAttachment, UNKNOWN_LIBRARY_IMAGE_ERROR } from "@/lib/library/library-pick-source";
import { useChatStore } from "@/store/chat-store";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { InputGroupButton } from "@/components/ui/input-group";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <InputGroupButton
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onClick}
            aria-label={title}
            className="nopan nodrag"
          >
            {children}
          </InputGroupButton>
        }
      />
      <TooltipContent>
        <p>{title}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function AttachButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showLib, setShowLib] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addAttachment = useChatStore((s) => s.addAttachment);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const list = Array.from(files).slice(0, 5);
    for (const f of list) {
      if (!ALLOWED.has(f.type)) {
        setError(`Type non supporté : ${f.type}`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/chat-uploads", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `HTTP ${res.status}`);
        continue;
      }
      const j = (await res.json()) as { id: string; source: string };
      addAttachment({ source: j.source, preview_url: `/api/chat-uploads/${j.id}` });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <IconButton onClick={() => fileRef.current?.click()} title="Joindre une image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05L12.25 20.24a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.19 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
      </IconButton>
      <IconButton onClick={() => setShowLib(true)} title="Depuis ma bibliothèque">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
          <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
      </IconButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      {error && (
        <span role="alert" className="line-clamp-2 min-w-0 max-w-[16rem] self-center text-xs text-destructive">
          {error}
        </span>
      )}
      <LibraryPickerDialog
        open={showLib}
        onOpenChange={setShowLib}
        kind="all"
        onPick={(pick) => {
          const attachment = libraryPickToAttachment(pick);
          // Refused: the dialog stays open and shows the error itself.
          if (!attachment) throw new Error(UNKNOWN_LIBRARY_IMAGE_ERROR);
          setError(null);
          addAttachment(attachment);
        }}
      />
    </>
  );
}
