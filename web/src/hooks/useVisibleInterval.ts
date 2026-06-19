import { useEffect, useRef } from 'react';

/**
 * Runs `callback` every `intervalMs`, but only while the tab is visible.
 *
 * Best-practice polling: nothing fires while `document.hidden` (no wasted
 * requests / battery in a backgrounded tab), and when the tab becomes visible
 * again it "catches up" — if at least `intervalMs` has elapsed since the last
 * run, it fires immediately and then resumes the interval. Cleans up on unmount.
 *
 * The callback is read from a ref, so passing a fresh closure each render does
 * not reset the timer (only `intervalMs` does).
 */
export function useVisibleInterval(intervalMs: number, callback: () => void): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastRun = Date.now();

    const run = () => {
      lastRun = Date.now();
      callbackRef.current();
    };

    const start = () => {
      stop();
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') run();
      }, intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRun >= intervalMs) run();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
