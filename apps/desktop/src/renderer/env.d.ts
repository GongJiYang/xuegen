/// <reference types="vite/client" />
import type { XuegenBridge } from "../shared/protocol.js";

declare global {
  interface Window {
    xuegen: XuegenBridge;
  }
}

export {};
