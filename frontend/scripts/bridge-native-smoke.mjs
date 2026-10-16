import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Regression harness: a clean Chrome profile, never the user's cookies/profile.
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const scratch = process.env.TMPDIR || tmpdir();
const profile = await mkdtemp(path.join(scratch, 'vinted-bridge-native-'));
const browser = spawn(chromePath, [
  '--headless=new', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
let socket;
const pending = new Map();
let nextId = 0;
try {
  const deadline = Date.now() + 15000;
  let port;
  while (Date.now() < deadline && !port) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
    catch { await pause(100); }
  }
  assert.ok(port, 'Headless Chrome failed to start');
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const target = targets.find(t => t.type === 'page');
  assert.ok(target, 'No headless page target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    clearTimeout(p.timer);
    if (message.error) p.reject(new Error(JSON.stringify(message.error)));
    else p.resolve(message.result);
  });
  function send(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression, contextId) {
    const response = await send('Runtime.evaluate', {
      expression, ...(contextId ? { contextId } : {}),
      returnByValue: true, awaitPromise: true,
    });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  await send('Page.enable');
  await evaluate(`(() => {
    document.body.innerHTML = '<form><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></form>';
    window.uploadCountSeenByPage = -1;
    document.querySelector('input').addEventListener('change', event => {
      window.uploadCountSeenByPage = event.target.files.length;
    });
  })()`);
  const { frameTree } = await send('Page.getFrameTree');
  const { executionContextId } = await send('Page.createIsolatedWorld', {
    frameId: frameTree.frame.id, worldName: 'vinted-assistant-smoke',
  });
  const corePath = fileURLToPath(new URL('../vinted-extension/bridge-core.js', import.meta.url));
  await evaluate(await readFile(corePath, 'utf8'), executionContextId);
  const assignment = await evaluate(`VintedAssistantBridge.assignPhotoFiles(document, [new File(['test-only'], 'fixture.jpg', {type:'image/jpeg'})])`, executionContextId);
  const observed = await evaluate(`({
    eventFiles: window.uploadCountSeenByPage,
    nativeFiles: document.querySelector('input').files.length,
    formFileName: new FormData(document.querySelector('form')).get('photos').name,
  })`);
  console.log(JSON.stringify({ assignment, observed }, null, 2));
  assert.equal(assignment, true);
  assert.equal(observed.eventFiles, 1, 'The page must see the photo in its own JS world');
  assert.equal(observed.nativeFiles, 1, 'Native input.files must contain the photo');
  assert.equal(observed.formFileName, 'fixture.jpg', 'The real form must carry the selected file');
  console.log('PASS: isolated content script delivers a native file to the page and FormData.');
} finally {
  socket?.close();
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Browser closed')); }
  if (process.platform === 'win32' && browser.pid) spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
  else browser.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
