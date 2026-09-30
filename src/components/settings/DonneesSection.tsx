"use client";

import { useState } from "react";
import BackupsCard from "./BackupsCard";
import CleanupCard from "./CleanupCard";
import StorageCard from "./StorageCard";
import UpdateCommandCard from "./UpdateCommandCard";

export default function DonneesSection() {
  const [statsVersion, setStatsVersion] = useState(0);

  return (
    <>
      <StorageCard refreshKey={statsVersion} />
      <UpdateCommandCard />
      <BackupsCard />
      <CleanupCard onCleaned={() => setStatsVersion((version) => version + 1)} />
    </>
  );
}
