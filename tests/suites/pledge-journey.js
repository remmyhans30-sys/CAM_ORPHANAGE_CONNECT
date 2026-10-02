// From pledge to gift: the donor sees where to send it, the home marks it as received.
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(74), (ok ? 'ok' : 'FAIL') + (detail !== undefined && detail !== '' ? '  ' + detail : '')); if (!ok) failures++; };
async function call(p, method, body, token) {
  const res = await fetch(A + p, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  const stamp = Date.now();
  const NUMBER = '67' + String(stamp).slice(-7);
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const reg = async (name, role) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name + ' ' + stamp, email: name.replace(/ /g, '').toLowerCase() + stamp + '@example.com', password: 'secret1', role })).body;
  const homes = async () => (await call('/orphanages', 'GET', null, admin)).body.orphanages;

  const homeA = await reg('Pay Home', 'volunteer');
  const homeB = await reg('Unchecked Home', 'volunteer');
  const homeC = await reg('Other Pay Home', 'volunteer');
  await call('/my-orphanage', 'PUT', { paymentProvider: 'MTN Mobile Money', paymentAccountName: 'Pay Home Association', paymentAccountNumber: NUMBER }, homeA.token);
  await call('/my-orphanage', 'PUT', { paymentProvider: 'Orange Money', paymentAccountName: 'Unchecked Home', paymentAccountNumber: '699000111' }, homeB.token);
  const list = await homes();
  const idOf = (name) => list.find((o) => o.name === name + ' ' + stamp).id;
  const aId = idOf('Pay Home'); const bId = idOf('Unchecked Home'); const cId = idOf('Other Pay Home');
  for (const id of [aId, bId, cId]) await call('/orphanages/' + id, 'PUT', { status: 'verified', registrationNumber: 'PJ-' + id + '-' + stamp, termsAgreed: true }, admin);
  await call('/orphanages/' + aId, 'PUT', { paymentAccountConfirmed: true }, admin);
  const needA = (await call('/my-orphanage/needs', 'POST', { title: 'Rice for a month ' + stamp, goal: 50000 }, homeA.token)).body.need;
  const needB = (await call('/my-orphanage/needs', 'POST', { title: 'Shoes ' + stamp, goal: 30000 }, homeB.token)).body.need;
  const donor = await reg('Pay Donor', 'user');
  const other = await reg('Quiet Donor', 'user');
  await call('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  await call('/donors/' + other.user.id, 'PUT', { status: 'active' }, admin);

  console.log('--- THE DONOR PLEDGES');
  let r = await call('/pledges', 'POST', { needId: needA.id, amount: 10000 }, donor.token);
  const p1 = r.body.pledge || {};
  check('1 the pledge comes back with a reference', r.status === 201 && /^CAM-\d+$/.test(p1.reference) && p1.reference === 'CAM-' + p1.id, JSON.stringify(p1).slice(0, 120));
  check('2 ... and where to send the gift (the confirmed account)', p1.payTo && p1.payTo.provider === 'MTN Mobile Money' && p1.payTo.accountName === 'Pay Home Association' && p1.payTo.accountNumber === NUMBER);
  r = await call('/pledges', 'POST', { needId: needB.id, amount: 5000 }, donor.token);
  check('3 a home whose account is not confirmed yet: no account shown', r.status === 201 && r.body.pledge && r.body.pledge.payTo === null);
  r = await call('/pledges/mine', 'GET', null, donor.token);
  const mineA = r.body.pledges.find((p) => p.id === p1.id);
  const mineB = r.body.pledges.find((p) => p.needId === needB.id);
  check('4 My pledges: status and how to give', mineA && mineA.received === false && mineA.payTo && mineA.payTo.accountNumber === NUMBER && mineA.reference === p1.reference && mineB.payTo === null);

  console.log('--- THE HOME MARKS IT AS RECEIVED');
  r = await call('/my-orphanage/pledges', 'GET', null, homeA.token);
  const seen = r.body.pledges.find((p) => p.id === p1.id);
  check('5 the home sees the pledge with its reference, not yet received', seen && seen.reference === p1.reference && seen.received === false && seen.donorName === 'Pay Donor ' + stamp);
  r = await call('/my-orphanage/pledges/' + p1.id + '/received', 'POST', { received: true }, homeA.token);
  check('6 "Mark as received" works', r.status === 200 && r.body.pledges.find((p) => p.id === p1.id).received === true, r.status + ' ' + (r.body.error || ''));
  r = await call('/pledges/mine', 'GET', null, donor.token);
  const after = r.body.pledges.find((p) => p.id === p1.id);
  check('7 the donor sees "received", and no longer needs the account', after.received === true && after.payTo === null);
  const needNow = (await call('/browse/orphanages/' + aId, 'GET', null, donor.token)).body;
  check('8 the need still counts the gift once (10,000 of 50,000)', needNow.needs.find((n) => n.id === needA.id).raised === 10000 && needNow.record.totalPledged === 10000, JSON.stringify(needNow.record));
  const log = (await homes()).find((o) => o.id === aId).activityLog.map((e) => e.action).join(' | ');
  check('9 the home\'s history records it', log.includes('Marked pledge ' + p1.reference + ' as received'), log.slice(-120));
  r = await call('/my-orphanage/pledges/' + p1.id + '/received', 'POST', { received: false }, homeA.token);
  check('10 it can be undone', r.status === 200 && r.body.pledges.find((p) => p.id === p1.id).received === false);

  console.log('--- WHO MAY DO IT');
  check('11 another home cannot mark it', (await call('/my-orphanage/pledges/' + p1.id + '/received', 'POST', { received: true }, homeC.token)).status === 404);
  check('12 a donor cannot mark it', (await call('/my-orphanage/pledges/' + p1.id + '/received', 'POST', { received: true }, donor.token)).status === 403);
  check('13 nobody signed in cannot', (await call('/my-orphanage/pledges/' + p1.id + '/received', 'POST', { received: true })).status === 401);
  check('14 a bad id is simply not found', (await call('/my-orphanage/pledges/abc/received', 'POST', { received: true }, homeA.token)).status === 404);

  console.log('--- PRIVACY');
  r = await call('/pledges', 'POST', { needId: needA.id, amount: 2000, anonymous: true }, other.token);
  check('15 an anonymous donor also gets the account; the home sees "Anonymous"', r.body.pledge.payTo && (await call('/my-orphanage/pledges', 'GET', null, homeA.token)).body.pledges.find((p) => p.id === r.body.pledge.id).donorName === 'Anonymous');
  const browse = JSON.stringify((await call('/browse/orphanages/' + aId, 'GET', null, other.token)).body);
  check('16 the profile page itself still never shows the account', !browse.includes(NUMBER));
  await call('/orphanages/' + aId, 'PUT', { paymentAccountConfirmed: false }, admin);
  r = await call('/pledges/mine', 'GET', null, donor.token);
  check('17 if the team withdraws its confirmation, the account disappears again', r.body.pledges.find((p) => p.id === p1.id).payTo === null);
  await call('/orphanages/' + aId, 'PUT', { paymentAccountConfirmed: true }, admin);

  console.log('--- IN THE BROWSER');
  const b = await connect();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.go(SITE + '/login/index.html');
  await b.js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('cocSession', JSON.stringify({ fullname: 'Pay Donor', role: 'user', token: '${donor.token}' }))`);
  await b.go(SITE + '/donor/orphanage.html?id=' + aId, `document.querySelectorAll('#needsList .donate-btn').length > 0`);
  await b.js(`document.querySelector('#needsList .donate-btn').click()`);
  await b.waitFor(`document.getElementById('donateModal').classList.contains('show')`);
  await b.js(`document.querySelector('.btn-quick-amount[data-amount="5000"]').click(); document.getElementById('donateForm').requestSubmit()`);
  await b.waitFor(`!document.getElementById('pledgePayTo').classList.contains('d-none')`);
  const box = await b.js(`document.getElementById('pledgePayTo').innerText`);
  check('18 after pledging, the window shows the reference and the account', /Your pledge reference: CAM-\d+/.test(box) && box.includes(NUMBER) && box.includes('MTN Mobile Money') && box.includes('Pay Home Association'), box.replace(/\n/g, ' / ').slice(0, 160));
  await b.go(SITE + '/donor/orphanage.html?id=' + bId, `document.querySelectorAll('#needsList .donate-btn').length > 0`);
  await b.js(`document.querySelector('#needsList .donate-btn').click()`);
  await b.waitFor(`document.getElementById('donateModal').classList.contains('show')`);
  await b.js(`document.querySelector('.btn-quick-amount[data-amount="2000"]').click(); document.getElementById('donateForm').requestSubmit()`);
  await b.waitFor(`!document.getElementById('pledgePayTo').classList.contains('d-none')`);
  check('19 ... or explains the account is not confirmed yet', (await b.js(`document.getElementById('pledgePayTo').innerText`)).includes('has not confirmed this home\'s payment account yet'));
  await b.go(SITE + '/donor/profile.html', `document.querySelectorAll('#pledgeBody .pledge-status').length >= 4`);
  const rows = await b.js(`[...document.querySelectorAll('#pledgeBody tr')].map(tr => tr.innerText.replace(/\\s+/g, ' ')).join(' || ')`);
  check('20 My pledges shows each status and where to send it', rows.includes('Send to MTN Mobile Money ' + NUMBER + ' (Pay Home Association), reference CAM-') && rows.includes('still being checked by our team'), rows.slice(0, 200));

  check('20b dates read like "2 Oct 2026"', /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(await b.js(`document.querySelector('#pledgeBody td').textContent`)), await b.js(`document.querySelector('#pledgeBody td').textContent`));
  await b.js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('cocSession', JSON.stringify({ fullname: 'Pay Home', role: 'volunteer', token: '${homeA.token}' }))`);
  await b.go(SITE + '/orphanage/index.html', `!!document.querySelector('[data-view="donations"]')`);
  await b.js(`document.querySelector('[data-view="donations"]').click()`);
  await b.waitFor(`document.querySelectorAll('#pledges-body .pledge-received-btn').length >= 3`);
  check('21 the portal lists references, with "Mark as received"', (await b.js(`document.getElementById('pledges-body').innerText`)).includes(p1.reference) && (await b.js(`[...document.querySelectorAll('#pledges-body .pledge-received-btn')].every(x => x.textContent === 'Mark as received')`)));
  await b.js(`[...document.querySelectorAll('#pledges-body tr')].find(tr => tr.innerText.includes('${p1.reference}')).querySelector('.pledge-received-btn').click()`);
  await b.waitFor(`[...document.querySelectorAll('#pledges-body tr')].some(tr => tr.innerText.includes('${p1.reference}') && tr.querySelector('.donation-status').textContent === 'Received')`);
  check('21b the portal dates read like "2 Oct 2026" too', /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(await b.js(`document.querySelector('#pledges-body td').textContent`)), await b.js(`document.querySelector('#pledges-body td').textContent`));
  check('22 clicking it marks the pledge received, with an Undo', await b.js(`(() => { const tr = [...document.querySelectorAll('#pledges-body tr')].find(t => t.innerText.includes('${p1.reference}')); return tr.querySelector('.donation-status').textContent === 'Received' && tr.querySelector('.pledge-received-btn').textContent === 'Undo'; })()`));
  check('23 ... and the donor sees it', (await call('/pledges/mine', 'GET', null, donor.token)).body.pledges.find((p) => p.id === p1.id).received === true);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await sleep(400);
  check('24 the pledge list fits a phone (it scrolls sideways inside its box)', (await b.js('document.documentElement.scrollWidth')) <= 360, String(await b.js('document.documentElement.scrollWidth')));
  check('25 no JavaScript errors', b.errors.length === 0, b.errors.join(' ; '));
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
