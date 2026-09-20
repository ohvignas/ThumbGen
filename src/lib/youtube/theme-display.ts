/** Client prefs for « Sujet qui marche en ce moment » (period only). */

import { isWorkingPeriod, type WorkingPeriod } from "./types";

export const DEFAULT_WORKING_PERIOD: WorkingPeriod = "30d";
export const WORKING_PERIOD_STORAGE_KEY = "thumbgen.followed-working-period";

export function parseWorkingPeriod(value: unknown): WorkingPeriod {
  return isWorkingPeriod(value) ? value : DEFAULT_WORKING_PERIOD;
}

export function readStoredWorkingPeriod(): WorkingPeriod {
  if (typeof window === "undefined") return DEFAULT_WORKING_PERIOD;
  try {
    return parseWorkingPeriod(window.localStorage.getItem(WORKING_PERIOD_STORAGE_KEY));
  } catch {
    return DEFAULT_WORKING_PERIOD;
  }
}

export function writeStoredWorkingPeriod(period: WorkingPeriod): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKING_PERIOD_STORAGE_KEY, period);
  } catch {
    // private mode
  }
}
