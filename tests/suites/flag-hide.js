// A home an admin flags for review is hidden from donors and partners until the flag is removed.
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(72), (ok ? 'ok' : 'FAIL') + (detail !== undefined && detail !== '' ? '  ' + detail : '')); if (!ok) failures++; };
async function call(p, method, body, token) {
  const res = await fetch(A + p, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const stamp = Date.now();
  const NAME = 'Flag Home ' + stamp;
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const reg = async (name, role, email) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name, email, password: 'secret1', role })).body;

  const home = await reg(NAME, 'volunteer', 'fh' + stamp + '@example.com');
  const oid = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === NAME).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'FL-' + stamp, termsAgreed: true }, admin);
  const need = (await call('/my-orphanage/needs', 'POST', { title: 'Rice ' + stamp, goal: 50000 }, home.token)).body.need;
  await call('/my-orphanage/posts', 'POST', { type: 'update', text: 'Hello supporters.' }, home.token);

  const donor = await reg('Flag Donor ' + stamp, 'user', 'fd' + stamp + '@example.com');
  await call('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  const partner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Flag Partner ' + stamp, email: 'fp' + stamp + '@example.com', password: 'secret1' })).body;
  const prow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Flag Partner ' + stamp);
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);

  // before the flag: a chat already exists between the donor and the home
  let r = await call('/my-messages/chats', 'POST', { withType: 'orphanage', withId: oid, text: 'Hello from a donor' }, donor.token);
  check('setup: the donor starts a chat while the home is listed', r.status === 201, r.status + ' ' + (r.body.error || ''));
  const chatKey = r.body.conversation && r.body.conversation.key;
  check('setup: listed before the flag', (await call('/browse/orphanages', 'GET', null, donor.token)).body.orphanages.some((o) => o.id === oid));

  r = await call('/orphanages/' + oid, 'PUT', { flagged: true, flagReason: 'Checking the documents again' }, admin);
  check('setup: the admin flags the home', r.status === 200);

  console.log('--- WHILE FLAGGED: HIDDEN FROM DONORS');
  check('1 not in the donors\' list', !(await call('/browse/orphanages', 'GET', null, donor.token)).body.orphanages.some((o) => o.id === oid));
  check('2 its profile does not open (404)', (await call('/browse/orphanages/' + oid, 'GET', null, donor.token)).status === 404);
  check('3 its stories and videos do not open (404)', (await call('/browse/orphanages/' + oid + '/updates', 'GET', null, donor.token)).status === 404);
  r = await call('/pledges', 'POST', { needId: need.id, amount: 5000 }, donor.token);
  check('4 no new pledges to its needs', r.status === 404 && r.body.error === 'This need is not available.', r.status + ' ' + r.body.error);
  r = await call('/visits', 'POST', { orphanageId: oid, preferredDate: inDays(10), visitorsCount: 2 }, donor.token);
  check('5 no new visit requests', r.status === 404, r.status + ' ' + (r.body.error || ''));
  check('6 not offered for new chats', !(await call('/my-messages/contacts', 'GET', null, donor.token)).body.contacts.some((c) => c.type === 'orphanage' && c.id === oid));
  r = await call('/my-messages/chats', 'POST', { withType: 'orphanage', withId: oid, text: 'Hi again' }, donor.token);
  check('7 a new chat cannot be started with it', r.status === 404, String(r.status));
  r = await call('/my-messages/chats/' + chatKey + '/messages', 'POST', { text: 'Following up on my question' }, donor.token);
  check('8 the chat that already existed carries on', r.status === 201, r.status + ' ' + (r.body.error || ''));

  console.log('--- WHILE FLAGGED: HIDDEN FROM PARTNERS');
  check('9 not in the partners\' Browse list', !(await call('/partner-auth/orphanages', 'GET', null, partner.token)).body.orphanages.some((o) => o.id === oid));
  check('10 its profile and updates do not open (404)', (await call('/partner-auth/orphanages/' + oid, 'GET', null, partner.token)).status === 404 && (await call('/partner-auth/orphanages/' + oid + '/updates', 'GET', null, partner.token)).status === 404);
  r = await call('/partner-auth/donations', 'POST', { type: 'money', orphanageId: oid, amount: 10000 }, partner.token);
  check('11 no new partner gifts', r.status === 400, r.status + ' ' + (r.body.error || ''));
  check('12 it cannot be added to favorites', (await call('/partner-auth/orphanages/' + oid + '/favorite', 'POST', {}, partner.token)).status === 404);
  r = await call('/visits', 'POST', { orphanageId: oid, preferredDate: inDays(12), visitorsCount: 1 }, partner.token);
  check('13 no new visit requests from partners', r.status === 404, r.status + ' ' + (r.body.error || ''));

  console.log('--- WHILE FLAGGED: THE TEAM AND THE HOME');
  const adminView = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.id === oid);
  check('14 admins still see it, marked as flagged', adminView && adminView.flagged === true && adminView.flagReason === 'Checking the documents again');
  check('15 the home still sees its own portal', (await call('/my-orphanage', 'GET', null, home.token)).status === 200);

  console.log('--- IN THE BROWSER');
  const b = await connect();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.go(SITE + '/login/index.html');
  await b.js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('cocSession', JSON.stringify({ fullname: 'Flag Donor', role: 'user', token: '${donor.token}' }))`);
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.card-orphanage').length > 0 || !document.getElementById('emptyState').classList.contains('d-none')`);
  check('16 the Give page does not show it', !(await b.js(`document.body.innerText.includes('${NAME}')`)));
  await b.go(SITE + '/donor/orphanage.html?id=' + oid, `!document.getElementById('loadError').classList.contains('d-none')`);
  check('17 an old link to its profile says it could not be found', (await b.js(`document.getElementById('loadError').innerText`)).includes('could not be found'));
  await b.go(SITE + '/partner/index.html');
  await b.js(`localStorage.clear(); localStorage.setItem('partnerToken', '${partner.token}'); localStorage.setItem('partnerEmail', 'p')`);
  await b.go(SITE + '/partner/orphanages.html', `document.querySelectorAll('a[href^="orphanage-view.html"]').length > 0`);
  check('18 the partners\' Browse page does not show it', !(await b.js(`document.body.innerText.includes('${NAME}')`)));
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, `!document.getElementById('empty-state').classList.contains('d-none')`);
  check('19 an old partner link says "Orphanage not found."', (await b.js(`document.getElementById('empty-state').innerText`)) === 'Orphanage not found.');

  console.log('--- FLAG REMOVED: LISTED AGAIN');
  await call('/orphanages/' + oid, 'PUT', { flagged: false, flagReason: '' }, admin);
  check('20 back in the donors\' list', (await call('/browse/orphanages', 'GET', null, donor.token)).body.orphanages.some((o) => o.id === oid));
  check('21 its profile opens again', (await call('/browse/orphanages/' + oid, 'GET', null, donor.token)).status === 200);
  check('22 pledges work again', (await call('/pledges', 'POST', { needId: need.id, amount: 5000 }, donor.token)).status === 201);
  check('23 back in the partners\' list, and partner gifts work', (await call('/partner-auth/orphanages', 'GET', null, partner.token)).body.orphanages.some((o) => o.id === oid) &&
    (await call('/partner-auth/donations', 'POST', { type: 'money', orphanageId: oid, amount: 10000 }, partner.token)).status === 201);
  check('24 visit requests work again', (await call('/visits', 'POST', { orphanageId: oid, preferredDate: inDays(10), visitorsCount: 2 }, donor.token)).status === 201);
  await b.go(SITE + '/login/index.html');
  await b.js(`localStorage.clear(); localStorage.setItem('cocSession', JSON.stringify({ fullname: 'Flag Donor', role: 'user', token: '${donor.token}' }))`);
  await b.go(SITE + '/donor/index.html', `document.body.innerText.includes('${NAME}')`);
  check('25 the Give page shows it again', await b.js(`document.body.innerText.includes('${NAME}')`));

  const issues = b.netIssues.filter((s) => !/favicon\.ico$/.test(s) && !new RegExp('^404 .*/orphanages/' + oid + '$').test(s));
  check('26 no JavaScript errors', b.errors.length === 0, b.errors.join(' ; '));
  check('27 no failed requests (other than the expected "not found")', issues.length === 0, issues.join(' ; '));
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
