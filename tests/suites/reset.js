// Password reset by email, against a real (local) SMTP server that captures the mail.
// Run with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SITE_URL=http://127.0.0.2:4555 set for the site.
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { connect, sleep } = require('../helpers/browser');

const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(66), (ok ? 'ok' : 'FAIL') + (detail ? '  ' + detail : '')); if (!ok) failures++; };
const { sql } = require('../helpers/db');

const mails = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, session, cb) {
    simpleParser(stream).then((m) => { mails.push(m); cb(); }, cb);
  },
});

async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const waitMail = async (n, ms = 4000) => { for (let t = 0; t < ms; t += 100) { if (mails.length >= n) return true; await sleep(100); } return false; };
const tokenOf = (m) => (/token=([0-9a-f]{64})/.exec(m.text) || [])[1];

(async () => {
  await new Promise((r) => smtp.listen(2525, '127.0.0.1', r));
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const donor = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Reset Donor ' + stamp, email: 'rd' + stamp + '@example.com', password: 'oldpass1', role: 'user' })).body;
  const orph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Reset Home ' + stamp, email: 'ro' + stamp + '@example.com', password: 'oldpass1', role: 'volunteer' })).body;
  await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Reset Partner ' + stamp, email: 'rp' + stamp + '@example.com', password: 'oldpass1' });
  const donorEmail = 'rd' + stamp + '@example.com';

  console.log('--- ASKING FOR A LINK');
  let r = await call('/users/forgot-password', 'POST', { email: 'nobody' + stamp + '@example.com' });
  const unknownMsg = r.body.message;
  await sleep(500);
  check('1 unknown address: polite answer, no email sent', r.status === 200 && mails.length === 0, r.status);
  r = await call('/users/forgot-password', 'POST', { email: donorEmail.toUpperCase() });
  check('2 known address (any capitals): same answer as unknown', r.status === 200 && r.body.message === unknownMsg, r.body.message && r.body.message.slice(0, 50));
  check('3 an email arrives', await waitMail(1));
  const mail = mails[0];
  check('4 addressed to the account, sensible subject', mail && mail.to.value[0].address === donorEmail && /password/i.test(mail.subject), mail && mail.subject);
  const token1 = mail && tokenOf(mail);
  check('5 contains a 64-character link to the reset page on the site address', Boolean(token1) && mail.text.includes(SITE + '/login/reset-password.html?token='), (mail.text.match(/http\S+/) || [''])[0].slice(0, 70));
  check('6 html version links the same page', /reset-password\.html\?token=/.test(mail.html || ''));
  check('7 database keeps only a fingerprint, never the token', sql("SELECT COUNT(*) FROM password_reset_tokens WHERE token_hash = '" + token1 + "'") === '0' && sql('SELECT COUNT(*) FROM password_reset_tokens') === '1');
  check('8 bad address format refused', (await call('/users/forgot-password', 'POST', { email: 'nope' })).status === 400);
  for (let i = 0; i < 4; i++) await call('/users/forgot-password', 'POST', { email: donorEmail });
  await sleep(800);
  check('9 at most 3 emails per account per hour', mails.length === 3, mails.length + ' emails');

  console.log('--- USING THE LINK');
  r = await call('/users/reset-password', 'POST', { token: 'abc', password: 'newpass1' });
  check('10 malformed token refused', r.status === 400);
  r = await call('/users/reset-password', 'POST', { token: '0'.repeat(64), password: 'newpass1' });
  check('11 unknown token refused', r.status === 400, r.body.error);
  r = await call('/users/reset-password', 'POST', { token: token1, password: 'abc' });
  check('12 too-short password refused (link still valid)', r.status === 400, r.body.error);
  const token3 = tokenOf(mails[2]);
  r = await call('/users/reset-password', 'POST', { token: token3, password: 'newpass1' });
  check('13 newest link changes the password', r.status === 200, r.body.message);
  check('14 old password no longer works', (await call('/users/login', 'POST', { email: donorEmail, password: 'oldpass1' })).status === 401);
  check('15 new password works', (await call('/users/login', 'POST', { email: donorEmail, password: 'newpass1' })).status === 200);
  r = await call('/users/reset-password', 'POST', { token: token3, password: 'another1' });
  check('16 the same link cannot be used twice', r.status === 400, r.body.error);
  r = await call('/users/reset-password', 'POST', { token: token1, password: 'another1' });
  check('17 older links stop working too', r.status === 400);
  check('18 password unchanged by the failed attempts', (await call('/users/login', 'POST', { email: donorEmail, password: 'newpass1' })).status === 200);

  console.log('--- EXPIRY AND OTHER ACCOUNT TYPES');
  await call('/users/forgot-password', 'POST', { email: 'ro' + stamp + '@example.com' });
  check('19 orphanage account gets a link', await waitMail(4));
  const tokenO = tokenOf(mails[3]);
  sql("UPDATE password_reset_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE used_at IS NULL");
  r = await call('/users/reset-password', 'POST', { token: tokenO, password: 'newpass2' });
  check('20 an expired link is refused', r.status === 400 && /expired/.test(r.body.error), r.body.error);
  await call('/users/forgot-password', 'POST', { email: 'rp' + stamp + '@example.com' });
  check('21 partner account gets a link', await waitMail(5));
  const tokenP = tokenOf(mails[4]);
  r = await call('/users/reset-password', 'POST', { token: tokenP, password: 'newpass3' });
  check('22 partner password changed', r.status === 200);
  check('23 partner signs in on the partner portal with it', (await call('/partner-auth/login', 'POST', { email: 'rp' + stamp + '@example.com', password: 'newpass3' })).status === 200);
  const before = mails.length;
  await call('/users/forgot-password', 'POST', { email: 'owner@cam-test.org' });
  await sleep(600);
  check('24 admin accounts are not reset by email', mails.length === before);

  console.log('--- THE PAGE IN A BROWSER');
  const b = await connect();
  await call('/users/forgot-password', 'POST', { email: 'ro' + stamp + '@example.com' });
  await waitMail(before + 1);
  const link = (mails[mails.length - 1].text.match(/http\S+/) || [''])[0];
  await b.go(link, `!!document.querySelector('.reset-password-form')`);
  check('25 reset page opens; token removed from the address bar', (await b.js('location.search')) === '', 'url now ' + (await b.js('location.pathname + location.search')));
  await b.js(`document.getElementById('new-password').value = 'abcdef'; document.getElementById('confirm-new-password').value = 'abcxyz'; document.querySelector('.reset-password-form').requestSubmit()`);
  await sleep(300);
  check('26 mismatched passwords are caught', (await b.js(`document.getElementById('reset-error').textContent`)) === 'The two passwords do not match.');
  await b.js(`document.getElementById('confirm-new-password').value = 'abcdef'; document.querySelector('.reset-password-form').requestSubmit()`);
  await b.waitFor(`document.getElementById('reset-success').classList.contains('show')`);
  check('27 success message with a sign-in link', (await b.js(`document.getElementById('reset-success').innerText`)).includes('Go to sign in'));
  await b.go(SITE + '/login/index.html', `!!document.querySelector('form')`);
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.go(SITE + '/login/index.html', `!!document.querySelector('form')`);
  await b.js(`(() => { document.getElementById('email').value = 'ro${stamp}@example.com'; document.getElementById('password').value = 'abcdef'; document.querySelector('form').requestSubmit(); })()`);
  await b.waitFor(`location.pathname.includes('/orphanage/')`);
  check('28 signing in with the new password works', (await b.js('location.pathname')).includes('/orphanage/'), await b.js('location.pathname'));
  await b.go(SITE + '/login/reset-password.html', `!!document.querySelector('.reset-password-form')`);
  check('29 page without a token explains the problem', (await b.js(`document.getElementById('reset-error').textContent`)).includes('not valid'));
  await b.go(SITE + '/login/forgot-password.html', `!!document.querySelector('.forgot-password-form')`);
  await b.js(`document.getElementById('email').value = 'x${stamp}@example.com'; document.querySelector('.forgot-password-form').requestSubmit()`);
  await b.waitFor(`document.getElementById('forgot-success').classList.contains('show')`);
  check('30 forgot page shows the polite answer', (await b.js(`document.getElementById('forgot-success').textContent`)).includes('If an account exists'));
  check('31 page JS errors', b.errors.length === 0, b.errors.join(' ; '));

  smtp.close();
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
