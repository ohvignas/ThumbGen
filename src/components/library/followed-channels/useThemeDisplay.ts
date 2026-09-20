"use client";

import { useState } from "react";
import {
  parseWorkingPeriod,
  readStoredWorkingPeriod,
  writeStoredWorkingPeriod,
} from "@/lib/youtube/theme-display";
import type { WorkingPeriod } from "@/lib/youtube/types";

export function useWorkingPeriod() {
  const [period, setPeriodState] = useState<WorkingPeriod>(readStoredWorkingPeriod);

  const setPeriod = (next: WorkingPeriod) => {
    const parsed = parseWorkingPeriod(next);
    setPeriodState(parsed);
    writeStoredWorkingPeriod(parsed);
  };

  return { period, setPeriod };
}
