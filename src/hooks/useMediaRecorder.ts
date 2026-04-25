"use client";
import { useRef, useState, useCallback } from "react";

export type RecorderState = "idle" | "recording" | "stopping";

/**
 * Wraps the browser's MediaRecorder API for capturing voice notes.
 *
 * Lifecycle:
 *   const { state, start, stop } = useMediaRecorder();
 *   await start();              // requests mic permission, starts recording
 *   const blob = await stop();  // returns audio/webm Blob
 *
 * Notes:
 * - On unmount mid-recording, the active stream tracks should be stopped
 *   manually by the caller (call stop() in a useEffect cleanup).
 * - mimeType defaults to audio/webm;codecs=opus which works in Chrome/Safari/FF.
 *   Safari historically had spotty support; if needed, fall back to detecting
 *   isTypeSupported and choosing among ["audio/webm", "audio/mp4", "audio/wav"].
 */
export function useMediaRecorder(mimeType: string = "audio/webm;codecs=opus") {
  const [state, setState] = useState<RecorderState>("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    if (recRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const supported = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)
      ? mimeType
      : undefined;
    const rec = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recRef.current = rec;
    rec.start();
    setState("recording");
  }, [mimeType]);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const rec = recRef.current;
      if (!rec) {
        reject(new Error("Not recording"));
        return;
      }
      setState("stopping");
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        rec.stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        chunksRef.current = [];
        setState("idle");
        resolve(blob);
      };
      rec.onerror = (e) => {
        reject(new Error(`MediaRecorder error: ${(e as { error?: { message?: string } }).error?.message ?? "unknown"}`));
      };
      rec.stop();
    });
  }, []);

  return { state, start, stop, isRecording: state === "recording" };
}
