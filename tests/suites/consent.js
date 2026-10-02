const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(66), (ok ? 'ok' : 'FAIL') + (detail ? '  ' + detail : '')); if (!ok) failures++; };
async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;

  console.log('--- SERVER');
  let r = await call('/users/register', 'POST', { fullname: 'No Tick', email: 'a' + stamp + '@example.com', password: 'secret1', role: 'user' });
  check('1 donor sign-up without agreement is refused', r.status === 400 && /18 or older/.test(r.body.error), r.body.error);
  r = await call('/users/register', 'POST', { fullname: 'No Tick', email: 'a' + stamp + '@example.com', password: 'secret1', role: 'user', acceptTerms: 'yes' });
  check('2 "yes" text is not accepted, only true', r.status === 400);
  r = await call('/partner-auth/register', 'POST', { name: 'No Tick Org', email: 'b' + stamp + '@example.com', password: 'secret1' });
  check('3 partner sign-up without agreement is refused', r.status === 400);
  r = await call('/users/register', 'POST', { fullname: 'Ticked', email: 'c' + stamp + '@example.com', password: 'secret1', role: 'volunteer', acceptTerms: true });
  check('4 with agreement it works', r.status === 201);
  const home = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'Ticked');
  check('5 the agreement is written into the orphanage history', home.activityLog.some((e) => /agreed to the terms of use \(version 2\)/.test(e.action)), home.activityLog.map((e) => e.action).join(' | '));
  r = await call('/users/register', 'POST', { fullname: 'Ticked Donor', email: 'd' + stamp + '@example.com', password: 'secret1', role: 'user', acceptTerms: true });
  const donor = (await call('/donors', 'GET', null, admin)).body.donors.find((d) => d.name === 'Ticked Donor');
  check('6 ... and into the donor history', donor.activityLog.some((e) => /agreed to the terms/.test(e.action)));
  r = await call('/partner-auth/register', 'POST', { name: 'Ticked Org', email: 'e' + stamp + '@example.com', password: 'secret1', acceptTerms: true });
  const partner = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Ticked Org');
  check('7 ... and into the partner history', partner.activityLog.some((e) => /agreed to the terms/.test(e.action)));

  console.log('--- THE FORM');
  const b = await connect();
  await b.go(SITE + '/login/register.html?role=user', `!!document.querySelector('.register-form')`);
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.js(`(() => {
    document.getElementById('fullname').value = 'Form Donor';
    document.getElementById('email').value = 'f${stamp}@example.com';
    document.getElementById('password').value = 'secret1';
    document.getElementById('confirm-password').value = 'secret1';
    document.querySelector('.register-form').requestSubmit();
  })()`);
  await sleep(600);
  check('8 form: unchecked box shows a message and stays on the page', (await b.js(`document.getElementById('register-error').textContent`)).includes('18 or older') && (await b.js('location.pathname')).includes('register'));
  check('9 the links open the terms and safeguarding pages', (await b.js(`[...document.querySelectorAll('.consent-line a')].map(a => a.getAttribute('href')).join(',')`)) === '../terms.html,../safeguarding.html');
  await b.js(`document.getElementById('accept-terms').click(); document.querySelector('.register-form').requestSubmit()`);
  await b.waitFor(`location.pathname.includes('/donor/')`);
  check('10 ticking the box lets the sign-up through', (await b.js('location.pathname')).includes('/donor/'), await b.js('location.pathname'));
  await b.go(SITE + '/terms.html', `document.readyState === 'complete'`);
  check('11 terms page: version/date and the new sections', (await b.js(`document.body.innerText`)).match(/version 2, last updated 2 October 2026/) && (await b.js(`[...document.querySelectorAll('h2')].map(h => h.textContent).join('|')`)).includes('Visits'));
  await b.go(SITE + '/safeguarding.html', `document.readyState === 'complete'`);
  check('12 safeguarding page: visits + who else handles it', (await b.js(`[...document.querySelectorAll('h2')].map(h => h.textContent).join('|')`)).includes('Who else handles it'));
  check('13 page JS errors', b.errors.length === 0, b.errors.join(' ; '));
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
