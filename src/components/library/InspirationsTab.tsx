"use client";

import FollowedChannelsSection from "./FollowedChannelsSection";
import MyImagesSection from "./MyImagesSection";

export default function InspirationsTab() {
  return (
    <div className="grid gap-10">
      <MyImagesSection />
      <FollowedChannelsSection />
    </div>
  );
}
