// A throwaway copy of the site for the tests, at http://127.0.0.2:4555, with its own empty database
// and its own upload folder, so nothing touches the real site, its data or its files.
//
// It uses the MySQL server from server/.env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) unless TEST_DB_HOST,
// TEST_DB_PORT, TEST_DB_USER or TEST_DB_PASSWORD are set. The test database is TEST_DB_NAME (default
// cam_orphanage_connect_test). It is deleted and built again at every start, so its name must end in
// "_test": the real database can never be picked by mistake.
//
// The address is 127.0.0.2 on purpose: the pages send "localhost" visitors to the real site on port 4000.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'server');
const OUTPUT = path.join(__dirname, '..', '.output');
const LOG = path.join(OUTPUT, 'site.log');
const HOST = '127.0.0.2';
const PORT = 4555;
const SITE = 'http://' + HOST + ':' + PORT;
const ADMIN = { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' };

// The KEY=value lines of server/.env (only what the database settings need).
function readEnvFile() {
  const file = path.join(SERVER, '.env');
  const values = {};
  if (!fs.existsSync(file)) return values;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
  return values;
}

function dbSettings() {
  const env = readEnvFile();
  const pick = (name, fallback) => (process.env['TEST_' + name] !== undefined ? process.env['TEST_' + name] : (env[name] !== undefined ? env[name] : fallback));
  const settings = {
    host: pick('DB_HOST', '127.0.0.1'),
    port: Number(pick('DB_PORT', 3306)),
    user: pick('DB_USER', 'root'),
    password: pick('DB_PASSWORD', ''),
    database: process.env.TEST_DB_NAME || 'cam_orphanage_connect_test',
  };
  if (!/^[A-Za-z0-9_]+_test$/.test(settings.database)) {
    throw new Error('The test database name must end in "_test" (it is deleted at every start): ' + settings.database);
  }
  return settings;
}

function mysql() {
  return require(path.join(SERVER, 'node_modules', 'mysql2', 'promise'));
}

async function resetDatabase(settings) {
  const conn = await mysql().createConnection({ host: settings.host, port: settings.port, user: settings.user, password: settings.password });
  try {
    await conn.query('DROP DATABASE IF EXISTS `' + settings.database + '`');
  } finally {
    await conn.end();
  }
}

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
    req.setTimeout(2000, () => { req.destroy(); resolve(0); });
  });
}

let child = null;

// Starts the test site on an empty database. `extra` adds settings, for example a mail server.
async function start(extra) {
  await stop();
  const settings = dbSettings();
  await resetDatabase(settings);
  fs.mkdirSync(OUTPUT, { recursive: true });
  const uploads = path.join(OUTPUT, 'uploads');
  fs.rmSync(uploads, { recursive: true, force: true });

  // Every setting the site reads is given here, so nothing comes from the real server/.env
  // (an empty value counts as given): no real mail server, no production mode.
  const env = Object.assign({}, process.env, {
    NODE_ENV: '', PORT: String(PORT), IP: HOST, HOST: '', CORS_ORIGIN: '*',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, SEED_SAMPLE_DATA: 'false', SUPPORT_EMAIL: '',
    DB_HOST: settings.host, DB_PORT: String(settings.port), DB_USER: settings.user, DB_PASSWORD: settings.password, DB_NAME: settings.database,
    UPLOAD_DIR: uploads, SITE_URL: SITE,
    SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: '',
    VIDEO_MAX_MB: '', ORPHANAGE_VIDEO_QUOTA_MB: '',
    LOGIN_MAX_ATTEMPTS: '', LOGIN_MAX_PER_EMAIL: '', LOGIN_MAX_PER_ADDRESS: '', LOGIN_LOCK_MINUTES: '',
  }, extra || {});

  const out = fs.openSync(LOG, 'w');
  child = spawn(process.execPath, ['src/index.js'], { cwd: SERVER, env, stdio: ['ignore', out, out] });
  const started = child;
  child.on('exit', () => { if (child === started) child = null; });

  // The first start builds the database from database/cam_orphanage_connect.sql, which takes a moment.
  for (let waited = 0; waited < 90000; waited += 500) {
    if ((await get(SITE + '/api/health')) === 200) return;
    if (!child) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The test site did not start. See ' + LOG);
}

async function stop() {
  if (!child) return;
  const running = child;
  await new Promise((resolve) => {
    running.once('exit', resolve);
    running.kill();
    setTimeout(resolve, 5000);
  });
  child = null;
}

module.exports = { ROOT, OUTPUT, LOG, SITE, API: SITE + '/api', ADMIN, dbSettings, start, stop };
