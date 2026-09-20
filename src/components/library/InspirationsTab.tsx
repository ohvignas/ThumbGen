"use client";

import FollowedChannelsSection from "./FollowedChannelsSection";
import YoutubeSearchSection from "./YoutubeSearchSection";

export default function InspirationsTab() {
  return (
    <div className="grid gap-10">
      <YoutubeSearchSection />
      <FollowedChannelsSection />
    </div>
  );
}
