const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(60), v);
const J = { 'Content-Type': 'application/json' };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const b = await connect();
  const stamp = Date.now();
  const api = async (path, method, body, token) => (await fetch(SITE + '/api' + path, { method: method || 'GET', headers: Object.assign({}, J, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined })).json();

  const admin = (await api('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).token;
  const orph = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Visit UI Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' });
  const oid = (await api('/orphanages', 'GET', null, admin)).orphanages.find((o) => o.name === 'Visit UI Home ' + stamp).id;
  await api('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'VUI-' + stamp, termsAgreed: true, location: 'Kribi, South' }, admin);
  const donor = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Amara Ndongo', email: 'd' + stamp + '@example.com', password: 'secret1', role: 'user' });
  await api('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  const partner = await api('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Visit UI Partner ' + stamp, email: 'p' + stamp + '@example.com', password: 'secret1' });
  const prow = (await api('/partners', 'GET', null, admin)).partners.find((p) => p.name === 'Visit UI Partner ' + stamp);
  await api('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);

  const session = (u, role, token) => JSON.stringify({ token, role, fullname: u, email: 'x@example.com' });
  async function signInAs(setup) {
    await b.go(SITE + '/login/index.html', `document.readyState === 'complete'`);
    await b.js(`localStorage.clear(); sessionStorage.clear(); ${setup}`);
  }

  console.log('--- DONOR REQUESTS A VISIT');
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Amara Ndongo', 'user', donor.token))})`);
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.orphanage-visit-btn').length > 0`);
  out('1 each orphanage card has "Request a visit":', await b.js(`document.querySelectorAll('.orphanage-visit-btn').length + ' button(s)'`));
  out('2 "My visit requests" shows an empty message:', await b.js(`document.getElementById('myVisitsSection').classList.contains('d-none') ? 'hidden' : document.getElementById('myVisits').innerText.slice(0, 40)`));
  await b.js(`[...document.querySelectorAll('.card-orphanage')].find(c => c.innerText.includes('Visit UI Home ${stamp}')).querySelector('.orphanage-visit-btn').click()`);
  await b.waitFor(`!!document.querySelector('dialog.cv-dialog[open]')`);
  out('3 dialog opens with the home name and house rules:', await b.js(`document.querySelector('.cv-lead').textContent + ' | ' + document.querySelector('.cv-rules-list').children.length + ' rules'`));
  out('4 date field cannot be today:', await b.js(`document.querySelector('.cv-dialog input[type=date]').min === '${day(1)}'`));
  await b.js(`document.querySelector('.cv-form').requestSubmit()`);
  await sleep(300);
  out('5 empty date is asked for:', await b.js(`document.querySelector('.cv-error').textContent`));
  await b.js(`(() => {
    document.querySelector('.cv-dialog input[type=date]').value = '${day(9)}';
    document.querySelector('.cv-dialog input[type=number]').value = '4';
    document.querySelector('.cv-dialog textarea').value = 'Two colleagues and I would like to meet the staff.';
    document.querySelector('.cv-form').requestSubmit();
  })()`);
  await b.waitFor(`document.querySelector('.cv-done').textContent.length > 0`);
  out('6 confirmation shown:', await b.js(`document.querySelector('.cv-done').textContent.slice(0, 60)`));
  await b.js(`[...document.querySelectorAll('.cv-dialog .cv-btn')].find(x => x.textContent === 'Close').click()`);
  await b.waitFor(`document.querySelector('#myVisits .cv-card') !== null`);
  out('7 my requests lists it as waiting:', await b.js(`document.querySelector('#myVisits .cv-card').innerText.replace(/\\n/g, ' | ')`));

  console.log('--- ORPHANAGE ANSWERS');
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Visit UI Home', 'volunteer', orph.token))})`);
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('visits-dot') !== null && document.getElementById('visits-dot').style.display !== 'none'`);
  out('8 portal shows a dot for the waiting request:', await b.js(`document.getElementById('visits-dot').style.display !== 'none'`));
  await b.js(`document.querySelector('[data-view=visits]').click()`);
  await b.waitFor(`document.getElementById('view-visits').classList.contains('active')`);
  out('9 request card (who / when / message):', await b.js(`document.querySelector('#visits-list .visit-card').innerText.replace(/\\n/g, ' | ').slice(0, 170)`));
  out('10 no email before approval:', await b.js(`!document.querySelector('#visits-list').innerText.includes('@')`));
  await b.js(`document.querySelector('.visit-actions .btn-outline-pill').click()`);
  await sleep(400);
  out('11 declining without a note shows the reason:', await b.js(`document.getElementById('visits-error').textContent`));
  await b.js(`document.querySelector('.visit-card textarea').value = 'Please come after 2pm and ask for the director.'`);
  await b.js(`document.querySelector('.visit-actions .btn-primary-pill').click()`);
  await b.waitFor(`document.querySelector('.visit-status.approved') !== null`);
  out('12 approved; email now shown to the home:', await b.js(`document.querySelector('#visits-list').innerText.includes('d${stamp}@example.com') + ' | dot hidden: ' + (document.getElementById('visits-dot').style.display === 'none')`));

  console.log('--- DONOR SEES THE ANSWER');
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Amara Ndongo', 'user', donor.token))})`);
  await b.go(SITE + '/donor/index.html', `document.querySelector('#myVisits .cv-card') !== null`);
  out('13 donor sees Approved + the home note:', await b.js(`document.querySelector('#myVisits .cv-card').innerText.replace(/\\n/g, ' | ').slice(0, 230)`));

  console.log('--- PARTNER REQUESTS');
  await signInAs(`localStorage.setItem('partnerToken', ${JSON.stringify(partner.token)}); localStorage.setItem('partnerEmail', 'p@example.com')`);
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, `document.getElementById('orphanage-content') && !document.getElementById('orphanage-content').classList.contains('d-none')`);
  out('14 partner page: gallery section still renders with no needs:', await b.js(`document.getElementById('gallery-panel').innerText.slice(0, 40)`));
  await b.js(`document.getElementById('request-visit-btn').click()`);
  await b.waitFor(`!!document.querySelector('dialog.cv-dialog[open]')`);
  await b.js(`(() => {
    document.querySelector('.cv-dialog input[type=date]').value = '${day(20)}';
    document.querySelector('.cv-form').requestSubmit();
  })()`);
  await b.waitFor(`document.querySelector('.cv-done').textContent.length > 0`);
  out('15 partner request sent:', await b.js(`document.querySelector('.cv-done').textContent.slice(0, 40)`));
  await b.go(SITE + '/partner/orphanages.html', `document.querySelector('#my-visits .cv-card') !== null`);
  out('16 partner browse page lists it:', await b.js(`document.querySelector('#my-visits .cv-card').innerText.replace(/\\n/g, ' | ').slice(0, 120)`));
  await b.js(`document.querySelector('#my-visits .cv-btn-small').click()`);
  await b.waitFor(`document.querySelector('#my-visits .cv-badge-cancelled') !== null`);
  out('17 partner cancels it:', await b.js(`document.querySelector('#my-visits .cv-badge').textContent`));

  console.log('--- ADMIN');
  await signInAs(`localStorage.setItem('currentAdminEmail', 'owner@cam-test.org'); localStorage.setItem('currentAdminRole', 'Super Admin'); localStorage.setItem('adminToken', ${JSON.stringify(admin)})`);
  await b.go(SITE + '/admin/visits.html', `document.querySelectorAll('#visits-body tr').length > 0 && !document.querySelector('#visits-body').innerText.includes('Loading')`);
  out('18 admin lists both requests with emails:', await b.js(`document.querySelectorAll('#visits-body tr').length + ' rows | ' + document.querySelector('#visits-body').innerText.includes('d${stamp}@example.com')`));
  await b.js(`(() => { const s = document.getElementById('status-filter'); s.value = 'approved'; s.dispatchEvent(new Event('change')); })()`);
  out('19 filter Approved:', await b.js(`document.querySelectorAll('#visits-body tr').length + ' row(s)'`));

  console.log('--- PHONE WIDTH');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Amara Ndongo', 'user', donor.token))})`);
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.orphanage-visit-btn').length > 0`);
  await b.js(`document.querySelector('.orphanage-visit-btn').click()`);
  await b.waitFor(`!!document.querySelector('dialog.cv-dialog[open]')`);
  out('20 dialog fits a 360px phone:', await b.js(`(() => { const r = document.querySelector('dialog.cv-dialog').getBoundingClientRect(); return Math.round(r.left) + '..' + Math.round(r.right) + ' of 360, page overflow ' + (document.documentElement.scrollWidth > 360); })()`));
  await b.send('Emulation.clearDeviceMetricsOverride');

  out('21 page JS errors:', b.errors.length ? b.errors.join(' ; ') : 'none');
  out('22 failed requests:', b.netIssues.filter((x) => !/\/api\/visits\/?$|\/api\/my-orphanage\/visits\/\d+\/respond/.test(x)).join(' ; ') || 'none');
  process.exit(0);
})().catch((e) => { console.log('TEST FAILED', e); process.exit(1); });
