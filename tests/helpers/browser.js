// Drives a hidden (headless) Edge or Chrome over the DevTools protocol, for the browser tests.
// connect() starts the browser when none is listening on port 9333 yet, and closes it again when the
// test ends. Set BROWSER to the browser's path if it is installed somewhere unusual.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { OUTPUT } = require('./site');

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let launched = null;

function browserPath() {
  const candidates = [
    process.env.BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Edge or Chrome found. Set BROWSER to its path.');
  return found;
}

async function listening() {
  try {
    return (await fetch('http://localhost:' + PORT + '/json/version')).ok;
  } catch (err) {
    return false;
  }
}

// Starts the hidden browser if needed. Returns true when this process started it.
async function ensureBrowser() {
  if (await listening()) return false;
  const profile = path.join(OUTPUT, 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  launched = spawn(browserPath(), ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  process.on('exit', stopBrowser);
  for (let waited = 0; waited < 30000; waited += 300) {
    if (await listening()) return true;
    await sleep(300);
  }
  throw new Error('The hidden browser did not start.');
}

function stopBrowser() {
  if (launched) {
    try { launched.kill(); } catch (err) { /* already gone */ }
    launched = null;
  }
}

async function connect() {
  await ensureBrowser();
  const page = (await (await fetch('http://localhost:' + PORT + '/json')).json()).find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = {};
  const errors = [];
  const netIssues = [];
  const urls = {};
  const dialogs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception.description.split('\n')[0]);
    if (d.method === 'Network.requestWillBeSent') urls[d.params.requestId] = d.params.request.url;
    if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) netIssues.push(d.params.response.status + ' ' + d.params.response.url);
    if (d.method === 'Network.loadingFailed' && !d.params.canceled) netIssues.push('FAILED ' + d.params.errorText + ' ' + (urls[d.params.requestId] || ''));
    if (d.method === 'Page.javascriptDialogOpening') {
      dialogs.push(d.params.message);
      send('Page.handleJavaScriptDialog', { accept: true });
    }
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
  };
  const send = (method, params) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result.exceptionDetails ? 'JS ERROR: ' + r.result.exceptionDetails.exception.description.split('\n')[0] : r.result.result.value;
  };
  const waitFor = async (expr, ms = 10000) => {
    for (let t = 0; t < ms; t += 200) { if ((await js(expr)) === true) return true; await sleep(200); }
    return false;
  };
  const go = async (url, ready) => {
    await send('Page.navigate', { url });
    await sleep(300);
    await waitFor(`document.readyState === 'complete'` + (ready ? ' && (' + ready + ')' : ''));
  };
  const setFile = async (selector, filePath) => {
    const doc = await send('DOM.getDocument', { depth: 0 });
    const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector });
    await send('DOM.setFileInputFiles', { files: [filePath], nodeId: node.result.nodeId });
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Network.enable');
  const targets = async () => (await (await fetch('http://localhost:' + PORT + '/json')).json());
  return { send, js, waitFor, go, setFile, errors, netIssues, dialogs, targets, close: () => ws.close() };
}

module.exports = { connect, sleep, ensureBrowser, stopBrowser };
