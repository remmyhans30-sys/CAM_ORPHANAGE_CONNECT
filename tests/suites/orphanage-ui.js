const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (label, value) => console.log(label.padEnd(52), value);

(async () => {
  const dir = require('../helpers/fixtures').DIR;
  fs.mkdirSync(dir, { recursive: true });
  const pdfPath = path.join(dir, 'cert.pdf');
  const pngPath = path.join(dir, 'front.png');
  fs.writeFileSync(pdfPath, Buffer.concat([Buffer.from('%PDF-1.4\n%test\n'), Buffer.alloc(500, 65)]));
  fs.writeFileSync(pngPath, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]));

  const b = await connect();
  const stamp = Date.now();
  const name = 'Hope Valley Home ' + stamp;

  // a second account that never submits: must not show up for the admin
  await fetch(SITE + '/api/users/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptTerms: true, fullname: 'Unfinished Home ' + stamp, email: 'u' + stamp + '@example.com', password: 'secret1', role: 'volunteer' }) });

  await b.go(SITE + '/login/register.html', `!!document.querySelector('.register-form')`);
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.js(`(() => {
    document.getElementById('fullname').value = '${name}';
    document.getElementById('email').value = 'h${stamp}@example.com';
    document.getElementById('password').value = 'secret1';
    document.getElementById('confirm-password').value = 'secret1';
    document.getElementById('accept-terms').checked = true;
    document.getElementById('volunteer').checked = true;
    document.querySelector('.register-form').requestSubmit();
  })()`);
  await b.waitFor(`location.pathname === '/orphanage/index.html' && document.getElementById('checklist').children.length > 0`);

  out('1 status badge after sign-up:', await b.js(`document.getElementById('status-badge').textContent.trim()`));
  out('2 checklist summary:', await b.js(`document.getElementById('checklist-summary').textContent.slice(0, 40)`));
  out('3 submit button disabled:', await b.js(`document.getElementById('submit-review-btn').disabled`));
  out('4 profile form already editable (draft):', await b.js(`!document.getElementById('org-registration').disabled`));

  // fill the profile
  await b.js(`document.querySelector('[data-view="profile"]').click()`);
  await b.js(`(() => {
    const set = (id, v) => { document.getElementById(id).value = v; };
    set('org-location', 'Limbe, Southwest'); set('org-registration', 'REG-SW-2019-044'); set('org-founded', '2015');
    set('org-children', '24'); set('org-capacity', '35'); set('org-contact-name', 'Grace Mbeki'); set('org-contact-phone', '+237 677 000 111');
    set('org-contact-email', 'grace@example.com'); set('org-story', 'We raise 24 children and support their schooling.');
    set('org-story-language', 'en'); set('org-pay-provider', 'MTN Mobile Money'); set('org-pay-name', 'Hope Valley'); set('org-pay-number', '677000111');
    document.getElementById('profile-form').requestSubmit();
  })()`);
  await b.waitFor(`document.getElementById('org-registration').disabled === true`);
  out('5 saved; reg number kept:', await b.js(`document.getElementById('org-registration').value`));
  out('6 submit still blocked (no doc / terms):', await b.js(`document.getElementById('submit-review-btn').disabled`));

  // uploads through the real file input
  await b.js(`document.querySelector('[data-upload="document"]').click()`);
  await b.setFile('#upload-input', pdfPath);
  await b.waitFor(`document.querySelectorAll('#doc-list a').length === 1`);
  out('7 document listed:', await b.js(`document.querySelector('#doc-list a').textContent`));
  await b.js(`document.querySelector('[data-upload="photo"]').click()`);
  await b.setFile('#upload-input', pngPath);
  await b.waitFor(`!!document.querySelector('#photo-preview img')`);
  out('8 photo preview shows:', await b.js(`document.querySelector('#photo-preview img').getAttribute('src').slice(0, 28)`));
  out('9 photo really loads:', await b.js(`new Promise(r => { const i = document.querySelector('#photo-preview img'); i.complete ? r(i.naturalWidth > 0 || 'broken-or-fake-png') : (i.onload = () => r(true), i.onerror = () => r('error')); })`));

  // a bad file is refused with a clear message
  fs.writeFileSync(path.join(dir, 'fake.pdf'), Buffer.from('MZ not really a pdf'));
  await b.js(`document.querySelector('[data-upload="document"]').click()`);
  await b.setFile('#upload-input', path.join(dir, 'fake.pdf'));
  await b.waitFor(`document.getElementById('upload-error').classList.contains('show')`);
  out('10 fake PDF refused with message:', await b.js(`document.getElementById('upload-error').textContent`));

  // terms
  await b.js(`document.getElementById('edit-profile-btn').click(); document.getElementById('org-terms').checked = true; document.getElementById('profile-form').requestSubmit();`);
  await b.waitFor(`document.getElementById('org-terms').disabled === true`);
  await b.js(`document.querySelector('[data-view="overview"]').click()`);
  out('11 checklist now:', await b.js(`document.getElementById('checklist-summary').textContent.slice(0, 40)`));
  out('12 submit button enabled:', await b.js(`!document.getElementById('submit-review-btn').disabled`));

  // not visible to admin yet
  const admin = await (await fetch(SITE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' }) })).json();
  const adminLogin = async () => {
    await b.js(`localStorage.setItem('adminToken', '${admin.token}'); localStorage.setItem('currentAdminEmail', '${admin.admin.email}'); localStorage.setItem('currentAdminRole', '${admin.admin.role}'); localStorage.setItem('currentAdminDisplayName', '${admin.admin.name}')`);
  };
  const portalSession = await b.js(`sessionStorage.getItem('cocSession') || localStorage.getItem('cocSession')`);
  await b.go(SITE + '/admin/index.html');
  await adminLogin();
  await b.go(SITE + '/admin/verification.html');
  await sleep(1500);
  out('13 admin sees draft orphanage cards:', await b.js(`document.body.innerText.includes('${name}') || document.body.innerText.includes('Unfinished Home')`));

  // submit from the portal
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('checklist').children.length > 0`);
  await b.js(`sessionStorage.setItem('cocSession', ${JSON.stringify(portalSession)})`);
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('checklist').children.length > 0`);
  await b.js(`document.getElementById('submit-review-btn').click()`);
  await b.waitFor(`document.getElementById('status-badge').textContent.includes('Pending')`);
  out('14 badge after submit:', await b.js(`document.getElementById('status-badge').textContent.trim()`));
  out('15 submit button hidden after submit:', await b.js(`document.getElementById('submit-review-btn').style.display === 'none'`));

  // admin now sees it, with the details and a working document link
  await b.go(SITE + '/admin/verification.html');
  await adminLogin();
  await b.go(SITE + '/admin/verification.html', `document.body.innerText.includes('${name}')`);
  out('16 admin sees submitted orphanage:', await b.js(`document.body.innerText.includes('${name}')`));
  out('17 admin does NOT see unfinished one:', await b.js(`!document.body.innerText.includes('Unfinished Home')`));
  out('18 card says documents uploaded:', await b.js(`[...document.querySelectorAll('.profile-docs')].map(e => e.textContent).filter(t => t.includes('uploaded')).length > 0`));
  await b.js(`[...document.querySelectorAll('.review-btn')].find(btn => btn.closest('[data-id]').innerText.includes('${name}')).click()`);
  await b.waitFor(`!!document.querySelector('#profile-modal-body [data-open-document]')`);
  out('19 modal shows registration number:', await b.js(`document.getElementById('profile-modal-body').innerText.includes('REG-SW-2019-044')`));
  out('20 modal shows capacity & contact:', await b.js(`['35', 'Grace Mbeki', '677000111'].every(t => document.getElementById('profile-modal-body').innerText.includes(t))`));
  out('21 document is a link:', await b.js(`document.querySelector('#profile-modal-body [data-open-document]').textContent`));
  const before = (await b.targets()).length;
  await b.js(`document.querySelector('#profile-modal-body [data-open-document]').click()`);
  let blobTab = null;
  for (let i = 0; i < 25 && !blobTab; i++) { await sleep(300); blobTab = (await b.targets()).find((t) => t.url.startsWith('blob:')); }
  out('22 clicking it opens the file in a new tab:', blobTab ? 'yes (' + blobTab.url.slice(0, 30) + '...)' : 'NO (' + (await b.targets()).map((t) => t.url).join(', ') + ')');
  out('23 page JS errors:', b.errors.length ? b.errors.join(' | ') : 'none');
  b.close();
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
