// One-step launcher (used by start.bat): installs packages, creates .env, checks that MySQL is
// reachable, creates the database and sample data on first run, then starts the server and
// opens the site in the browser.
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

function readEnv(envPath) {
  const values = {};
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = /^\s*([A-Z_]+)\s*=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  });
  return values;
}

// The site keeps its data in MySQL: ask once for the connection details and remember them in .env.
async function ensureDatabaseSettings(envPath) {
  const current = readEnv(envPath);
  if (current.DB_HOST || current.DB_USER || current.DB_PASSWORD !== undefined) return;

  console.log('');
  console.log('The site stores its data in MySQL (the same server MySQL Workbench connects to).');
  const user = (await ask('MySQL user [root]: ')) || 'root';
  const password = await ask('MySQL password for ' + user + ' (press Enter if it has none): ');
  const port = (await ask('MySQL port [3306]: ')) || '3306';
  fs.appendFileSync(envPath, '\nDB_HOST=127.0.0.1\nDB_PORT=' + port + '\nDB_USER=' + user + '\nDB_PASSWORD=' + password + '\nDB_NAME=cam_orphanage_connect\n');
  console.log('Saved the MySQL settings in server/.env');
}

async function checkMysql() {
  require('dotenv').config({ path: path.join(SERVER_DIR, '.env') });
  const mysql = require(path.join(SERVER_DIR, 'node_modules', 'mysql2', 'promise'));
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
    });
    await conn.end();
    return true;
  } catch (err) {
    console.error('');
    console.error('Could not connect to MySQL: ' + err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('MySQL does not seem to be running. On Windows press Win+R, type services.msc, find "MySQL80" or "MySQL81" and click Start.');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('The user name or password is wrong. Fix DB_USER / DB_PASSWORD in server/.env (the password you use to open MySQL Workbench).');
    }
    return false;
  }
}

async function main() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error('This project needs Node.js 18 or newer (you have ' + process.version + ').');
    console.error('Install the LTS version from https://nodejs.org and try again.');
    process.exit(1);
  }

  if (await isRunning()) {
    console.log('The site is already running at ' + SITE_URL + ' — opening it.');
    openBrowser();
    return;
  }

  if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules', 'mysql2'))) {
    console.log('First run: installing server packages (needs internet, about a minute)...');
    run('npm install');
  }

  const envPath = path.join(SERVER_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, 'PORT=' + PORT + '\nJWT_SECRET=' + crypto.randomBytes(32).toString('hex') + '\nCORS_ORIGIN=*\n');
    console.log('Created server/.env with a random secret.');
  }
  await ensureDatabaseSettings(envPath);

  if (!(await checkMysql())) process.exit(1);

  // Safe to run every time: creates the database, the default admin and sample data only if missing.
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
