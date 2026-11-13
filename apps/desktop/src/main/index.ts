/**
 * Main process: window, menu, IPC routing, and agent-process supervision.
 *
 * The agent runs in an Electron `utilityProcess` (see `src/agent`). The main
 * process forwards renderer requests to it, relays its events back, and reports
 * or restarts it when it exits unexpectedly.
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  utilityProcess,
  type MenuItemConstructorOptions,
  type UtilityProcess,
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentToHostMessage,
  DesktopSettings,
  HostToAgentMessage,
  IpcEnvelope,
} from "../shared/protocol.js";
import {
  DATA_CHANNEL,
  IPC_CHANNEL,
  SETTINGS_CHANNEL,
  isCompactionPayload,
  isContextUsagePayload,
  isHostToAgentMessage,
  withValidRetry,
} from "../shared/protocol.js";
import { isDataRequest, type DataResponse } from "../shared/data-protocol.js";
// The agent-side module only computes a path from the filesystem; importing it
// here keeps a single implementation of the repo-root walk.
import { findRepoRoot } from "../agent/environment.js";
import { readSettings, readSettingsForRenderer, writeSettings } from "./settings.js";
import { handleDataRequest } from "./data/handler.js";
import { createUpdater, type Updater } from "./update.js";

/** A renderer settings request, validated at the boundary before it is applied. */
type SettingsRequest = { action: "get" } | { action: "set"; patch: Partial<DesktopSettings> };

function isSettingsRequest(value: unknown): value is SettingsRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.action === "get") return true;
  return record.action === "set" && typeof record.patch === "object" && record.patch !== null;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Dev-only Dock icon for the "学" pixel mark. Packaged builds get their icon
// from the bundler config instead, so this path is only read in development.
const DEV_DOCK_ICON = join(__dirname, "../../resources/app-icon.png");

// Must run before `app.whenReady()`: the Dock and menu bar read the name once at
// startup, so setting it later would leave "Electron" showing in development.
app.setName("学根");

let mainWindow: BrowserWindow | null = null;
let agentProcess: UtilityProcess | null = null;
let updater: Updater | null = null;
let restartCount = 0;
/** Set on before-quit so an agent exit during shutdown is not treated as a crash. */
let quitting = false;

/** The bundled agent entry, produced by electron-vite from `src/agent/index.ts`. */
function agentEntry(): string {
  return join(__dirname, "agent/index.js");
}

function sendToRenderer(event: AgentToHostMessage): void {
  mainWindow?.webContents.send(IPC_CHANNEL, event);
}

/** Drop a malformed automatic-retry marker: the hint is lost, never the answer. */
function messageWithValidRetry(event: AgentToHostMessage): AgentToHostMessage {
  if (event.type !== "message-start" && event.type !== "message-end") return event;
  if (event.message.retry === undefined) return event;
  return { ...event, message: withValidRetry(event.message) };
}

function startAgentProcess(): void {
  const entry = agentEntry();
  if (!existsSync(entry)) {
    sendToRenderer({ type: "fatal", error: `未找到 agent 进程入口：${entry}` });
    return;
  }

  sendToRenderer({ type: "agent-status", status: "starting" });

  let repoRoot: string | null = null;
  try {
    repoRoot = findRepoRoot();
  } catch (error) {
    sendToRenderer({ type: "fatal", error: error instanceof Error ? error.message : String(error) });
    return;
  }

  agentProcess = utilityProcess.fork(entry, [], {
    serviceName: "xuegen-agent",
    stdio: "pipe",
    env: {
      ...process.env,
      XUEGEN_REPO_ROOT: repoRoot,
    },
  });

  agentProcess.on("message", (message: AgentToHostMessage) => {
    // The agent is trusted code, but the payload still crosses a process
    // boundary: drop a malformed usage/compaction update rather than letting a
    // bad number reach the UI.
    if (message.type === "context-usage" && !isContextUsagePayload(message)) {
      console.error("[main] 收到非法上下文用量，已丢弃:", message);
      return;
    }
    if (message.type === "compaction" && !isCompactionPayload(message)) {
      console.error("[main] 收到非法压缩事件，已丢弃:", message);
      return;
    }
    // Reset the restart budget once the agent reports a healthy start.
    if (message.type === "agent-status" && message.status === "ready") restartCount = 0;
    sendToRenderer(messageWithValidRetry(message));
  });

  agentProcess.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[agent] ${chunk}`));
  agentProcess.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[agent] ${chunk}`));

  agentProcess.on("exit", (code: number) => {
    agentProcess = null;
    if (quitting) {
      sendToRenderer({ type: "agent-status", status: "stopped" });
      return;
    }
    // A clean exit is not a crash; report the lifecycle state without a fatal error.
    if (code === 0) {
      sendToRenderer({ type: "agent-status", status: "stopped" });
      return;
    }

    sendToRenderer({ type: "agent-status", status: "crashed" });
    restartCount += 1;
    if (restartCount <= 3) {
      sendToRenderer({ type: "agent-status", status: "restarting" });
      startAgentProcess();
    } else {
      sendToRenderer({ type: "fatal", error: "agent 进程反复退出，已停止自动重启。" });
    }
  });
}

/** The neutral window background used before any skin reports a colour. */
const DEFAULT_WINDOW_BACKGROUND = "#ffffff";

