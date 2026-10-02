// Password guessing protection on the three logins.
// Run the site with LOGIN_LOCK_MINUTES=0.1 (6 seconds), LOGIN_MAX_PER_ADDRESS=40 and LOGIN_MAX_PER_EMAIL=8.
// Each part sends its requests from its own local address, so the address counts stay apart.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(74), (ok ? 'ok' : 'FAIL') + (detail !== undefined && detail !== '' ? '  ' + detail : '')); if (!ok) failures++; };

function call(p, method, body, token, from) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {});
    const req = http.request({ host: '127.0.0.2', port: 4555, path: '/api' + p, method: method || 'GET', localAddress: from || '127.0.0.1', headers }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => { let b = {}; try { b = JSON.parse(raw); } catch (e) { /* not json */ } resolve({ status: res.statusCode, body: b }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const LOCKED = /^Too many sign-in attempts\. Please wait \d+ minutes? and try again\.$/;
const userLogin = (email, password, from) => call('/users/login', 'POST', { email, password }, null, from);
const partnerLogin = (email, password, from) => call('/partner-auth/login', 'POST', { email, password }, null, from);
const adminLogin = (email, password, from) => call('/auth/login', 'POST', { email, password }, null, from);
// What the shared login page does: the donor/orphanage login first, then the partner login on a 401.
async function sharedPage(email, password, from) {
  const first = await userLogin(email, password, from);
  return first.status === 401 ? partnerLogin(email, password, from) : first;
}

(async () => {
  const stamp = Date.now();
  const ADMIN = { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' };
  const reg = async (who, role) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: who + ' ' + stamp, email: who + stamp + '@example.com', password: 'secret1', role })).body;
  const d1 = await reg('lgdonor', 'user');
  const d2 = await reg('lgother', 'user');
  const d3 = await reg('lgreset', 'user');
  const d4 = await reg('lgpage', 'user');
  const d5 = await reg('lgspread', 'user');
  const home = await reg('lghome', 'volunteer');
  const pEmail = 'lgpartner' + stamp + '@example.com';
  await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'LG Partner ' + stamp, email: pEmail, password: 'secret1' });
  const p2Email = 'lgpartner2' + stamp + '@example.com';
  await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'LG Partner Two ' + stamp, email: p2Email, password: 'secret1' });
  check('setup: accounts created', Boolean(d1.token && d2.token && d3.token && d4.token && home.token));

  console.log('--- A DONOR WHO KEEPS GETTING THE PASSWORD WRONG');
  let r;
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await userLogin(d1.user.email, 'wrong-' + i, '127.0.0.11')).status);
  check('1 five wrong passwords are refused normally (401)', statuses.every((s) => s === 401), statuses.join(','));
  r = await userLogin(d1.user.email, 'secret1', '127.0.0.11');
  check('2 then even the right password has to wait (429)', r.status === 429 && LOCKED.test(r.body.error), r.status + ' ' + r.body.error);
  const lockedMessage = r.body.error;
  check('2b the real person on another computer can still sign in (nobody can lock them out)', (await userLogin(d1.user.email, 'secret1', '127.0.0.22')).status === 200);
  check('2c the computer that guessed still has to wait', (await userLogin(d1.user.email, 'secret1', '127.0.0.11')).status === 429);
  check('3 another account on the same computer can still sign in', (await userLogin(d2.user.email, 'secret1', '127.0.0.11')).status === 200);
  check('4 an orphanage account is protected the same way', await (async () => {
    for (let i = 0; i < 5; i++) await userLogin(home.user.email, 'nope', '127.0.0.19');
    return (await userLogin(home.user.email, 'secret1', '127.0.0.19')).status === 429;
  })());

  console.log('--- AN EMAIL WITH NO ACCOUNT LOOKS EXACTLY THE SAME');
  const ghost = 'nobody' + stamp + '@example.com';
  for (let i = 0; i < 5; i++) await userLogin(ghost, 'x' + i, '127.0.0.12');
  r = await userLogin(ghost, 'x', '127.0.0.12');
  check('5 unknown email: same 429 and same message (nothing reveals who is registered)', r.status === 429 && r.body.error === lockedMessage, r.status + ' ' + r.body.error);

  console.log('--- PARTNERS THROUGH THE SHARED LOGIN PAGE');
  for (let i = 0; i < 4; i++) await sharedPage(pEmail, 'bad' + i, '127.0.0.13');
  r = await sharedPage(pEmail, 'secret1', '127.0.0.13');
  check('6 four wrong tries on the shared page, then the right one works', r.status === 200 && Boolean(r.body.partner), String(r.status));
  for (let i = 0; i < 4; i++) await sharedPage(pEmail, 'bad' + i, '127.0.0.13');
  r = await sharedPage(pEmail, 'secret1', '127.0.0.13');
  check('7 a successful sign-in starts the count again on that computer', r.status === 200, String(r.status));
  for (let i = 0; i < 5; i++) await sharedPage(pEmail, 'bad' + i, '127.0.0.20');
  r = await sharedPage(pEmail, 'secret1', '127.0.0.20');
  check('8 five wrong tries on the shared page lock the partner too', r.status === 429 && LOCKED.test(r.body.error), r.status + ' ' + r.body.error);

  console.log('--- ADMINS, AND THE WAIT RUNNING OUT');
  for (let i = 0; i < 5; i++) await adminLogin(ADMIN.email, 'guess' + i, '127.0.0.15');
  r = await adminLogin(ADMIN.email, ADMIN.password, '127.0.0.15');
  check('9 the admin login is protected too', r.status === 429 && LOCKED.test(r.body.error), r.status + ' ' + r.body.error);
  await sleep(6500);
  r = await adminLogin(ADMIN.email, ADMIN.password, '127.0.0.15');
  check('10 after the wait the right password works again', r.status === 200 && Boolean(r.body.token), String(r.status));

  console.log('--- A PASSWORD RESET UNLOCKS STRAIGHT AWAY');
  for (let i = 0; i < 5; i++) await userLogin(d3.user.email, 'wrong', '127.0.0.16');
  check('11 the account is locked', (await userLogin(d3.user.email, 'secret1', '127.0.0.16')).status === 429);
  await call('/users/forgot-password', 'POST', { email: d3.user.email }, null, '127.0.0.16');
  await sleep(500);
  const log = fs.readFileSync(require('../helpers/site').LOG, 'utf8');
  const at = log.lastIndexOf('To: ' + d3.user.email);
  const token = at === -1 ? null : (log.slice(at).match(/token=([0-9a-f]{64})/) || [])[1];
  r = await call('/users/reset-password', 'POST', { token, password: 'brand-new-pass' }, null, '127.0.0.16');
  check('12 the person resets the password by email', r.status === 200, r.status + ' ' + (r.body.error || ''));
  r = await userLogin(d3.user.email, 'brand-new-pass', '127.0.0.16');
  check('13 and can sign in at once with the new password', r.status === 200, String(r.status));

  console.log('--- ONE ADDRESS TRYING MANY ACCOUNTS, OR MANY ADDRESSES TRYING ONE');
  const statuses2 = [];
  for (let i = 0; i < 40; i++) statuses2.push((await userLogin('spray' + i + '-' + stamp + '@example.com', 'x', '127.0.0.17')).status);
  check('14 forty wrong passwords on forty different emails are refused normally', statuses2.every((s) => s === 401), statuses2.filter((s) => s !== 401).join(','));
  r = await userLogin('fresh-' + stamp + '@example.com', 'x', '127.0.0.17');
  check('15 the next attempt from that address has to wait, whatever the email', r.status === 429 && LOCKED.test(r.body.error), r.status + ' ' + r.body.error);
  check('16 people on other addresses are not affected', (await userLogin(d2.user.email, 'secret1', '127.0.0.18')).status === 200);
  for (let i = 0; i < 4; i++) await userLogin(d5.user.email, 'wrong', '127.0.0.30');
  for (let i = 0; i < 4; i++) await userLogin(d5.user.email, 'wrong', '127.0.0.31');
  r = await userLogin(d5.user.email, 'secret1', '127.0.0.32');
  check('16b guesses spread over several computers lock the email everywhere', r.status === 429 && LOCKED.test(r.body.error), r.status + ' ' + r.body.error);

  console.log('--- WHAT PEOPLE SEE ON THE LOGIN PAGES');
  // Here the wait is only 6 seconds, so each page is opened and filled in first, the account is locked
  // with wrong passwords from other addresses, and only then is the form sent.
  const spread = (i) => '127.0.0.' + (40 + i);
  const shown = `(document.getElementById('login-error') ? document.getElementById('login-error').innerText : 'no message, the page went on to ' + location.pathname)`;
  const b = await connect();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.go(SITE + '/login/index.html', `!!document.querySelector('.login-form')`);
  await b.js(`localStorage.clear(); sessionStorage.clear(); document.getElementById('email').value = '${d4.user.email}'; document.getElementById('password').value = 'secret1'`);
  for (let i = 0; i < 8; i++) await userLogin(d4.user.email, 'wrong', spread(i));
  await b.js(`document.querySelector('.login-form').requestSubmit()`);
  check('17 the main login page shows the wait message', await b.waitFor(`/Too many sign-in attempts/.test(${shown})`), await b.js(shown));
  await b.go(SITE + '/partner/index.html', `!!document.getElementById('partner-login-form')`);
  await b.js(`document.getElementById('partner-email').value = '${p2Email}'; document.getElementById('partner-password').value = 'secret1'`);
  for (let i = 0; i < 8; i++) await partnerLogin(p2Email, 'wrong', spread(i));
  await b.js(`document.getElementById('partner-login-form').requestSubmit()`);
  check('18 the partner login page shows it too', await b.waitFor(`/Too many sign-in attempts/.test(${shown})`), await b.js(shown));
  await b.go(SITE + '/admin/index.html', `!!document.getElementById('admin-login-form')`);
  await b.js(`document.getElementById('admin-email').value = '${ADMIN.email}'; document.getElementById('admin-password').value = '${ADMIN.password}'`);
  for (let i = 0; i < 8; i++) await adminLogin(ADMIN.email, 'guess' + i, spread(i));
  await b.js(`document.getElementById('admin-login-form').requestSubmit()`);
  check('19 and the admin login page', await b.waitFor(`/Too many sign-in attempts/.test(${shown})`), await b.js(shown));
  check('20 no JavaScript errors on the login pages', b.errors.length === 0, b.errors.join(' ; '));

  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
