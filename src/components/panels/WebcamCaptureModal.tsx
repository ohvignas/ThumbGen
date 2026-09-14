"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Angle = "front" | "left" | "right";

const STEPS: { angle: Angle; title: string; instruction: string }[] = [
  {
    angle: "front",
    title: "Face",
    instruction: "Regarde la caméra bien en face, expression neutre, yeux à hauteur de l'objectif.",
  },
  {
    angle: "left",
    title: "Profil gauche",
    instruction: "Tourne la tête à 45° vers ta gauche — ni un profil complet, ni presque de face.",
  },
  {
    angle: "right",
    title: "Profil droit",
    instruction: "Tourne la tête à 45° vers ta droite, même principe.",
  },
];

export default function WebcamCaptureModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (photos: Record<Angle, string>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [shots, setShots] = useState<Partial<Record<Angle, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const step = STEPS[stepIndex];
  const preview = shots[step.angle];

  // Video element is mounted for the whole modal lifetime (see render below) —
  // it must never unmount between steps, or its srcObject is lost and the
  // wizard silently stops working past the first capture.
  const attachStream = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? "Ton navigateur ne supporte pas la capture webcam."
          : "La webcam nécessite une connexion sécurisée (https:// ou localhost).",
      );
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", aspectRatio: { ideal: 1 }, width: { ideal: 1280 }, height: { ideal: 1280 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch((err) => {
        const messages: Record<string, string> = {
          NotAllowedError: "Accès webcam refusé — autorise la caméra dans les réglages du navigateur.",
          NotFoundError: "Aucune webcam détectée sur cet appareil.",
          NotReadableError: "La webcam est déjà utilisée par une autre application.",
        };
        setError(messages[err?.name] || "Impossible d'accéder à la webcam. Tu peux importer des fichiers à la place.");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    // Crop to the centered square the user actually saw in the (1:1) preview
    // box, instead of saving the full (often 16:9) sensor frame.
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setShots((prev) => ({ ...prev, [step.angle]: dataUrl }));
  }, [step.angle]);

  const retake = () => setShots((prev) => ({ ...prev, [step.angle]: undefined }));

  const next = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      // Don't stop the stream here: onComplete's save can fail, in which
      // case the caller keeps this modal open so the user can retry or
      // retake — stopping the camera now would leave them stuck with a
      // dead feed. The mount effect's cleanup stops it once this component
      // actually unmounts (close, or a successful save).
      onComplete(shots as Record<Angle, string>);
    }
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(8,8,12,0.85)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-5 w-full max-w-sm"
        style={{ background: "var(--node-bg)", border: "1px solid var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Étape {stepIndex + 1} / {STEPS.length} — {step.title}
          </span>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {STEPS.map((s, i) => (
            <div
              key={s.angle}
              className="flex-1 h-1 rounded-full"
              style={{ background: shots[s.angle] ? "var(--accent)" : i === stepIndex ? "var(--bone-soft)" : "var(--surface)" }}
            />
          ))}
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          {step.instruction}
        </p>

        <div
          className="relative rounded-xl overflow-hidden mb-3"
          style={{ aspectRatio: "1/1", background: "var(--ink-0)" }}
        >
          {/* The video stays mounted for the whole modal lifetime — steps only
              toggle whether the preview image or the framing guide sits on top
              of it. Unmounting/remounting <video> between steps loses srcObject. */}
          <video
            ref={attachStream}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)", visibility: error ? "hidden" : "visible" }}
          />

          {!error && !preview && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <ellipse cx="50" cy="48" rx="26" ry="34" fill="none" stroke="rgba(244,240,229,0.5)" strokeWidth="0.6" strokeDasharray="2 2" />
            </svg>
          )}

          {/* Mirrored to match the live preview the user framed against —
              purely a display flip, the bytes saved to the server are the
              camera's true (unmirrored) frame. */}
          {preview && (
            <img src={preview} alt={step.title} className="absolute inset-0 w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <p className="text-xs text-center" style={{ color: "var(--ember)" }}>{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          {preview ? (
            <button
              onClick={retake}
              className="flex-1 py-2 rounded-xl text-xs font-medium"
              style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
            >
              Reprendre
            </button>
          ) : (
            <button
              onClick={capture}
              disabled={!ready || !!error}
              className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-40"
              style={{ background: "var(--accent-yellow)", color: "var(--canvas-bg)" }}
            >
              Capturer
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={prev}
            disabled={stepIndex === 0}
            className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-30"
            style={{ background: "var(--surface)", color: "var(--text-muted)" }}
          >
            Précédent
          </button>
          <button
            onClick={next}
            disabled={!preview}
            className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-30"
            style={{ background: "var(--accent)", color: "var(--canvas-bg)" }}
          >
            {stepIndex < STEPS.length - 1 ? "Suivant" : "Terminer"}
          </button>
        </div>
      </div>
    </div>
  );
}
