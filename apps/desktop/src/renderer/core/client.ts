/**
 * Renderer-side client for the preload bridge.
 *
 * Components and hooks never read `window.xuegen` directly: they go through this
 * module, so the bridge can be stubbed in tests and replaced without touching
 * call sites. Every method is a thin, typed pass-through.
 */

import type {
  AgentToHostMessage,
  DesktopSettings,
  HostToAgentMessage,
  XuegenBridge,
} from "@shared/protocol.js";
import type { DataRequest, DataResultFor } from "@shared/data-protocol.js";

/** The preload bridge, or null when it is not installed (e.g. plain browser). */
function bridge(): XuegenBridge | null {
  if (typeof window === "undefined" || !window.xuegen) return null;
  return window.xuegen;
}

/** Send a request to the agent process. */
export function send(request: HostToAgentMessage): void {
  bridge()?.send(request);
}

/** Subscribe to agent events; returns an unsubscribe function. */
export function subscribe(listener: (event: AgentToHostMessage) => void): () => void {
  const current = bridge();
  if (!current) return () => undefined;
  return current.subscribe(listener);
}

/** Read the persisted desktop settings; rejects when the bridge is missing. */
export function getSettings(): Promise<DesktopSettings> {
  const current = bridge();
  if (!current) return Promise.reject(new Error("preload 桥未就绪：window.xuegen 不存在"));
  return current.getSettings();
}

/** Persist a partial settings update; rejects when the bridge is missing. */
export function setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings> {
  const current = bridge();
  if (!current) return Promise.reject(new Error("preload 桥未就绪：window.xuegen 不存在"));
  return current.setSettings(patch);
}

/**
 * Send a vault data request; resolves with `{ok:false}` when the bridge is
 * missing so callers handle "no backend" the same way as any other failure.
 */
export function data<K extends DataRequest["kind"]>(
  request: Extract<DataRequest, { kind: K }>,
): Promise<DataResultFor<K>> {
  const current = bridge();
  if (!current) {
    return Promise.resolve({
      ok: false,
      code: "unknown",
      error: "preload 桥未就绪：window.xuegen 不存在",
    });
  }
  return current.data(request);
}
