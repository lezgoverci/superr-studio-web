"use client";

import { useEffect, useRef } from "react";

/**
 * A custom hook for polling that:
 * 1. Automatically pauses when the window/tab is not visible (saving resources)
 * 2. Uses a "fixed delay" strategy (waits for the previous callback to complete before starting the next timer)
 *    to prevent request pile-up if the server is slow.
 *
 * @param callback The async function to call
 * @param delay The delay in milliseconds between calls. Pass null to stop polling.
 * @param enabled Whether polling is enabled. Defaults to true.
 */
export function usePolling(
  callback: () => Promise<void> | void,
  delay: number | null,
  enabled = true
) {
  const savedCallback = useRef(callback);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const isEnabled = enabled && delay !== null;

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    // If polling is disabled or delay is null, do nothing
    if (!isEnabled) {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const tick = async () => {
      // Don't poll if document is hidden (user is in another tab)
      if (document.hidden) {
        // Check again after the delay
        timeoutIdRef.current = setTimeout(tick, delay);
        return;
      }

      try {
        await savedCallback.current();
      } catch (error) {
        // Silently catch errors to ensure polling continues
        console.error("Polling error:", error);
      }

      if (isMounted) {
        // Schedule next call only after current one finishes
        timeoutIdRef.current = setTimeout(tick, delay);
      }
    };

    // Initial call
    tick();

    // Cleanup function
    return () => {
      isMounted = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, [delay, isEnabled]);
}
