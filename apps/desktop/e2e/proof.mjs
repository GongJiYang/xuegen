/* global process, console, fetch, WebSocket, setTimeout, Buffer */
// Proof window: run the real desktop app on test data and capture evidence an
// agent can attach to its report or PR (screenshots, a contrast scan, values
// read from the page). Never points at the user's real home or vault.
//
//   npm run proof -- start --root /tmp/xg-e2e [--today 2026-11-17] [--port 9460]
//   npm run proof -- shot <name> [--scheme light|dark] [--width 1920] [--js '<code>']
//   npm run proof -- contrast [--scheme light|dark] [--width 1920]
//   npm run proof -- eval '<code>'
//   npm run proof -- stop --root /tmp/xg-e2e
//
// The root holds home/ (XUEGEN_HOME; its wiki.json names the test vault) and
// workspace/. Screenshots go to proof/ (gitignored) unless --out says otherwise.
// <code> runs in the page inside an async function: `return` a value to print it.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...rest] = process.argv.slice(2);

function options(args) {
  const named = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) named[args[i].slice(2)] = args[(i += 1)];
    else positional.push(args[i]);
  }
  return { named, positional };
}

const { named, positional } = options(rest);
const port = Number(named.port ?? process.env.XUEGEN_PROOF_PORT ?? 9460);

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Connect to the app's page over the Chrome DevTools Protocol. */
async function connect() {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
    (res) => res.json(),
    () => fail(`没有测试窗口在端口 ${port}。先 npm run proof -- start --root <目录>`),
  );
  const page = targets.find((target) => target.type === "page");
  if (!page) fail(`端口 ${port} 上没有页面`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done) => ws.addEventListener("open", done));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
  const send = (method, params = {}) =>
    new Promise((done) => {
      waiting.set((id += 1), done);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function evaluate(send, code) {
  const reply = await send("Runtime.evaluate", {
    expression: `(async () => { ${code} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (reply.result?.exceptionDetails) fail(`页面里出错：${reply.result.exceptionDetails.exception?.description}`);
  return reply.result?.result?.value ?? null;
}

/** Colour scheme and width for the next capture; `--scheme` absent keeps the system one. */
async function emulate(send) {
  // Colour transitions would leave the page half-switched when it is read.
  await evaluate(
    send,
    `if (!document.getElementById("proof-still")) {
       const style = document.createElement("style");
       style.id = "proof-still";
       style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
       document.head.append(style);
     }`,
  );
  const features = named.scheme ? [{ name: "prefers-color-scheme", value: named.scheme }] : [];
  await send("Emulation.setEmulatedMedia", { features });
  if (named.width) {
    // The viewport override alone leaves the layout at the window's own width
    // (a 1920 shot of a 1440 window is 1440 of page and 480 of blank), so the
    // window itself is resized first.
    const width = Number(named.width);
    const height = Number(named.height ?? 1080);
    const { result } = await send("Browser.getWindowForTarget");
    if (result?.windowId) {
      await send("Browser.setWindowBounds", { windowId: result.windowId, bounds: { windowState: "normal" } });
      await send("Browser.setWindowBounds", { windowId: result.windowId, bounds: { width, height } });
    }
    await send("Emulation.setDeviceMetricsOverride", {
      width: Number(named.width),
      height: Number(named.height ?? 1080),
      deviceScaleFactor: 1,
      mobile: false,
    });
  } else {
    await send("Emulation.clearDeviceMetricsOverride");
  }
}

function guardRoot(root) {
  const real = [join(homedir(), ".xuegen"), join(homedir(), "xuegen-data")];
  if (real.some((dir) => root === dir || root.startsWith(dir + "/"))) fail(`拒绝：${root} 是真实数据目录`);
  if (!existsSync(join(root, "home", "wiki.json"))) fail(`${root}/home/wiki.json 不存在：测试库要先放好`);
}

async function start() {
  if (!named.root) fail("start 要 --root <测试目录>");
  const root = resolve(named.root);
  guardRoot(root);
  mkdirSync(join(root, "workspace"), { recursive: true });
  const env = { ...process.env, XUEGEN_HOME: join(root, "home"), XUEGEN_DESKTOP_CWD: join(root, "workspace") };
  delete env.NODE_OPTIONS;
  const ankiPort = Number(named.anki ?? 18765);
  env.XUEGEN_ANKI_URL = `http://127.0.0.1:${ankiPort}`;
  if (named.today) env.XUEGEN_TODAY = named.today;
  const log = join(root, `proof-${port}.log`);
  const output = openSync(log, "w");
  const detach = (file, args) => {
    const child = spawn(file, args, { cwd: APP, env, detached: true, stdio: ["ignore", output, output] });
    child.unref();
    return child.pid;
  };
  const anki = detach(process.execPath, [join(APP, "e2e", "fake-anki.mjs"), String(named.due ?? 42), String(ankiPort)]);
  const app = detach("npx", ["electron-vite", "dev", "--remoteDebuggingPort", String(port)]);
  writeFileSync(join(root, `proof-${port}.pids`), JSON.stringify({ app, anki }));
  for (let waited = 0; waited < 120; waited += 1) {
    const ready = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((res) => res.json())
      .then((targets) => targets.some((target) => target.type === "page"))
      .catch(() => false);
    if (ready) {
      console.log(`测试窗口已开：端口 ${port}，home ${env.XUEGEN_HOME}${named.today ? `，今天 ${named.today}` : ""}，日志 ${log}`);
      return;
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  fail(`两分钟没起来，看 ${log}`);
}

function stop() {
  if (!named.root) fail("stop 要 --root <测试目录>");
  const file = join(resolve(named.root), `proof-${port}.pids`);
  if (!existsSync(file)) fail(`${file} 不存在：这个窗口不是 proof start 开的`);
  for (const pid of Object.values(JSON.parse(readFileSync(file, "utf8")))) {
    try {
      process.kill(-pid);
    } catch {
      // Already gone.
    }
  }
  rmSync(file);
  console.log("测试窗口已关");
}

async function shot() {
  const name = positional[0] ?? "now";
  const out = resolve(named.out ?? join(APP, "proof"));
  mkdirSync(out, { recursive: true });
  const { send, close } = await connect();
  await emulate(send);
  if (named.js) console.log(JSON.stringify(await evaluate(send, named.js)));
  await new Promise((done) => setTimeout(done, 800));
  const capture = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  if (!capture.result?.data) fail(`截图失败：${JSON.stringify(capture)}`);
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(capture.result.data, "base64"));
  close();
  console.log(file);
}

async function contrast() {
  const { send, close } = await connect();
  await emulate(send);
  await new Promise((done) => setTimeout(done, 800));
  const rows = await evaluate(send, readFileSync(join(APP, "e2e", "contrast.js"), "utf8"));
  close();
  for (const row of rows) console.log(row.join(" | "));
  console.log(`低于 4.5:1：${rows.length} 处`);
}

async function run() {
  const { send, close } = await connect();
  console.log(JSON.stringify(await evaluate(send, positional[0] ?? "return document.title;"), null, 1));
  close();
}

const commands = { start, stop, shot, contrast, eval: run };
if (!commands[command]) fail(`用法：proof.mjs <${Object.keys(commands).join("|")}> …（见文件开头）`);
setTimeout(() => fail("超时"), command === "start" ? 150_000 : 40_000).unref();
await commands[command]();
process.exit(0);
