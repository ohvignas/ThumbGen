"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
  onComplete: (photos: Record<Angle, string>, name: string) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [shots, setShots] = useState<Partial<Record<Angle, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Naming step (added recently, not legacy leftover): once all 3 angles are
  // captured, the wizard advances here instead of saving immediately — the
  // user names the persona before it's sent to the server. Keep this state
  // and the JSX block below intact when a later task converts this modal's
  // outer shell to a real Dialog; the naming step's content and behavior
  // should carry over unchanged.
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  // Guards finish() below against duplicate persona creation from a
  // key-repeat Enter or an impatient double-click while the save (3
  // base64-encoded photos POSTed to /api/personas) is in flight.
  const [submitting, setSubmitting] = useState(false);

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
    // Defense in depth: "Capturer" below is already disabled via
    // disabled={!ready || !!error}, but guard the handler itself too so a
    // stray click can never start a capture against a denied/unready camera.
    if (!ready || error) return;
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
  }, [step.angle, ready, error]);

  const retake = () => setShots((prev) => ({ ...prev, [step.angle]: undefined }));

  const next = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      // All 3 angles captured — advance to the naming step rather than
      // saving immediately (see the `naming` state above).
      setNaming(true);
    }
  };

  const finish = async () => {
    // Bail if a save is already in flight — prevents a key-repeat Enter or
    // a double-click from firing onComplete (and thus POST /api/personas)
    // more than once and creating duplicate personas.
    if (submitting) return;
    setSubmitting(true);
    try {
      // Don't stop the stream here: onComplete's save can fail, in which case
      // the caller keeps this modal open so the user can retry or go back to
      // retake — stopping the camera now would leave them stuck with a dead
      // feed. The mount effect's cleanup stops it once this component
      // actually unmounts (close, or a successful save).
      await onComplete(shots as Record<Angle, string>, name.trim());
    } finally {
      // On success the caller unmounts this modal (harmless no-op state
      // update if it beats this to it); on failure this re-enables the
      // button so the user can retry.
      setSubmitting(false);
    }
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <span className="text-xs font-medium mb-1 block text-muted-foreground">
          {naming ? "Dernière étape — Nom" : `Étape ${stepIndex + 1} / ${STEPS.length} — ${step.title}`}
        </span>

        {naming ? (
          // Naming step (added recently, not legacy leftover — see the
          // `naming` state declaration above for why this exists and how it
          // should survive a future Dialog conversion of this modal).
          <>
            <p className="text-xs mb-3 text-muted-foreground">
              Donne un nom à ce personnage pour le reconnaître dans la liste.
            </p>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {STEPS.map((s) => (
                <div key={s.angle} className="rounded-lg overflow-hidden" style={{ aspectRatio: "1/1" }}>
                  <img src={shots[s.angle]} alt={s.title} className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
                </div>
              ))}
            </div>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.repeat) finish(); }}
              placeholder="Ex: Antoine, Moi, Perso vidéo…"
              className="w-full px-3 py-2 rounded-xl text-sm mb-3 focus:outline-none bg-muted text-foreground border border-transparent"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setNaming(false)}
                className="flex-1 py-2 rounded-xl text-xs font-medium bg-muted text-muted-foreground"
              >
                Précédent
              </button>
              <button
                onClick={finish}
                disabled={submitting}
                className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-40 bg-primary text-primary-foreground"
              >
                {submitting ? "Enregistrement…" : "Créer le personnage"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-1.5 mb-3">
              {STEPS.map((s, i) => (
                <div
                  key={s.angle}
                  className={`flex-1 h-1 rounded-full ${shots[s.angle] ? "bg-primary" : i === stepIndex ? "bg-muted-foreground" : "bg-muted"}`}
                />
              ))}
            </div>

            <p className="text-xs mb-3 text-muted-foreground">
              {step.instruction}
            </p>

            <div
              className="relative rounded-xl overflow-hidden mb-3 bg-background"
              style={{ aspectRatio: "1/1" }}
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
                  <p className="text-xs text-center text-destructive">{error}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              {preview ? (
                <button
                  onClick={retake}
                  className="flex-1 py-2 rounded-xl text-xs font-medium bg-muted text-muted-foreground"
                >
                  Reprendre
                </button>
              ) : (
                <button
                  onClick={capture}
                  disabled={!ready || !!error}
                  className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-40 bg-primary text-primary-foreground"
                >
                  Capturer
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={prev}
                disabled={stepIndex === 0}
                className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-30 bg-muted text-muted-foreground"
              >
                Précédent
              </button>
              <button
                onClick={next}
                disabled={!preview}
                className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-30 bg-primary text-primary-foreground"
              >
                {stepIndex < STEPS.length - 1 ? "Suivant" : "Terminer"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
