"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import {
  DOWNLOAD_EMPTY_FR,
  DOWNLOAD_ERROR_FR,
  HQ_DOWNLOAD_LABEL,
  LQ_DOWNLOAD_LABEL,
  downloadThumbnail,
  type ThumbnailDownloadQuality,
} from "@/lib/canvas/download-thumbnail";

export async function runThumbnailDownload(
  src: string | null | undefined,
  quality: ThumbnailDownloadQuality,
): Promise<void> {
  const result = await downloadThumbnail(src, quality);
  if (result === "empty") toast({ title: DOWNLOAD_EMPTY_FR });
  if (result === "error") toast({ title: DOWNLOAD_ERROR_FR });
}

export function thumbnailDownloadMenuItems(src: string | null | undefined) {
  return [
    {
      label: LQ_DOWNLOAD_LABEL,
      disabled: !src,
      onClick: () => {
        void runThumbnailDownload(src, "lq");
      },
    },
    {
      label: HQ_DOWNLOAD_LABEL,
      disabled: !src,
      onClick: () => {
        void runThumbnailDownload(src, "hq");
      },
    },
  ];
}

function DownloadBtn({
  quality,
  busy,
  disabled,
  children,
  onClick,
}: {
  quality: ThumbnailDownloadQuality;
  busy: boolean;
  disabled: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-thumbnail-download={quality}
      disabled={disabled}
      onClick={onClick}
      className="w-full py-2 rounded-xl text-xs font-medium transition-colors nopan nodrag disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--node-bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--surface)";
      }}
    >
      {busy ? "Préparation…" : children}
    </button>
  );
}

export function ThumbnailDownloadButtons({ src }: { src: string | null | undefined }) {
  const [busy, setBusy] = useState<ThumbnailDownloadQuality | null>(null);
  if (!src) return null;

  const run = async (quality: ThumbnailDownloadQuality) => {
    setBusy(quality);
    try {
      await runThumbnailDownload(src, quality);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      <DownloadBtn quality="lq" busy={busy === "lq"} disabled={Boolean(busy)} onClick={() => void run("lq")}>
        {LQ_DOWNLOAD_LABEL}
      </DownloadBtn>
      <DownloadBtn quality="hq" busy={busy === "hq"} disabled={Boolean(busy)} onClick={() => void run("hq")}>
        {HQ_DOWNLOAD_LABEL}
      </DownloadBtn>
    </div>
  );
}
