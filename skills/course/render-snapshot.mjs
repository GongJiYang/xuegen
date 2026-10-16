#!/usr/bin/env node
// Render a local, dated study snapshot from JSON on stdin; no report database.
import { mkdir, mkdtemp, rm, access, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let browserProcess, socket, temporary, outputFile, incompleteOutput;
const pending = new Map();
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  for (const key of ['title', 'date', 'goal', 'next', 'source']) {
    if (typeof report[key] !== 'string' || !report[key].trim()) throw new Error(`Missing text field: ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date) || new Date(`${report.date}T12:00:00Z`).toISOString().slice(0, 10) !== report.date) throw new Error('Invalid report date');
  for (const key of ['week', 'overall']) {
    if (!report[key] || typeof report[key].label !== 'string' || !Array.isArray(report[key].tasks)) throw new Error(`Invalid ${key} section`);
    for (const task of report[key].tasks) {
      if (typeof task.label !== 'string' || typeof task.done !== 'boolean' || (task.detail !== undefined && typeof task.detail !== 'string')) throw new Error(`Invalid task in ${key}`);
    }
  }
  if (!Array.isArray(report.evidence) || report.evidence.some((item) => typeof item !== 'string')) throw new Error('evidence must be a text array');
  if (report.note !== undefined && typeof report.note !== 'string') throw new Error('note must be text');
  await access(resolve(report.source));
  if (!process.argv[2]?.endsWith('.png')) throw new Error('Usage: node render-snapshot.mjs OUTPUT.png < report.json');
  const output = resolve(process.argv[2]);
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
  let chrome;
  for (const candidate of candidates) { if (await access(candidate).then(() => true, () => false)) { chrome = candidate; break; } }
  if (!chrome) throw new Error('Chrome/Chromium not found. Set CHROME_PATH to its executable; the Markdown remains saved.');
  const panel = (heading, section) => {
    const done = section.tasks.filter((task) => task.done).length;
    return `<section><div class="eyebrow">${heading}</div><h2>${escape(section.label)}</h2><div class="score">${section.tasks.length ? `${done}<small> / ${section.tasks.length}</small>` : '<small>尚未设定</small>'}</div><div class="caption">已核实的计划项 · 不代表掌握率</div><div class="track"><i style="width:${section.tasks.length ? done / section.tasks.length * 100 : 0}%"></i></div><ul>${section.tasks.map((task) => `<li><span class="check ${task.done ? 'done' : ''}">${task.done ? '✓' : ''}</span><div>${escape(task.label)}${task.detail ? `<p>${escape(task.detail)}</p>` : ''}</div></li>`).join('')}</ul></section>`;
  };
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>学习快照</title><style>
*{box-sizing:border-box}body{margin:0;width:1200px;padding:52px 56px;background:#f5f3eb;color:#223a32;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC",sans-serif;line-height:1.6;overflow-wrap:anywhere}.top{display:flex;justify-content:space-between;align-items:center;font-size:17px;letter-spacing:1px}.date{border:1px solid #c6d2c6;padding:6px 16px;border-radius:30px;background:#fffdf7}h1{font-size:44px;line-height:1.25;margin:24px 0 12px;letter-spacing:-1px}.goal{font-size:19px;color:#526357;margin:0 0 30px;max-width:1020px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}section{background:#fffdf8;border:1px solid #d9dfd2;border-radius:20px;padding:28px}.eyebrow{font-size:15px;color:#61756b;letter-spacing:2px}h2{font-size:23px;margin:8px 0}.score{font-size:54px;line-height:1.25;font-weight:650}.score small{font-size:26px;color:#7b877e;font-weight:450}.caption{font-size:14px;color:#6b776e;margin-top:5px}.track{height:7px;background:#e5e9de;border-radius:7px;margin:18px 0 20px;overflow:hidden}.track i{display:block;height:100%;background:#46705b}ul{list-style:none;padding:0;margin:0}li{display:flex;gap:12px;align-items:flex-start;font-size:18px;padding:10px 0;border-bottom:1px solid #edf0e7}li:last-child{border:0}.check{flex:none;width:19px;height:19px;border:1.5px solid #a3b1a0;border-radius:5px;margin-top:5px;font-size:14px;line-height:17px;text-align:center}.done{background:#46705b;border-color:#46705b;color:white}li p{font-size:14px;line-height:1.65;color:#6c796e;margin:4px 0 0}.evidence{margin-top:24px;padding:24px 28px;background:#e8ede2;border-radius:18px}.evidence h2{margin-top:0}.evidence p{margin:8px 0;font-size:17px}.next{margin-top:24px;border-left:4px solid #56745b;padding:3px 0 3px 20px;font-size:20px}.next b{display:block;font-size:14px;letter-spacing:2px;color:#61756b;margin-bottom:4px}.note{margin-top:20px;font-size:14px;color:#6b6757}.footer{margin-top:28px;display:flex;justify-content:space-between;gap:24px;font-size:13px;color:#7b857a}
</style><body><div class="top"><b>XUEGEN · 学根</b><span class="date">${escape(report.date)}</span></div><h1>${escape(report.title)}</h1><p class="goal">总目标：${escape(report.goal)}</p><div class="grid">${panel('本周目标', report.week)}${panel('总目标进度', report.overall)}</div><div class="evidence"><h2>本次学习留下的证据</h2>${report.evidence.map((item) => `<p>${escape(item)}</p>`).join('') || '<p>暂无可核实作答；不据此标记完成。</p>'}</div><div class="next"><b>下次从这里继续</b>${escape(report.next)}</div>${report.note ? `<div class="note">${escape(report.note)}</div>` : ''}<div class="footer"><span>来源：${escape(basename(report.source))}</span><span>Markdown 是原始记录 · 图片是本次快照</span></div></body></html>`;
  temporary = await mkdtemp(join(tmpdir(), 'xuegen-snapshot-'));
  browserProcess = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${join(temporary, 'profile')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise((fulfill) => browserProcess.once('exit', fulfill));
  const endpoint = await new Promise((fulfill, reject) => {
    let logs = '';
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    const fail = (error) => { clearTimeout(timer); reject(error); };
    browserProcess.once('error', fail);
    browserProcess.once('exit', () => fail(new Error('Chrome exited before becoming ready')));
    browserProcess.stderr.on('data', (chunk) => {
      logs = (logs + chunk.toString()).slice(-8192);
      const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); fulfill(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((fulfill, reject) => { socket.addEventListener('open', fulfill, { once: true }); socket.addEventListener('error', () => reject(new Error('Cannot connect to Chrome')), { once: true }); });
  let sequence = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!pending.has(message.id)) return;
    const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.fulfill(message.result);
  });
  socket.addEventListener('close', () => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Chrome disconnected')); } pending.clear(); });
  const call = (method, params = {}, sessionId) => new Promise((fulfill, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timed out: ${method}`)); }, 15000);
    pending.set(id, { fulfill, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await call('Page.enable', {}, sessionId);
  const { frameTree } = await call('Page.getFrameTree', {}, sessionId);
  await call('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId);
  const ready = await call('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => document.documentElement.scrollHeight)', awaitPromise: true, returnByValue: true }, sessionId);
  if (ready.exceptionDetails || !Number.isFinite(ready.result.value)) throw new Error('Report layout did not load');
  const height = ready.result.value;
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1200, height, scale: 1 } }, sessionId);
  const png = Buffer.from(data, 'base64');
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Chrome returned an invalid PNG');
  await mkdir(dirname(output), { recursive: true });
  outputFile = await open(output, 'wx');
  incompleteOutput = output;
  await outputFile.writeFile(png); await outputFile.close(); outputFile = undefined;
  incompleteOutput = undefined;
  console.log(JSON.stringify({ path: output, width: 1200, height, date: report.date }));
  await call('Browser.close');
  await exited;
} catch (error) {
  console.error(`Snapshot failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (outputFile) await outputFile.close();
  if (incompleteOutput) await rm(incompleteOutput, { force: true });
  socket?.close();
  if (browserProcess?.pid && browserProcess.exitCode === null) {
    const stopped = new Promise((fulfill) => browserProcess.once('exit', fulfill));
    browserProcess.kill('SIGKILL');
    await stopped;
  }
  if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
