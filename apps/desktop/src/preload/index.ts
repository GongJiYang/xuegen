/**
 * Preload: the only bridge between the sandboxed renderer and the main process.
 *
 * Exposes a minimal, typed API on `window.xuegen`. The renderer gets no Node or
 * Electron module; it can only send the protocol's request messages, subscribe
 * to the protocol's event messages, and read/write desktop settings.
 */

import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentToHostMessage,
  DesktopSettings,
  HostToAgentMessage,
  IpcEnvelope,
  XuegenBridge,
} from "../shared/protocol.js";
import { DATA_CHANNEL, IPC_CHANNEL, SETTINGS_CHANNEL } from "../shared/protocol.js";
import type { DataRequest, DataResultFor } from "../shared/data-protocol.js";

const bridge: XuegenBridge = {
  send(request: HostToAgentMessage): void {
    const envelope: IpcEnvelope<HostToAgentMessage> = { channel: IPC_CHANNEL, payload: request };
    ipcRenderer.send(IPC_CHANNEL, envelope);
  },
  subscribe(listener: (event: AgentToHostMessage) => void): () => void {
    const handler = (_event: unknown, payload: AgentToHostMessage): void => listener(payload);
    ipcRenderer.on(IPC_CHANNEL, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNEL, handler);
  },
  getSettings(): Promise<DesktopSettings> {
    return ipcRenderer.invoke(SETTINGS_CHANNEL, { action: "get" });
  },
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings> {
    return ipcRenderer.invoke(SETTINGS_CHANNEL, { action: "set", patch });
  },
  data<K extends DataRequest["kind"]>(
    request: Extract<DataRequest, { kind: K }>,
  ): Promise<DataResultFor<K>> {
    return ipcRenderer.invoke(DATA_CHANNEL, request) as Promise<DataResultFor<K>>;
  },
};

contextBridge.exposeInMainWorld("xuegen", bridge);
