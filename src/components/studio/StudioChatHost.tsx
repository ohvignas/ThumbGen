"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ChatPanel from "@/components/panels/ChatPanel";
import StudioCreateOverlay from "@/components/studio/StudioCreateOverlay";
import { useStudioCreateStore } from "@/store/studio-create-store";
import { useStudioLiveStore } from "@/store/studio-live-store";
import { writingProjectId } from "@/lib/studio/types";

const VIDEO_PATH = /^\/videos\/(vid_[a-z0-9]+)$/;

export default function StudioChatHost() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const createId = params.get("create");
  const editId = pathname.match(VIDEO_PATH)?.[1] ?? null;
  const videoId = createId ?? editId;
  const phase = useStudioLiveStore((s) => s.phase);
  const lastPatch = useStudioLiveStore((s) => s.lastPatch);

  useEffect(() => {
    useStudioLiveStore.getState().reset();
  }, [videoId]);

  useEffect(() => {
    if (!createId) return;
    if (lastPatch && lastPatch.videoId === createId) {
      router.push(`/videos/${createId}`);
    }
  }, [createId, lastPatch, router]);

  if (!videoId) return null;

  if (createId) {
    return (
      <StudioCreateOverlay
        videoId={createId}
        phase={phase}
        onDismiss={() => useStudioCreateStore.getState().requestAbandon(createId)}
      />
    );
  }

  // Keep the writing project key stable from overlay to dock. If the Dialog
  // transition still remounts ChatPanel, its resumeStream path reconnects the
  // in-flight server turn.
  return (
    <ChatPanel
      key={writingProjectId(videoId)}
      projectId={writingProjectId(videoId)}
      layout="dock"
    />
  );
}
