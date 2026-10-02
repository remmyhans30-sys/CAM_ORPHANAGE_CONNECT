const { fixture } = require('../helpers/fixtures');
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(52), v);

(async () => {
  const pdfPath = fixture('reg.pdf');
  const logoPath = fixture('logo.png');
  fs.writeFileSync(pdfPath, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(400, 66)]));
  fs.writeFileSync(logoPath, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 2)]));
  const b = await connect();
  const stamp = Date.now();
  const orgName = 'Yaounde Diaspora Alliance ' + stamp;

  await b.go(SITE + '/login/register.html', `!!document.querySelector('.register-form')`);
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  out('1 register page offers Partner:', await b.js(`!!document.getElementById('partner')`));
  await b.js(`document.getElementById('partner').click()`);
  out('2 name box now asks for:', await b.js(`document.getElementById('fullname').placeholder`));
  await b.js(`(() => {
    document.getElementById('fullname').value = '${orgName}';
    document.getElementById('email').value = 'p${stamp}@example.com';
    document.getElementById('password').value = 'secret1';
    document.getElementById('confirm-password').value = 'secret1';
    document.getElementById('accept-terms').checked = true;
    document.querySelector('.register-form').requestSubmit();
  })()`);
  await b.waitFor(`location.pathname === '/partner/profile.html' && document.getElementById('checklist').children.length > 0`);
  out('3 new partner lands on:', await b.js('location.pathname'));
  out('4 status badge:', await b.js(`document.getElementById('status-badge').textContent`));
  out('5 org name prefilled / summary:', await b.js(`document.getElementById('org-name').value.slice(0, 22) + ' | ' + document.getElementById('checklist-summary').textContent.slice(0, 32)`));
  out('6 submit disabled:', await b.js(`document.getElementById('submit-review-btn').disabled`));

  await b.js(`(() => {
    document.getElementById('org-type').value = 'Diaspora Association';
    document.getElementById('org-country').value = 'France';
    document.getElementById('org-contact').value = 'Marie Kamga';
    document.getElementById('org-blurb').value = 'Proud to support children in Cameroon.';
    document.getElementById('pledge-description').value = 'Match donor gifts to one home';
    document.getElementById('pledge-limit').value = '500000';
    document.getElementById('profile-form').requestSubmit();
  })()`);
  await b.waitFor(`!document.getElementById('profile-saved').classList.contains('d-none')`);
  out('7 saved; checklist now:', await b.js(`document.getElementById('checklist-summary').textContent.slice(0, 32)`));

  await b.js(`document.querySelector('[data-upload="document"]').click()`);
  await b.setFile('#upload-input', pdfPath);
  await b.waitFor(`document.querySelectorAll('#doc-list a').length === 1`);
  out('8 document listed:', await b.js(`document.querySelector('#doc-list a').textContent`));
  await b.js(`document.querySelector('[data-upload="logo"]').click()`);
  await b.setFile('#upload-input', logoPath);
  await b.waitFor(`!!document.querySelector('#logo-box img')`);
  out('9 logo shown:', await b.js(`document.querySelector('#logo-box img').getAttribute('src').slice(0, 24)`));
  await b.js(`document.getElementById('org-terms').checked = true; document.getElementById('profile-form').requestSubmit()`);
  await b.waitFor(`!document.getElementById('submit-review-btn').disabled`);
  out('10 submit enabled:', await b.js(`!document.getElementById('submit-review-btn').disabled`));

  // Not visible to the admin before submitting
  const admin = await (await fetch(SITE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' }) })).json();
  const partnerSession = { token: await b.js(`localStorage.getItem('partnerToken')`), email: await b.js(`localStorage.getItem('partnerEmail')`) };
  const adminLogin = async () => b.js(`localStorage.setItem('adminToken', '${admin.token}'); localStorage.setItem('currentAdminEmail', '${admin.admin.email}'); localStorage.setItem('currentAdminRole', '${admin.admin.role}'); localStorage.setItem('currentAdminDisplayName', '${admin.admin.name}')`);
  await b.go(SITE + '/admin/index.html');
  await adminLogin();
  await b.go(SITE + '/admin/partners.html');
  await sleep(1500);
  out('11 admin Partners sees it before submit:', await b.js(`document.body.innerText.includes('${orgName}')`));

  await b.go(SITE + '/partner/profile.html');
  await b.js(`localStorage.setItem('partnerToken', '${partnerSession.token}'); localStorage.setItem('partnerEmail', '${partnerSession.email}')`);
  await b.go(SITE + '/partner/profile.html', `document.getElementById('checklist').children.length > 0`);
  await b.js(`document.getElementById('submit-review-btn').click()`);
  await b.waitFor(`document.getElementById('status-badge').textContent === 'Pending'`);
  out('12 badge after submit:', await b.js(`document.getElementById('status-badge').textContent`));
  out('13 submit button hidden:', await b.js(`document.getElementById('submit-review-btn').style.display === 'none'`));

  await b.go(SITE + '/admin/partners.html', `document.body.innerText.includes('${orgName}')`);
  out('14 admin Partners now lists it:', await b.js(`document.body.innerText.includes('${orgName}')`));
  await b.js(`[...document.querySelectorAll('a')].find(a => a.closest('[data-id]') ? a.closest('[data-id]').innerText.includes('${orgName}') : false) && 0`);
  const pid = (await (await fetch(SITE + '/api/partners', { headers: { Authorization: 'Bearer ' + admin.token } })).json()).partners.find((p) => p.name === orgName).id;
  await b.go(SITE + '/admin/partner-profile.html?id=' + pid, `document.getElementById('verification-documents-panel').innerText.length > 5`);
  await sleep(800);
  out('15 admin partner page shows doc as link:', await b.js(`!!document.querySelector('#verification-documents-panel [data-open-document]') && document.querySelector('#verification-documents-panel [data-open-document]').textContent`));
  const before = (await b.targets()).length;
  await b.js(`document.querySelector('#verification-documents-panel [data-open-document]').click()`);
  let blobTab = null;
  for (let i = 0; i < 25 && !blobTab; i++) { await sleep(300); blobTab = (await b.targets()).find((t) => t.url.startsWith('blob:')); }
  out('16 clicking opens the file:', blobTab ? 'yes' : 'NO');

  // login page recognises each account type
  await b.go(SITE + '/login/index.html');
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.js(`document.getElementById('email').value = 'p${stamp}@example.com'; document.getElementById('password').value = 'secret1'; document.querySelector('.login-form').requestSubmit();`);
  await b.waitFor(`location.pathname === '/partner/dashboard.html'`);
  out('17 partner logs in on the shared login ->', await b.js('location.pathname'));
  await b.go(SITE + '/login/index.html');
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.js(`document.getElementById('email').value = 'p${stamp}@example.com'; document.getElementById('password').value = 'wrong-password'; document.querySelector('.login-form').requestSubmit();`);
  await b.waitFor(`document.getElementById('login-error').classList.contains('show')`);
  out('18 wrong password message:', await b.js(`document.getElementById('login-error').textContent`));
  out('19 dashboard nav has My Organization:', await (async () => { await b.go(SITE + '/partner/index.html'); return 'n/a'; })());
  out('20 page JS errors:', b.errors.length ? b.errors.join(' | ') : 'none');
  b.close();
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
