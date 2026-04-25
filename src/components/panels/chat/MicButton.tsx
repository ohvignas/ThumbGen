"use client";
import { useState } from "react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";

/**
 * Atelier Nocturne mic button.
 * idle → hairline mic icon · recording → pulsing ember dot · busy → spinner
 */
export default function MicButton({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const { state, start, stop, isRecording } = useMediaRecorder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    if (isRecording) {
      try {
        const blob = await stop();
        setBusy(true);
        const fd = new FormData();
        fd.append("audio", new File([blob], "audio.webm", { type: blob.type || "audio/webm" }));
        const res = await fetch("/api/agent/transcribe", { method: "POST", body: fd });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || data.error) setError(data.error || `HTTP ${res.status}`);
        else if (data.text) onTranscribed(data.text);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else {
      try {
        await start();
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const tone = error
    ? "var(--ember)"
    : isRecording
    ? "var(--ember)"
    : "var(--text-tertiary)";

  return (
    <button
      type="button"
      onClick={onClick}
      title={error ? `Erreur : ${error}` : isRecording ? "Arrêter" : "Enregistrer"}
      aria-label={isRecording ? "Arrêter l'enregistrement" : "Enregistrer"}
      disabled={busy || state === "stopping"}
      className="p-1.5 rounded-lg transition-colors disabled:opacity-30 nopan nodrag"
      style={{ color: tone }}
      onMouseEnter={(e) => {
        if (!isRecording && !error) e.currentTarget.style.color = "var(--text-secondary)";
      }}
      onMouseLeave={(e) => {
        if (!isRecording && !error) e.currentTarget.style.color = "var(--text-tertiary)";
      }}
    >
      {busy ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
          <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeDashoffset="20" />
        </svg>
      ) : isRecording ? (
        <span className="block w-3 h-3 rounded-full animate-pulse" style={{ background: "var(--ember)" }} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      )}
    </button>
  );
}
