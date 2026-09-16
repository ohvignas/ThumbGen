"use client";

/* eslint-disable @next/next/no-img-element */

import { cn } from "cn";

/** A logo on a transparency checkerboard, so light and dark logos both stay visible. */
export default function LogoPreview({
  src,
  alt,
  className,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex aspect-[4/3] w-full items-center justify-center bg-background bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[16px_16px] p-4",
        className,
      )}
    >
      <img src={src} alt={alt} loading="lazy" onError={onError} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
