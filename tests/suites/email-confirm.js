// Email confirmation: the link sent at sign-up, approvals waiting for it, "send again", and the pages.
// Run the site with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (the emails are caught by a local mail server).
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { connect, sleep } = require('../helpers/browser');

const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(74), (ok ? 'ok' : 'FAIL') + (detail !== undefined && detail !== '' ? '  ' + detail : '')); if (!ok) failures++; };
const mails = [];
const smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, session, cb) { simpleParser(stream).then((m) => { mails.push(m); cb(); }, cb); } });
async function call(p, method, body, token) {
  const res = await fetch(A + p, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const toOf = (m) => (m.to && m.to.value || []).map((a) => a.address.toLowerCase());
async function mailTo(address, subject, ms = 5000) {
  for (let t = 0; t < ms; t += 100) {
    const found = mails.find((m) => toOf(m).includes(address.toLowerCase()) && subject.test(m.subject) && !m.used);
    if (found) { found.used = true; return found; }
    await sleep(100);
  }
  return null;
}
const CONFIRM = /Confirm your email address/;
const linkIn = (m) => { const r = /(http\S+\/login\/confirm-email\.html\?token=(\S+))/.exec(m ? m.text : ''); return r ? { url: r[1], token: r[2] } : null; };
const itemOf = (checklist) => (checklist || []).find((i) => i.key === 'emailConfirmed');

(async () => {
  await new Promise((r) => smtp.listen(2525, '127.0.0.1', r));
  const stamp = Date.now();
  const email = (who) => who + stamp + '@example.com';
  const adminLogin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body;
  const admin = adminLogin.token;
  const reg = async (who, name, role) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name, email: email(who), password: 'secret1', role })).body;

  console.log('--- SIGN-UP');
  const donor = await reg('cd', 'Clara Donor', 'user');
  let m = await mailTo(email('cd'), CONFIRM);
  const donorLink = linkIn(m);
  check('1 a new donor gets an email with a confirmation link', Boolean(donorLink) && donorLink.url.startsWith(SITE + '/login/confirm-email.html?token='), m && m.subject);
  check('2 ... in plain text and HTML, addressed by name', Boolean(m) && m.text.includes('Hello Clara Donor') && Boolean(m.html) && m.html.includes(donorLink.url));
  const home = await reg('ch', 'Confirm Home ' + stamp, 'volunteer');
  const homeLink = linkIn(await mailTo(email('ch'), CONFIRM));
  await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Confirm Partner ' + stamp, email: email('cp'), password: 'secret1' });
  const partner = (await call('/partner-auth/login', 'POST', { email: email('cp'), password: 'secret1' })).body;
  const partnerLink = linkIn(await mailTo(email('cp'), CONFIRM));
  check('3 orphanage and partner sign-ups get one too', Boolean(homeLink) && Boolean(partnerLink));

  console.log('--- BEFORE CONFIRMING');
  let r = await call('/browse/orphanages', 'GET', null, donor.token);
  check('4 the donor is asked to confirm first (not just "waiting")', r.status === 403 && r.body.code === 'confirm-email' && /confirm your email/i.test(r.body.error), r.body.code);
  r = await call('/my-donor', 'GET', null, donor.token);
  check('5 the donor profile knows the address still needs confirming', r.body.donor && r.body.donor.needsEmailConfirmation === true);
  r = await call('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  check('6 an admin cannot approve the donor yet, and is told why', r.status === 400 && /not confirmed their email address/.test(r.body.error), r.status + ' ' + r.body.error);
  r = await call('/donors/' + donor.user.id, 'GET', null, admin);
  check('7 ... the donor stays pending; the admin sees it is waiting for the email', r.body.donor.status === 'pending' && r.body.donor.emailConfirmed === false && r.body.donor.needsEmailConfirmation === true);
  r = await call('/my-orphanage', 'GET', null, home.token);
  const homeItem = itemOf(r.body.orphanage.checklist);
  check('8 the orphanage checklist has "confirm your email" (required, not done)', Boolean(homeItem) && homeItem.required === true && homeItem.done === false);
  r = await call('/my-orphanage/submit', 'POST', null, home.token);
  check('9 ... and the home cannot submit without it', r.status === 400 && (r.body.missing || []).includes('emailConfirmed'), (r.body.missing || []).join(','));
  const oid = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'Confirm Home ' + stamp).id;
  r = await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'EC-' + stamp, termsAgreed: true }, admin);
  check('10 an admin cannot verify the home yet', r.status === 400 && /not confirmed its email address/.test(r.body.error), r.status + '');
  r = await call('/partner-auth/me', 'GET', null, partner.token);
  check('11 the partner checklist has it too', Boolean(itemOf(r.body.partner.checklist)) && itemOf(r.body.partner.checklist).done === false);
  r = await call('/partners/' + partner.partner.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  check('12 an admin cannot verify the partner yet', r.status === 400 && /not confirmed its email address/.test(r.body.error), r.status + '');

  console.log('--- SEND AGAIN');
  r = await call('/account/confirm-email/resend', 'POST', null, donor.token);
  m = await mailTo(email('cd'), CONFIRM);
  check('13 "send the link again" sends a new link', r.status === 200 && r.body.outcome === 'sent' && Boolean(linkIn(m)), r.body.message);
  r = await call('/account/confirm-email/resend', 'POST', null, donor.token);
  await mailTo(email('cd'), CONFIRM);
  r = await call('/account/confirm-email/resend', 'POST', null, donor.token);
  check('14 at most 3 links an hour (sign-up + 2 more)', r.status === 429, r.status + ' ' + (r.body.error || ''));
  r = await call('/account/confirm-email/resend', 'POST', null, partner.token);
  check('15 partners can ask for a new link as well', r.status === 200 && r.body.outcome === 'sent');
  await mailTo(email('cp'), CONFIRM);
  r = await call('/account/confirm-email/resend', 'POST');
  check('16 ... but only when signed in', r.status === 401);

  console.log('--- THE LINK');
  r = await call('/account/confirm-email', 'POST', { token: 'nonsense' });
  check('17 a broken link is refused', r.status === 400 && /not valid/.test(r.body.error));
  const parts = donorLink.token.split('.');
  r = await call('/account/confirm-email', 'POST', { token: home.user.id + '.' + parts[1] + '.' + parts[2] });
  check('18 a link changed to another account is refused', r.status === 400);
  r = await call('/account/confirm-email', 'POST', { token: parts[0] + '.' + (Number(parts[1]) + 60) + '.' + parts[2] });
  check('19 a link with a changed expiry time is refused', r.status === 400);
  r = await call('/account/confirm-email', 'POST', { token: donorLink.token });
  check('20 the real link confirms the address', r.status === 200 && r.body.role === 'donor' && /email address is confirmed/.test(r.body.message), r.body.message);
  r = await call('/account/confirm-email', 'POST', { token: donorLink.token });
  check('21 opening it again is harmless', r.status === 200 && /already confirmed/.test(r.body.message));
  r = await call('/account/confirm-email/resend', 'POST', null, donor.token);
  check('22 "send again" now says there is nothing to do', r.status === 200 && r.body.outcome === 'confirmed');
  r = await call('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  check('23 now the admin can approve the donor', r.status === 200 && r.body.donor.status === 'active' && r.body.donor.emailConfirmed === true);
  check('24 the donor\'s history shows the confirmation', (r.body.donor.activityLog || []).some((e) => e.action === 'Confirmed their email address'));
  r = await call('/browse/orphanages', 'GET', null, donor.token);
  check('25 ... and the donor can browse', r.status === 200);

  await call('/account/confirm-email', 'POST', { token: homeLink.token });
  r = await call('/my-orphanage', 'GET', null, home.token);
  check('26 the home\'s checklist item is ticked', itemOf(r.body.orphanage.checklist).done === true);
  r = await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'EC-' + stamp, termsAgreed: true }, admin);
  check('27 the admin can verify the home', r.status === 200 && r.body.orphanage.status === 'verified', r.status + '');
  await call('/account/confirm-email', 'POST', { token: partnerLink.token });
  r = await call('/partners/' + partner.partner.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  check('28 ... and the partner', r.status === 200 && r.body.partner.verificationStatus === 'verified', r.status + '');

  console.log('--- CHANGED ADDRESS, PASSWORD RESET, ACCOUNTS AN ADMIN ADDED');
  r = await call('/partners/' + partner.partner.id, 'PUT', { email: email('cp2') }, admin);
  check('29 a new address for the partner has to be confirmed again', r.status === 200 && r.body.partner.emailConfirmed === false);
  r = await call('/account/confirm-email', 'POST', { token: partnerLink.token });
  check('30 ... the link sent to the old address no longer works', r.status === 400);
  const resetter = await reg('cr', 'Reset Donor', 'user');
  await mailTo(email('cr'), CONFIRM);
  await call('/users/forgot-password', 'POST', { email: email('cr') });
  m = await mailTo(email('cr'), /Reset your/);
  const resetToken = m && /token=([0-9a-f]{64})/.exec(m.text)[1];
  r = await call('/users/reset-password', 'POST', { token: resetToken, password: 'secret2' });
  r = await call('/donors/' + resetter.user.id, 'GET', null, admin);
  check('31 using a password-reset link also confirms the address', r.body.donor.emailConfirmed === true);
  const placeholder = await call('/orphanages', 'POST', { name: 'Paper Home ' + stamp, location: 'Kribi' }, admin);
  r = await call('/orphanages/' + placeholder.body.orphanage.id, 'PUT', { status: 'verified', registrationNumber: 'PH-' + stamp, termsAgreed: true }, admin);
  check('32 a home an admin added (no login) can be verified without it', r.status === 200, r.status + ' ' + (r.body.error || ''));

  console.log('--- PAGES');
  const b = await connect();
  const fitsPhone = async () => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    const fits = await b.js('document.documentElement.scrollWidth <= 360');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    return fits;
  };
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const fresh = await reg('cu', 'Una Unconfirmed', 'user');
  const freshLink = linkIn(await mailTo(email('cu'), CONFIRM));
  await b.go(SITE + '/login/confirm-email.html?token=' + freshLink.token, `!!document.getElementById('confirm-email-btn')`);
  check('33 the confirm page keeps the link out of the address bar', (await b.js('location.search')) === '');
  await b.js(`document.getElementById('confirm-email-btn').click()`);
  await b.waitFor(`document.getElementById('confirm-success').classList.contains('show')`);
  const shown = await b.js(`document.getElementById('confirm-success').innerText + ' -> ' + document.querySelector('#confirm-success a').getAttribute('href')`);
  check('34 one click confirms, with a link onwards', /email address is confirmed/.test(shown) && shown.endsWith('../donor/profile.html'), shown);
  await b.go(SITE + '/login/confirm-email.html?token=bad', `!!document.getElementById('confirm-email-btn')`);
  check('35 a broken link: message shown, button disabled', await b.js(`document.getElementById('confirm-error').classList.contains('show') && document.getElementById('confirm-email-btn').disabled`));

  const late = await reg('cl', 'Lea Late', 'user');
  await mailTo(email('cl'), CONFIRM);
  await b.go(SITE + '/login/forgot-password.html');
  await b.js(`localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('cocSession', JSON.stringify({ fullname: 'Lea Late', email: '${email('cl')}', role: 'user', token: '${late.token}' }))`);
  await b.go(SITE + '/donor/index.html', `document.getElementById('loadingState').classList.contains('d-none')`);
  check('36 donor page: "confirm your email" instead of the list', /Confirm your email address/.test(await b.js(`document.getElementById('gateTitle').textContent`)));
  await b.js(`document.querySelector('#gateActions .email-confirm-resend button').click()`);
  await b.waitFor(`/new link/.test(document.getElementById('gateResult').textContent)`);
  check('37 ... its "send the link again" button works', Boolean(await mailTo(email('cl'), CONFIRM)));
  check('37b ... and the page fits a phone screen', await fitsPhone());
  await b.go(SITE + '/donor/profile.html', `!document.getElementById('emailNote').classList.contains('d-none')`);
  check('38 donor profile: notice with the address and the button', await b.js(`document.getElementById('emailNote').textContent.includes('${email('cl')}') && !!document.querySelector('#emailNote .email-confirm-resend button')`));
  check('38b ... fits a phone screen', await fitsPhone());

  const portalHome = await reg('cq', 'Quiet Home ' + stamp, 'volunteer');
  await mailTo(email('cq'), CONFIRM);
  await b.js(`sessionStorage.setItem('cocSession', JSON.stringify({ fullname: 'Quiet Home', email: '${email('cq')}', role: 'volunteer', token: '${portalHome.token}' }))`);
  await b.go(SITE + '/orphanage/index.html', `document.querySelectorAll('#checklist li').length > 0`);
  check('39 orphanage portal: the checklist item has the button', await b.js(`[...document.querySelectorAll('#checklist li')].some(li => /Confirm your email/.test(li.textContent) && !!li.querySelector('.email-confirm-resend button'))`));
  check('39b ... fits a phone screen', await fitsPhone());

  await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Page Partner ' + stamp, email: email('cz'), password: 'secret1' });
  const pagePartner = (await call('/partner-auth/login', 'POST', { email: email('cz'), password: 'secret1' })).body;
  await mailTo(email('cz'), CONFIRM);
  await b.js(`localStorage.setItem('partnerToken', '${pagePartner.token}'); localStorage.setItem('partnerEmail', '${email('cz')}')`);
  await b.go(SITE + '/partner/profile.html', `document.querySelectorAll('#checklist li').length > 0`);
  check('40 partner profile: the checklist item has the button', await b.js(`[...document.querySelectorAll('#checklist li')].some(li => /Confirm your email/.test(li.textContent) && !!li.querySelector('.email-confirm-resend button'))`));
  check('40b ... fits a phone screen', await fitsPhone());

  await b.js(`localStorage.setItem('adminToken', '${admin}'); localStorage.setItem('currentAdminEmail', '${adminLogin.admin.email}'); localStorage.setItem('currentAdminRole', '${adminLogin.admin.role}'); localStorage.setItem('currentAdminDisplayName', '${adminLogin.admin.name}')`);
  await b.go(SITE + '/admin/donor-profile.html?id=' + late.user.id, `!!document.getElementById('approve-donor-btn')`);
  check('41 admin donor page: Approve waits for the email, and says so', await b.js(`document.getElementById('approve-donor-btn').disabled && /confirmed their email/.test(document.getElementById('donor-header-card').textContent)`));
  const quietId = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'Quiet Home ' + stamp).id;
  await call('/orphanages/' + quietId, 'PUT', { status: 'pending' }, admin);
  await b.go(SITE + '/admin/verification.html?id=' + quietId, `!!document.querySelector('.modal-approve-btn')`);
  check('42 admin verification: Approve waits for the email, and says so', await b.js(`document.querySelector('.modal-approve-btn').disabled && /Not confirmed yet/.test(document.getElementById('profile-modal-body').textContent)`));
  const pageRow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Page Partner ' + stamp);
  await call('/partners/' + pageRow.id, 'PUT', { verificationStatus: 'pending' }, admin);
  await b.go(SITE + '/admin/partner-profile.html?id=' + pageRow.id, `!!document.getElementById('mark-verified-btn')`);
  check('43 admin partner page: Verify waits for the email, and says so', await b.js(`document.getElementById('mark-verified-btn').disabled && /Email address confirmed/.test(document.getElementById('onboarding-checklist').textContent)`));
  check('44 no JavaScript errors on these pages', b.errors.length === 0, b.errors.join(' | '));
  b.close();

  smtp.close();
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
