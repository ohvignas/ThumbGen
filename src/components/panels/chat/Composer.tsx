"use client";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";

export default function Composer({
  onSend,
  streaming,
  onStop,
}: {
  onSend: () => void;
  streaming: boolean;
  onStop: () => void;
}) {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const removeAttachment = useChatStore((s) => s.removeAttachment);

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !streaming;

  return (
    <div
      className="px-3 py-3 space-y-2"
      style={{ borderTop: "1px solid var(--line-faint)" }}
    >
      {attachments.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 nopan nodrag">
          {attachments.map((a) => (
            <div key={a.source} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.preview_url}
                alt="attachment"
                className="h-12 w-12 object-cover rounded"
                style={{ border: "1px solid var(--line)" }}
              />
              <button
                onClick={() => removeAttachment(a.source)}
                className="absolute -top-1 -right-1 rounded-full w-3.5 h-3.5 text-[8px] leading-none flex items-center justify-center transition-colors"
                style={{ background: "var(--ember)", color: "var(--ink-1)" }}
                aria-label="Retirer"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-end gap-1 rounded-xl px-2 py-1.5 transition-colors"
        style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Décris ta miniature, ou enregistre un vocal…"
          className="flex-1 resize-none bg-transparent border-0 px-2 py-1.5 text-sm focus:outline-none nopan nodrag"
          style={{ color: "var(--text-primary)", minHeight: "32px", maxHeight: "160px" }}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              onSend();
            }
          }}
        />

        <div className="flex gap-0.5 items-center shrink-0">
          <MicButton onTranscribed={(t) => setDraft(draft ? `${draft} ${t}` : t)} />
          <AttachButton />
          {streaming ? (
            <button
              onClick={onStop}
              className="p-1.5 rounded-lg transition-colors nopan nodrag"
              style={{ color: "var(--ember)" }}
              title="Arrêter"
              aria-label="Arrêter"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              className="p-1.5 rounded-lg transition-all nopan nodrag disabled:opacity-30"
              style={{
                color: canSend ? "var(--ink-1)" : "var(--text-tertiary)",
                background: canSend ? "var(--bone)" : "transparent",
              }}
              title="Envoyer"
              aria-label="Envoyer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