/**
 * The window background colour to open with.
 *
 * The renderer mirrors the active skin's paper colour into `windowBackground`,
 * so a persisted dark palette (e.g. Chicago's `amber`) opens dark instead of
 * flashing the default white first. Falls back to white when nothing is stored.
 */
function windowBackground(): string {
  const stored = readSettings().windowBackground;
  return stored || DEFAULT_WINDOW_BACKGROUND;
}

/**
 * Bring the window to the front.
 *
 * Launching from a terminal leaves the app without the active-window grant, so
 * `show()` alone can leave the window behind other apps and desktop spaces and
 * the user thinks nothing started. On macOS we also steal focus, which is safe
 * here because the only triggers are the initial launch and a visible-but-
 * unfocused recovery — never a background window popping up mid-session.
 */
function showAndFocus(): void {
  const window = mainWindow;
  if (!window) return;
  window.show();
  window.focus();
  if (process.platform === "darwin") app.focus({ steal: true });
}

/**
 * Install a menu with the everyday roles but *no* page-zoom items.
 *
 * Electron's default View menu carries resetZoom/zoomIn/zoomOut, whose
 * accelerators change the whole page's zoom factor; a fractional factor blurs
 * the pixel fonts. The renderer handles ⌘+ / ⌘- as a body-text step instead, so
 * only the menus users still need (app, file, edit, window) are built. The edit
 * role keeps undo/redo/cut/copy/paste/select-all working.
 */
function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { label: "检查更新…", click: () => void updater?.check(true) },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }
  template.push({ role: "fileMenu" }, { role: "editMenu" }, { role: "windowMenu" });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: windowBackground(),
    title: "Xuegen | 学根",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Pin the page zoom to 1: the pixel fonts are only crisp at 1:1. This also
  // covers pinch/trackpad zoom and any accelerator that slips past the menu.
  const contents = mainWindow.webContents;
  contents.on("did-finish-load", () => {
    contents.setZoomFactor(1);
    void contents.setVisualZoomLevelLimits(1, 1);
  });
  contents.on("zoom-changed", () => {
    if (contents.getZoomFactor() !== 1) contents.setZoomFactor(1);
  });

  mainWindow.on("ready-to-show", () => {
    showAndFocus();
    // Safety net: if the window still did not become visible (a missed event, a
    // slow first paint), force it a couple of seconds after the load finishes.
    mainWindow?.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) showAndFocus();
      }, 2000);
    });
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // External links open in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.on("before-quit", () => {
  quitting = true;
  agentProcess?.kill();
});

app.whenReady().then(() => {
  // In development the Dock shows Electron's own icon; swap in the 学 mark so
  // the running app is recognisable. Packaged builds set a real app icon, so
  // this only runs in dev (and only when the resource is actually present).
  if (process.platform === "darwin" && !app.isPackaged && existsSync(DEV_DOCK_ICON)) {
    app.dock?.setIcon(DEV_DOCK_ICON);
  }

  updater = createUpdater((status) => sendToRenderer({ type: "update-status", status }));
  startAgentProcess();
  installApplicationMenu();
  createWindow();
  // Packaged builds look for a newer release once, quietly, after start-up.
  if (app.isPackaged) setTimeout(() => void updater?.check(false), 8000);

  ipcMain.on(IPC_CHANNEL, (_event, envelope: IpcEnvelope<HostToAgentMessage>) => {
    // The renderer is not fully trusted; validate before forwarding to the agent.
    const payload: unknown = envelope?.payload;
    if (!isHostToAgentMessage(payload)) {
      console.error("[main] 收到非法渲染进程消息，已丢弃:", payload);
      return;
    }
    agentProcess?.postMessage(payload);
  });

  ipcMain.handle(SETTINGS_CHANNEL, (_event, request: unknown): DesktopSettings => {
    // Settings come from the renderer; validate the shape before touching disk.
    if (!isSettingsRequest(request)) {
      console.error("[main] 收到非法设置请求，已忽略:", request);
      return readSettingsForRenderer();
    }
    const next = request.action === "get" ? readSettingsForRenderer() : writeSettings(request.patch);
    // Keep the window background in step with the stored colour so a palette
    // switch updates the chrome behind a translucent moment (e.g. while the
    // renderer repaints) and the next launch opens in the right colour.
    if (next.windowBackground && mainWindow) {
      mainWindow.setBackgroundColor(next.windowBackground);
    }
    return next;
  });

  ipcMain.handle(DATA_CHANNEL, async (_event, request: unknown): Promise<DataResponse> => {
    // Data requests come from the renderer; validate the shape before any
    // script call, file write, or Anki socket is touched.
    if (!isDataRequest(request)) {
      console.error("[main] 收到非法数据请求，已忽略:", request);
      return { ok: false, code: "invalid-request", error: "请求格式非法。" };
    }
    try {
      if (request.kind === "update.check" && updater) return { ok: true, data: await updater.check(true) };
      if (request.kind === "update.download" && updater) return { ok: true, data: await updater.download() };
      if (request.kind === "update.install" && updater) return { ok: true, data: await updater.install() };
      return await handleDataRequest(request);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[main] 数据请求失败:", detail);
      return { ok: false, code: "unknown", error: `操作失败：${detail}` };
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
