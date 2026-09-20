"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Persist after typing pauses — not on every key, which remounts the Flow node. */
export const NODE_TEXT_DRAFT_MS = 200;

/** Survives a React Flow remount while the field is still being edited. */
const inflight = new Map<string, string>();

export function resetFocusedDrafts() {
  inflight.clear();
}

export function useFocusedDraft(
  nodeId: string,
  field: string,
  stored: string,
  persist: (value: string) => void,
) {
  const key = `${nodeId}:${field}`;
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(inflight.has(key));
  const draftRef = useRef(inflight.get(key) ?? stored);

  const [draft, setDraft] = useState(() => inflight.get(key) ?? stored);

  useEffect(() => {
    if (focusedRef.current) return;
    if (stored === draftRef.current) return;
    draftRef.current = stored;
    setDraft(stored);
  }, [stored]);

  const queuePersist = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistRef.current(value);
    }, NODE_TEXT_DRAFT_MS);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persistRef.current(draftRef.current);
  }, []);

  const onChange = useCallback(
    (value: string) => {
      draftRef.current = value;
      inflight.set(key, value);
      setDraft(value);
      queuePersist(value);
    },
    [key, queuePersist],
  );

  const onFocus = useCallback(() => {
    focusedRef.current = true;
    inflight.set(key, draftRef.current);
  }, [key]);

  const onBlur = useCallback(() => {
    focusedRef.current = false;
    inflight.delete(key);
    flush();
  }, [flush, key]);

  useEffect(() => {
    return () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      persistRef.current(draftRef.current);
    };
  }, []);

  return { value: draft, onChange, onFocus, onBlur, flush };
}
