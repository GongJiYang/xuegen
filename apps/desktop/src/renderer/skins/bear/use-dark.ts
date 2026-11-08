/**
 * Whether the system appearance is dark, live (follows the macOS setting).
 * Bear's CSS switches by itself through `prefers-color-scheme`; this hook is for
 * the few colours drawn from JS (the canvas avatar, the window background).
 */
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

export function useDark(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
