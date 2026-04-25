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
    <div className="border-t p-3 space-y-2 bg-white">
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attachments.map((a) => (
            <div key={a.source} className="relative shrink-0">
              <img
                src={a.preview_url}
                alt="attachment"
                className="h-14 w-14 object-cover rounded border"
              />
              <button
                onClick={() => removeAttachment(a.source)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center hover:bg-red-600"
                aria-label="Retirer"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Décris ta miniature, demande une recherche YouTube, joins une référence…"
          className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm min-h-[44px] max-h-40 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              onSend();
            }
          }}
        />

        <div className="flex gap-1.5 items-center">
          <MicButton
            onTranscribed={(t) => setDraft(draft ? `${draft} ${t}` : t)}
          />
          <AttachButton />
          {streaming ? (
            <button
              onClick={onStop}
              className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              title="Stop"
              aria-label="Stop"
            >
              ◼
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
              title="Envoyer"
              aria-label="Envoyer"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
