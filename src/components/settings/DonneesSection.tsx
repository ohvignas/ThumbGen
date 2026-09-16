"use client";

import { useState } from "react";
import BackupsCard from "./BackupsCard";
import CleanupCard from "./CleanupCard";
import StorageCard from "./StorageCard";

export default function DonneesSection() {
  const [statsVersion, setStatsVersion] = useState(0);

  return (
    <>
      <StorageCard refreshKey={statsVersion} />
      <BackupsCard />
      <CleanupCard onCleaned={() => setStatsVersion((version) => version + 1)} />
    </>
  );
}
