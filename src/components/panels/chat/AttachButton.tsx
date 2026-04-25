"use client";
import { useRef, useState } from "react";
import LibraryPickerModal from "./LibraryPickerModal";
import { useChatStore } from "@/store/chat-store";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

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
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title="Joindre une image"
        aria-label="Joindre une image"
        className="p-2 rounded-lg border bg-gray-50 hover:bg-gray-100"
      >
        📎
      </button>
      <button
        type="button"
        onClick={() => setShowLib(true)}
        title="Depuis ma bibliothèque"
        aria-label="Depuis ma bibliothèque"
        className="p-2 rounded-lg border bg-gray-50 hover:bg-gray-100"
      >
        📚
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      {error && <span className="text-xs text-red-600 self-center" title={error}>⚠</span>}
      {showLib && (
        <LibraryPickerModal
          onClose={() => setShowLib(false)}
          onPick={(source, preview_url) => {
            addAttachment({ source, preview_url });
            setShowLib(false);
          }}
        />
      )}
    </>
  );
}
