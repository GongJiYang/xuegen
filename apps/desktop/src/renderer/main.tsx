import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import * as client from "./core/client.js";
import { setTodayOverride } from "./core/today.js";
import "./index.css";

/**
 * Apply the `XUEGEN_TODAY` override (delivered on the settings channel as
 * `todayOverride`) before the first render: every date-dependent request the
 * app then sends already uses the pinned day. A missing bridge — a plain
 * browser or a test harness — simply keeps the real clock.
 */
async function bootstrap(): Promise<void> {
  try {
    const settings = await client.getSettings();
    setTodayOverride(settings.todayOverride ?? null);
  } catch {
    // No preload bridge: the real clock applies.
  }
  const container = document.getElementById("root");
  if (!container) throw new Error("missing #root");
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void bootstrap();
