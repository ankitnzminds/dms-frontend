'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser full screen for one element (toolbar + content together). `isFullscreen` follows the real
 * state, so leaving with Esc is reflected too. Hidden when the browser/webview cannot do it.
 */
export function useFullscreen<T extends HTMLElement>(onChange?: (on: boolean) => void) {
  const ref = useRef<T>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const sync = () => {
      const on = !!ref.current && document.fullscreenElement === ref.current;
      setIsFullscreen(on);
      cb.current?.(on);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  }, []);

  return { ref, isFullscreen, toggle };
}
