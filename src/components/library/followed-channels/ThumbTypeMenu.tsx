"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THUMB_TYPES, thumbTypeLabel, type ThumbType } from "@/lib/youtube/thumb-types";
import type { VideoListItem } from "@/lib/youtube/types";
import { channelsApi } from "./api";

const SOURCE_HINTS = { ai: "Classée par l'IA — clique pour corriger", manual: "Corrigée à la main" } as const;

type Props = { video: VideoListItem; onChanged: (videoId: string, thumbType: ThumbType) => void };

export default function ThumbTypeMenu({ video, onChanged }: Props) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const choose = async (thumbType: ThumbType) => {
    setSaving(true);
    setFailed(false);
    try {
      await channelsApi.setType(video.videoId, thumbType);
      onChanged(video.videoId, thumbType);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const label = thumbTypeLabel(video.thumbType);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            disabled={saving}
            aria-invalid={failed || undefined}
            aria-label={`Type de miniature : ${label}`}
            title={video.thumbTypeSource ? SOURCE_HINTS[video.thumbTypeSource] : "Choisir le type de miniature"}
          >
            {label}
            <ChevronDown data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Type de miniature</DropdownMenuLabel>
          {THUMB_TYPES.map((type) => (
            <DropdownMenuItem key={type.id} onClick={() => void choose(type.id)}>
              {type.label}
              {video.thumbType === type.id && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
