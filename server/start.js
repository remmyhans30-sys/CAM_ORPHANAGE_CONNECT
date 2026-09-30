// One-step launcher (used by start.bat): installs packages and creates .env and the
// database on first run, then starts the server and opens the site in the browser.
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = __dirname;
const PORT = 4000;
const SITE_URL = 'http://localhost:' + PORT;

function run(command) {
  execSync(command, { cwd: SERVER_DIR, stdio: 'inherit' });
}

async function isRunning() {
  try {
    const res = await fetch(SITE_URL + '/api/health');
    return res.ok;
  } catch (err) {
    return false;
  }
}

function openBrowser() {
  if (process.env.NO_BROWSER) return;
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', SITE_URL]]
    : process.platform === 'darwin' ? ['open', [SITE_URL]]
    : ['xdg-open', [SITE_URL]];
  spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    console.error('This project needs Node.js 22.5 or newer (you have ' + process.version + ').');
    console.error('Install the LTS version from https://nodejs.org and try again.');
    process.exit(1);
  }

  if (await isRunning()) {
    console.log('The site is already running at ' + SITE_URL + ' — opening it.');
    openBrowser();
    return;
  }

  if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules'))) {
    console.log('First run: installing server packages (needs internet, about a minute)...');
    run('npm install');
  }

  const envPath = path.join(SERVER_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, 'PORT=' + PORT + '\nJWT_SECRET=' + crypto.randomBytes(32).toString('hex') + '\nCORS_ORIGIN=*\n');
    console.log('Created server/.env with a random secret.');
  }

  // Safe to run every time: only adds the default admin and sample data if missing.
  run('npm run seed --silent');

  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT) },
  });
  server.on('exit', (code) => process.exit(code || 0));

  for (let i = 0; i < 40; i++) {
    if (await isRunning()) {
      console.log('');
      console.log('Website ready: ' + SITE_URL);
      console.log('Keep this window open while you use the site. Close it to stop the site.');
      openBrowser();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.error('The server did not start. See the messages above.');
}

main();
