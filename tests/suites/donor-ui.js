const { fixture } = require('../helpers/fixtures');
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(52), v);

(async () => {
  const png = fixture('me.png');
  fs.writeFileSync(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]));
  const b = await connect();
  const stamp = Date.now();
  const J = { 'Content-Type': 'application/json' };

  // an orphanage with a verified need, set up through the API
  const orph = await (await fetch(SITE + '/api/users/register', { method: 'POST', headers: J, body: JSON.stringify({ acceptTerms: true, fullname: 'Giving Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' }) })).json();
  await fetch(SITE + '/api/my-orphanage/needs', { method: 'POST', headers: Object.assign({ Authorization: 'Bearer ' + orph.token }, J), body: JSON.stringify({ title: 'Winter blankets', description: 'x', goal: 40000 }) });
  const admin = await (await fetch(SITE + '/api/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' }) })).json();
  const oid = (await (await fetch(SITE + '/api/orphanages', { headers: { Authorization: 'Bearer ' + admin.token } })).json()).orphanages.find((o) => o.name === 'Giving Home ' + stamp).id;
  await fetch(SITE + '/api/orphanages/' + oid, { method: 'PUT', headers: Object.assign({ Authorization: 'Bearer ' + admin.token }, J), body: JSON.stringify({ status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }) });

  await b.go(SITE + '/login/register.html', `!!document.querySelector('.register-form')`);
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.js(`(() => {
    document.getElementById('fullname').value = 'Amara Ndongo';
    document.getElementById('email').value = 'd${stamp}@example.com';
    document.getElementById('password').value = 'secret1';
    document.getElementById('confirm-password').value = 'secret1';
    document.getElementById('accept-terms').checked = true;
    document.getElementById('user').checked = true;
    document.querySelector('.register-form').requestSubmit();
  })()`);
  await b.waitFor(`location.pathname === '/donor/profile.html' && document.getElementById('donorName').value !== ''`);
  out('1 new donor lands on:', await b.js('location.pathname'));
  out('2 greeting / email prefilled:', await b.js(`document.getElementById('profileGreeting').textContent + ' | ' + document.getElementById('donorEmail').value`));
  out('3 photo placeholder shows initials:', await b.js(`document.getElementById('profilePhoto').textContent`));
  await b.js(`(() => {
    document.getElementById('donorLocation').value = 'Douala, Cameroon';
    document.getElementById('donorReferred').value = 'A friend';
    document.getElementById('donorPayment').value = 'MTN Mobile Money';
    document.getElementById('donorCurrency').value = 'XAF';
    document.getElementById('profileForm').requestSubmit();
  })()`);
  await b.waitFor(`!document.getElementById('profileSaved').classList.contains('d-none')`);
  out('4 saved message shown:', await b.js(`document.getElementById('profileSaved').textContent`));
  await b.js(`document.getElementById('photoBtn').click()`);
  await b.setFile('#photoInput', png);
  await b.waitFor(`!!document.querySelector('#profilePhoto img')`);
  out('5 photo shown after upload:', await b.js(`document.querySelector('#profilePhoto img').getAttribute('src').slice(0, 24)`));
  await b.go(SITE + '/donor/profile.html', `document.getElementById('donorLocation').value !== ''`);
  out('6 after reload, values kept:', await b.js(`['donorLocation', 'donorPayment', 'donorCurrency'].map(id => document.getElementById(id).value).join(' | ')`));

  // donors must be approved before they can browse or pledge
  const donorsNow = (await (await fetch(SITE + '/api/donors', { headers: { Authorization: 'Bearer ' + admin.token } })).json()).donors;
  const me = donorsNow.find((d) => d.email === 'd' + stamp + '@example.com');
  await fetch(SITE + '/api/donors/' + me.id, { method: 'PUT', headers: Object.assign({ Authorization: 'Bearer ' + admin.token }, J), body: JSON.stringify({ status: 'active' }) });

  // give page: pledge, then check the profile page lists it
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.donate-btn').length > 0`);
  out('7 nav shows My profile when signed in:', await b.js(`!document.getElementById('navProfile').classList.contains('d-none')`));
  await b.js(`[...document.querySelectorAll('.card-orphanage')].find(c => c.innerText.includes('Giving Home ${stamp}')).querySelector('.donate-btn').click()`);
  await b.waitFor(`document.getElementById('donateModal').classList.contains('show')`);
  await b.js(`document.querySelector('.btn-quick-amount[data-amount="10000"]').click(); document.getElementById('donateForm').requestSubmit()`);
  await b.waitFor(`!document.getElementById('donateAlert').classList.contains('d-none')`);
  await b.go(SITE + '/donor/profile.html', `document.querySelectorAll('#pledgeBody tr td').length > 1`);
  out('8 pledges table on profile:', await b.js(`[...document.querySelectorAll('#pledgeBody tr')[0].children].map(td => td.textContent).slice(1).join(' | ')`));
  out('9 summary line:', await b.js(`document.getElementById('pledgeSummary').textContent.slice(0, 40)`));

  // admin Donations + Donors pages
  await b.go(SITE + '/admin/index.html');
  await b.js(`localStorage.setItem('adminToken', '${admin.token}'); localStorage.setItem('currentAdminEmail', '${admin.admin.email}'); localStorage.setItem('currentAdminRole', '${admin.admin.role}'); localStorage.setItem('currentAdminDisplayName', '${admin.admin.name}')`);
  await b.go(SITE + '/admin/donors.html', `document.body.innerText.includes('Amara Ndongo')`);
  out('10 admin Donors page lists the donor:', await b.js(`document.body.innerText.includes('Amara Ndongo')`));
  await b.go(SITE + '/admin/donations.html', `document.body.innerText.includes('Winter blankets')`);
  out('11 admin Donations page shows pledge:', await b.js(`(() => { const r = [...document.querySelectorAll('#donations-tbody tr')].find(t => t.innerText.includes('Winter blankets')); return r ? r.innerText.replace(/\\s+/g, ' ').slice(0, 90) : 'NOT FOUND'; })()`));
  out('12 admin status filter options:', await b.js(`[...document.querySelectorAll('#status-filter option')].map(o => o.textContent).join(', ')`));
  await b.js(`document.getElementById('status-filter').value = 'pledged'; document.getElementById('status-filter').dispatchEvent(new Event('change'))`);
  await sleep(500);
  out('13 filter Pledged shows rows:', await b.js(`document.querySelectorAll('#donations-tbody tr').length`));
  out('14 page JS errors:', b.errors.length ? b.errors.join(' | ') : 'none');
  b.close();
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
