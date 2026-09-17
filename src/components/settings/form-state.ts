export function pickValues<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = source[key];
  return out;
}

/** Values are plain JSON built in schema key order, so a string comparison is exact. */
export function isDirty(initial: unknown, current: unknown): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

export function issuesByPath(issues: ReadonlyArray<{ path: string; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    if (!(issue.path in out)) out[issue.path] = issue.message;
  }
  return out;
}
