// Runs the automated tests against a throwaway copy of the site (helpers/site.js) and prints a summary.
//   node tests/run-all.js                 every suite (about 25 minutes)
//   node tests/run-all.js notify reset    only the suites named
// Each suite's full output is saved in tests/.output/<suite>.log.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const site = require('./helpers/site');
const browser = require('./helpers/browser');

// Suites run in groups, each with the site restarted on an empty database and its own settings.
const GROUPS = [
  {
    title: 'Main suites',
    env: { VIDEO_MAX_MB: '2', ORPHANAGE_VIDEO_QUOTA_MB: '5' }, // small video limits keep the video tests quick
    suites: [
      'flag-hide', 'pledge-journey', 'profile-api', 'orphanage-api', 'donor-api', 'gate-api', 'partner-api', 'chat-api',
      'visits-api', 'posts-api', 'admin-crud', 'race', 'partner-profile-ui', 'profile-ui', 'orphanage-ui', 'donor-ui',
      'gate-ui', 'partner-ui', 'chat-ui', 'chat-everywhere', 'visits-ui', 'posts-ui', 'public-flow', 'consent', 'site-audit',
    ],
  },
  {
    title: 'Sign-in limits (a 6-second wait instead of 15 minutes)',
    env: { LOGIN_LOCK_MINUTES: '0.1', LOGIN_MAX_PER_ADDRESS: '40', LOGIN_MAX_PER_EMAIL: '8' },
    suites: ['login-guard'],
  },
  {
    title: 'Emails (caught by a local mail server, nothing is really sent)',
    env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: '2525' },
    suites: ['reset', 'notify'],
  },
];

// Most suites end with ALL PASSED or "<n> FAILED". The older ones print what they saw instead;
// for those, obvious problems are still caught here, and the log shows the details.
function verdict(code, output) {
  if (/\bALL PASSED\b/.test(output) && code === 0) return 'passed';
  if (code !== 0 || /\b\d+ FAILED\b|CRASH|TEST FAILED|AUDIT FAILED/.test(output)) return 'FAILED';
  // Lines such as "22 failed requests: none" or "14 page JS errors: none" must end in "none".
  const problem = output.split(/\r?\n/).some((line) => /page JS errors|failed requests/i.test(line) && line.includes(':') &&
    line.slice(line.lastIndexOf(':') + 1).trim() !== 'none');
  if (problem || /pages with issues: [1-9]/.test(output)) return 'FAILED';
  return 'ran (it prints what it saw: see the log)';
}

function runSuite(name) {
  return new Promise((resolve) => {
    const log = path.join(site.OUTPUT, name + '.log');
    let output = '';
    const child = spawn(process.execPath, [path.join(__dirname, 'suites', name + '.js')], { cwd: __dirname });
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('exit', (code) => {
      fs.writeFileSync(log, output);
      resolve({ name, code, result: verdict(code, output) });
    });
  });
}

(async () => {
  const wanted = process.argv.slice(2);
  const known = GROUPS.flatMap((g) => g.suites);
  const unknown = wanted.filter((n) => !known.includes(n));
  if (unknown.length) {
    console.log('Unknown suite(s): ' + unknown.join(', ') + '\nKnown: ' + known.join(', '));
    process.exit(2);
  }
  if (typeof WebSocket === 'undefined') {
    console.log('The browser tests need Node.js 22 or newer (this is ' + process.version + '). Install the LTS version from https://nodejs.org.');
    process.exit(2);
  }
  fs.mkdirSync(site.OUTPUT, { recursive: true });
  const s = site.dbSettings();
  console.log('Test site: ' + site.SITE + ' | test database: ' + s.database + ' on ' + s.host + ':' + s.port + ' (deleted and rebuilt)');
  const startedBrowser = await browser.ensureBrowser();

  const results = [];
  for (const group of GROUPS) {
    const suites = group.suites.filter((n) => wanted.length === 0 || wanted.includes(n));
    if (suites.length === 0) continue;
    console.log('\n' + group.title);
    await site.start(group.env);
    for (const name of suites) {
      const r = await runSuite(name);
      results.push(r);
      console.log('  ' + name.padEnd(20) + r.result);
    }
    await site.stop();
  }
  if (startedBrowser) browser.stopBrowser();

  const failed = results.filter((r) => r.result === 'FAILED');
  console.log('\n' + results.length + ' suites: ' + results.filter((r) => r.result === 'passed').length + ' passed, ' +
    failed.length + ' failed, ' + results.filter((r) => r.result.startsWith('ran')).length + ' printed their results. Logs: ' + site.OUTPUT);
  process.exit(failed.length ? 1 : 0);
})().catch(async (err) => {
  console.error('Could not run the tests: ' + err.message);
  await site.stop();
  browser.stopBrowser();
  process.exit(2);
});
