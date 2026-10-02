// A verified partner opens an orphanage's full profile (the same information donors get).
const { fixture } = require('../helpers/fixtures');
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(72), (ok ? 'ok' : 'FAIL') + (detail !== undefined && detail !== '' ? '  ' + detail : '')); if (!ok) failures++; };

async function call(p, method, body, token) {
  const res = await fetch(A + p, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const IMG = path.join(__dirname, '..', '..', 'assets', 'img') + '/';
const jpg = (name) => fs.readFileSync(IMG + name).toString('base64');
const brokenPng = fs.readFileSync(fixture('post-photo.png')).toString('base64');

(async () => {
  const stamp = Date.now();
  const NAME = 'Partner View Home ' + stamp;
  const PHONE = '+237 655 222 ' + String(stamp).slice(-3);
  const EMAIL = 'pv-secret-' + stamp + '@example.com';
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const reg = async (name, role, email) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name, email, password: 'secret1', role })).body;

  const home = await reg(NAME, 'volunteer', 'pvh' + stamp + '@example.com');
  await call('/my-orphanage', 'PUT', {
    location: 'Buea, South-West', registrationNumber: 'PV-' + stamp, foundedYear: 2012, capacity: 30, childrenCount: 18,
    contactName: 'Mr Eta', contactPhone: PHONE, contactEmail: EMAIL, termsAgreed: true, storyLanguage: 'fr',
    story: 'Le foyer a ouvert en 2012.\nNous avons commencé avec quatre enfants.\n\nToday 18 children live here.',
    paymentProvider: 'MTN Mobile Money', paymentAccountName: 'PV Holder ' + stamp, paymentAccountNumber: '6' + String(stamp).slice(-8),
  }, home.token);
  await call('/my-orphanage/photo', 'POST', { filename: 'home.jpg', data: jpg('hand-pump-1280.jpg') }, home.token);
  await call('/my-orphanage/cover', 'POST', { filename: 'cover.jpg', data: jpg('village-kitchen-1280.jpg') }, home.token);
  const oid = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === NAME).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', paymentAccountConfirmed: true }, admin);
  const needA = (await call('/my-orphanage/needs', 'POST', { title: 'Solar lamps ' + stamp, description: 'Lamps for evening homework', goal: 60000 }, home.token)).body.need;
  const needB = (await call('/my-orphanage/needs', 'POST', { title: 'Blankets ' + stamp, goal: 15000 }, home.token)).body.need;
  await call('/my-orphanage/posts', 'POST', { type: 'gift', title: 'Thank you for the blankets', text: 'Every child has a warm blanket now.', photo: { filename: 'b.jpg', data: jpg('classroom-960.jpg') } }, home.token);
  await call('/my-orphanage/posts', 'POST', { type: 'update', text: 'Exams start next week.' }, home.token);

  const BROKEN = 'Partner View Broken Photo Home of the Association for Orphaned and Vulnerable Children ' + stamp;
  const broken = await reg(BROKEN, 'volunteer', 'pvb' + stamp + '@example.com');
  await call('/my-orphanage', 'PUT', { registrationNumber: 'PVB-' + stamp, termsAgreed: true }, broken.token);
  await call('/my-orphanage/photo', 'POST', { filename: 'home.png', data: brokenPng }, broken.token);
  await call('/my-orphanage/cover', 'POST', { filename: 'cover.png', data: brokenPng }, broken.token);
  const brokenId = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === BROKEN).id;
  await call('/orphanages/' + brokenId, 'PUT', { status: 'verified' }, admin);

  const giver = await reg('PV Giver ' + stamp, 'user', 'pvg' + stamp + '@example.com');
  await call('/donors/' + giver.user.id, 'PUT', { status: 'active' }, admin);
  await call('/pledges', 'POST', { needId: needB.id, amount: 15000 }, giver.token);

  const partner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'PV Partner ' + stamp, email: 'pvp' + stamp + '@example.com', password: 'secret1' })).body;
  const prow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'PV Partner ' + stamp);
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  const draft = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'PV Draft ' + stamp, email: 'pvd' + stamp + '@example.com', password: 'secret1' })).body;

  const b = await connect();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const signIn = async (who) => {
    await b.go(SITE + '/partner/index.html');
    await b.js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('partnerToken', '${who.token}'); localStorage.setItem('partnerEmail', 'p')`);
  };
  const text = (id) => b.js(`document.getElementById('${id}').innerText`);
  const loaded = `!document.getElementById('orphanage-content').classList.contains('d-none') && document.querySelectorAll('#posts-panel .cu-post').length === 2`;

  console.log('--- BROWSE ORPHANAGES');
  await signIn(partner);
  await b.go(SITE + '/partner/orphanages.html', `document.body.innerText.includes('${NAME}')`);
  const card = `[...document.querySelectorAll('a[href^="orphanage-view.html?id="]')].find(a => a.getAttribute('href') === 'orphanage-view.html?id=${oid}')`;
  check('1 the home is listed with a link to its profile', await b.js(`!!${card}`));
  const stats = await b.js(`[...${card}.querySelectorAll('.profile-stats .stat')].map(s => s.querySelector('span').textContent + ' ' + s.querySelector('strong').textContent).join(' | ')`);
  check('2 "Active needs" counts only needs still open; followers are called followers', stats.includes('Active needs 1') && stats.includes('Followers 0') && !stats.includes('Supporters'), stats);

  console.log('--- THE PROFILE');
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, loaded);
  check('3 page title is the home\'s name', (await b.js('document.title')) === NAME + ' - CAM Orphanage Connect');
  check('4 name, verified badge, place and year', (await text('orphanage-name')) === NAME && (await b.js(`!!document.querySelector('.home-identity .status-badge.status-verified')`)) && (await text('orphanage-location')) === 'Buea, South-West · Caring for children since 2012', await text('orphanage-location'));
  check('5 cover and profile photos are shown', await b.waitFor(`(() => { const i = [...document.querySelectorAll('#orphanage-cover img, #orphanage-avatar img')]; return i.length === 2 && i.every(x => x.complete && x.naturalWidth > 0); })()`));
  const tiles = await b.js(`[...document.querySelectorAll('#orphanage-stats .stat-tile')].map(t => t.querySelector('strong').textContent + ' ' + t.querySelector('span').textContent).join(' | ')`);
  check('6 fact tiles', tiles === '18 Children | 30 Capacity | 2012 Founded | 1 Open needs', tiles);
  check('7 the story keeps its paragraphs, with a French note', (await b.js(`document.querySelectorAll('#orphanage-story p').length`)) === 2 && (await text('orphanage-story-language')) === 'Written by the home in French.');
  const trust = await b.js(`[...document.querySelectorAll('#trust-facts dt')].map(dt => dt.textContent + ': ' + dt.nextElementSibling.textContent).join(' | ')`);
  const pretty = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  check('8 what our team checked', trust.includes('Verified: By the CAM Orphanage Connect team on ' + pretty) && trust.includes('Registration number: PV-' + stamp) && trust.includes('Contact person: Mr Eta') && trust.includes('not a personal one') && /On this site since: \w+ \d{4}/.test(trust), trust);
  const record = await text('record-panel');
  check('9 support so far', record.includes('15,000 FCFA') && record.includes('1 supporter') && record.includes('1 need fully pledged') && record.includes('2 stories and updates shared'), record.replace(/\n/g, ' / '));
  check('10 one open need, with its description and a donate button', (await b.js(`document.querySelectorAll('#needs-panel a.btn').length`)) === 1 && (await text('needs-panel')).includes('Lamps for evening homework'));
  check('11 fully pledged needs listed apart', (await text('met-needs-list')).includes('Blankets ' + stamp));
  check('12 no empty photo gallery card', await b.js(`document.getElementById('gallery-card').classList.contains('d-none')`));
  check('13 stories and videos still show', (await b.js(`document.querySelectorAll('#posts-panel .cu-photo').length`)) === 1);
  const pageText = await b.js('document.body.innerText');
  check('14 the phone number and email are not on the page', !pageText.includes(PHONE) && !pageText.includes(EMAIL));

  console.log('--- DONATING FROM THE PROFILE');
  await b.js(`document.querySelector('#needs-panel a.btn').click()`);
  check('15 "Donate to this need" opens the donation form for this home and need', await b.waitFor(`location.pathname.endsWith('/partner/dashboard.html') && document.getElementById('add-donation-modal').classList.contains('show')`) &&
    (await b.js(`document.getElementById('donation-orphanage').value`)) === String(oid) && (await b.js(`document.getElementById('donation-need').value`)) === needA.title,
    await b.js(`document.getElementById('donation-orphanage').value + ' / ' + document.getElementById('donation-need').value`));

  console.log('--- ON A PHONE, AND A BROKEN PHOTO');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, loaded);
  await sleep(400);
  check('16 fits a 360px phone (no sideways scroll)', (await b.js('document.documentElement.scrollWidth')) <= 360, String(await b.js('document.documentElement.scrollWidth')));
  await b.go(SITE + '/partner/orphanage-view.html?id=' + brokenId, `!document.getElementById('orphanage-content').classList.contains('d-none')`);
  await sleep(600);
  check('17 a very long name still fits a phone', (await b.js('document.documentElement.scrollWidth')) <= 360);
  check('18 broken photos fall back to the initials, and no cover', (await text('orphanage-avatar')) === 'PV' && (await b.js(`document.getElementById('orphanage-cover').classList.contains('d-none')`)));
  check('19 a home with no story, needs or pledges still reads well', (await text('orphanage-story')).includes('has not written its story yet') && (await text('needs-panel')).includes('No open needs right now') && (await text('record-panel')).includes('No pledges yet'));
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('--- WRONG LINKS AND NO ACCESS');
  await b.go(SITE + '/partner/orphanage-view.html?id=abc', `!document.getElementById('empty-state').classList.contains('d-none')`);
  check('20 a broken link says the home was not found', (await text('empty-state')) === 'Orphanage not found.');
  await signIn(draft);
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, `!document.getElementById('empty-state').classList.contains('d-none')`);
  check('21 a partner waiting for verification is told why', (await text('empty-state')).includes('locked for now'));

  const issues = b.netIssues.filter((s) => !/favicon\.ico$/.test(s) && !/^404 .*\/partner-auth\/orphanages\/abc$/.test(s) && !/^403 .*\/partner-auth\/orphanages(\/\d+)?$/.test(s));
  check('22 no JavaScript errors', b.errors.length === 0, b.errors.join(' ; '));
  check('23 no failed requests (other than the expected refusals)', issues.length === 0, issues.join(' ; '));
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
