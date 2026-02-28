import { useCallback, useRef } from "react";

/**
 * Returns a stable function reference that always delegates to the latest
 * version of the callback. Useful for avoiding stale closure issues without
 * adding the callback to useEffect / useCallback dependency arrays.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(
    (...args: Parameters<T>): ReturnType<T> => callbackRef.current(...args),
    []
  ) as T;
}
