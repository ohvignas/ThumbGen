"use client";
import { useState } from "react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";

/**
 * Push-toggle mic button. Click once → start recording, click again → stop,
 * upload to /api/agent/transcribe, return the text via onTranscribed.
 *
 * Visual states:
 *   idle      → 🎤
 *   recording → ⏺ (pulsing red dot)
 *   uploading → spinner
 *   error     → ⚠ + tooltip
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
        if (!res.ok || data.error) {
          setError(data.error || `HTTP ${res.status}`);
        } else if (data.text) {
          onTranscribed(data.text);
        }
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

  const label = busy ? "Transcription…" : isRecording ? "Arrêter" : "Enregistrer";
  const icon = busy ? "…" : isRecording ? "⏺" : error ? "⚠" : "🎤";

  return (
    <button
      type="button"
      onClick={onClick}
      title={error ? `Erreur : ${error}` : label}
      aria-label={label}
      disabled={busy || state === "stopping"}
      className={`p-2 rounded-lg border transition ${
        isRecording ? "bg-red-100 border-red-300 animate-pulse" : "bg-gray-50 hover:bg-gray-100"
      } ${error ? "text-red-600" : ""}`}
    >
      <span className="text-base">{icon}</span>
    </button>
  );
}
