const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(56), v);
const J = { 'Content-Type': 'application/json' };

(async () => {
  const b = await connect();
  const stamp = Date.now();
  const admin = await (await fetch(SITE + '/api/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' }) })).json();
  const AH = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin.token };
  const adminLogin = () => b.js(`localStorage.setItem('adminToken', '${admin.token}'); localStorage.setItem('currentAdminEmail', '${admin.admin.email}'); localStorage.setItem('currentAdminRole', '${admin.admin.role}'); localStorage.setItem('currentAdminDisplayName', '${admin.admin.name}')`);

  // a verified orphanage with a need to browse
  const orph = await (await fetch(SITE + '/api/users/register', { method: 'POST', headers: J, body: JSON.stringify({ acceptTerms: true, fullname: 'Browse Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' }) })).json();
  await fetch(SITE + '/api/my-orphanage/needs', { method: 'POST', headers: { ...J, Authorization: 'Bearer ' + orph.token }, body: JSON.stringify({ title: 'School bags', description: 'x', goal: 30000 }) });
  const oid = (await (await fetch(SITE + '/api/orphanages', { headers: AH })).json()).orphanages.find((o) => o.name === 'Browse Home ' + stamp).id;
  await fetch(SITE + '/api/orphanages/' + oid, { method: 'PUT', headers: AH, body: JSON.stringify({ status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }) });

  console.log('--- DONOR PAGE');
  await b.go(SITE + '/donor/index.html', `document.getElementById('loadingState').classList.contains('d-none')`);
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.go(SITE + '/donor/index.html', `document.getElementById('loadingState').classList.contains('d-none')`);
  out('1 visitor sees:', await b.js(`document.getElementById('gateTitle').textContent`));
  out('2 visitor: orphanage cards / filter bar visible:', await b.js(`document.querySelectorAll('.card-orphanage').length + ' / ' + !document.getElementById('filterBar').classList.contains('d-none')`));
  out('3 visitor: sign in + create buttons:', await b.js(`[...document.querySelectorAll('#gateActions a')].map(a => a.textContent).join(' | ')`));

  await b.go(SITE + '/login/register.html', `!!document.querySelector('.register-form')`);
  await b.js(`(() => {
    document.getElementById('fullname').value = 'Waiting Donor';
    document.getElementById('email').value = 'w${stamp}@example.com';
    document.getElementById('password').value = 'secret1';
    document.getElementById('confirm-password').value = 'secret1';
    document.getElementById('accept-terms').checked = true;
    document.getElementById('user').checked = true;
    document.querySelector('.register-form').requestSubmit();
  })()`);
  await b.waitFor(`location.pathname === '/donor/profile.html' && document.getElementById('donorName').value !== ''`);
  out('4 new donor profile banner:', await b.js(`document.getElementById('approvalNote').textContent.slice(0, 60)`));
  await b.go(SITE + '/donor/index.html', `document.getElementById('loadingState').classList.contains('d-none')`);
  out('5 pending donor sees:', await b.js(`document.getElementById('gateTitle').textContent`));
  out('6 pending donor: cards visible:', await b.js(`document.querySelectorAll('.card-orphanage').length`));

  console.log('--- ADMIN APPROVES (real clicks)');
  const donors = (await (await fetch(SITE + '/api/donors', { headers: AH })).json()).donors;
  const waiting = donors.find((d) => d.email === 'w' + stamp + '@example.com');
  await b.go(SITE + '/admin/index.html');
  await adminLogin();
  await b.go(SITE + '/admin/donors.html', `document.body.innerText.includes('Waiting Donor')`);
  out('7 admin list badge for the donor:', await b.js(`[...document.querySelectorAll('#donor-grid > *, .col-md-6, .col-lg-4')].find(c => c.innerText.includes('Waiting Donor')).querySelector('.donor-status-badge').textContent`));
  out('8 admin filter has pending/rejected:', await b.js(`[...document.querySelectorAll('#status-filter option')].map(o => o.textContent).join(', ')`));
  await b.go(SITE + '/admin/donor-profile.html?id=' + waiting.id, `!!document.getElementById('approve-donor-btn')`);
  out('9 donor profile buttons:', await b.js(`['approve-donor-btn', 'reject-donor-btn', 'flag-account-btn'].map(id => id + '=' + !!document.getElementById(id)).join(' ')`));
  await b.js(`document.getElementById('approve-donor-btn').click()`);
  await b.waitFor(`!document.getElementById('approve-donor-btn')`);
  out('10 after Approve: badge / flag button:', await b.js(`document.querySelector('#donor-header-card .donor-status-badge').textContent + ' / ' + !!document.getElementById('flag-account-btn')`));
  await sleep(500);

  // the donor (still signed in as the new account) now sees orphanages
  await b.go(SITE + '/donor/index.html', `document.getElementById('loadingState').classList.contains('d-none')`);
  await b.js(`1`);
  const sess = await b.js(`sessionStorage.getItem('cocSession') || localStorage.getItem('cocSession')`);
  out('11 (session kept in this browser):', sess ? 'yes' : 'no - cleared by the admin-page visit');
  if (!sess) {
    const login = await (await fetch(SITE + '/api/users/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'w' + stamp + '@example.com', password: 'secret1' }) })).json();
    await b.js(`localStorage.setItem('cocSession', JSON.stringify({ fullname: 'Waiting Donor', email: 'w${stamp}@example.com', role: 'user', token: '${login.token}' }))`);
  }
  await b.go(SITE + '/donor/index.html', `document.getElementById('loadingState').classList.contains('d-none')`);
  out('12 approved donor: cards / gate hidden:', await b.js(`document.querySelectorAll('.card-orphanage').length + ' / ' + document.getElementById('accessGate').classList.contains('d-none')`));
  await b.js(`[...document.querySelectorAll('.card-orphanage')].find(c => c.innerText.includes('Browse Home ${stamp}')).querySelector('.donate-btn').click()`);
  await b.waitFor(`document.getElementById('donateModal').classList.contains('show')`);
  await b.js(`document.querySelector('.btn-quick-amount[data-amount="5000"]').click(); document.getElementById('donateForm').requestSubmit()`);
  await b.waitFor(`!document.getElementById('donateAlert').classList.contains('d-none')`);
  out('13 approved donor pledges:', await b.js(`document.getElementById('donateAlert').textContent.slice(0, 40)`));

  console.log('--- ADMIN REJECTS');
  await b.go(SITE + '/admin/index.html');
  await adminLogin();
  await fetch(SITE + '/api/donors/' + waiting.id, { method: 'PUT', headers: AH, body: JSON.stringify({ status: 'rejected', flagReason: 'Details do not match' }) });
  await b.go(SITE + '/donor/index.html', `document.getElementById('loadingState').classList.contains('d-none')`);
  await b.js(`1`);
  out('14 rejected donor sees:', await b.js(`document.getElementById('gateTitle').textContent`));

  console.log('--- PARTNER PAGES');
  const pEmail = 'p' + stamp + '@example.com';
  const partner = await (await fetch(SITE + '/api/partner-auth/register', { method: 'POST', headers: J, body: JSON.stringify({ acceptTerms: true, name: 'Locked Partner ' + stamp, email: pEmail, password: 'secret1' }) })).json();
  await b.go(SITE + '/partner/index.html');
  await b.js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('partnerToken', '${partner.token}'); localStorage.setItem('partnerEmail', '${pEmail}')`);
  await b.go(SITE + '/partner/orphanages.html', `!document.getElementById('empty-state').classList.contains('d-none')`);
  out('15 draft partner: Browse page says:', await b.js(`document.getElementById('empty-state').innerText.slice(0, 48)`));
  out('16 ... link to profile / search disabled:', await b.js(`!!document.querySelector('#empty-state a[href="profile.html"]') + ' / ' + document.getElementById('search-input').disabled`));
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, `!document.getElementById('empty-state').classList.contains('d-none')`);
  out('17 draft partner: orphanage page says:', await b.js(`document.getElementById('empty-state').innerText.slice(0, 44)`));
  await b.go(SITE + '/partner/dashboard.html', `!document.getElementById('dashboard-content').classList.contains('d-none')`);
  out('18 draft partner: dashboard still loads:', await b.js(`document.getElementById('partner-name').textContent`));
  out('19 ... with a "complete profile" note:', await b.js(`document.getElementById('status-note-box').innerText.slice(0, 40)`));

  const prow = (await (await fetch(SITE + '/api/partners', { headers: AH })).json()).partners.find((p) => p.email === pEmail);
  await fetch(SITE + '/api/partners/' + prow.id, { method: 'PUT', headers: AH, body: JSON.stringify({ verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }) });
  await b.go(SITE + '/partner/orphanages.html', `document.querySelectorAll('.profile-card, .card').length > 0`);
  await sleep(1000);
  out('20 verified partner: Browse shows orphanage:', await b.js(`document.body.innerText.includes('Browse Home ${stamp}')`));
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, `!document.getElementById('orphanage-content').classList.contains('d-none')`);
  out('21 verified partner: orphanage page opens:', await b.js(`!document.getElementById('orphanage-content').classList.contains('d-none')`));
  out('22 page JS errors:', b.errors.length ? b.errors.join(' | ') : 'none');
  b.close();
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
