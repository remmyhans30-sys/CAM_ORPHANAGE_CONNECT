// Notification emails, caught by a local mail server.
// Run the site with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SITE_URL=http://127.0.0.2:4555.
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { sleep } = require('../helpers/browser');

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
// Waits for the next email to this address whose subject matches, and returns it.
async function mailTo(address, subject, ms = 5000) {
  for (let t = 0; t < ms; t += 100) {
    const found = mails.find((m) => toOf(m).includes(address.toLowerCase()) && subject.test(m.subject) && !m.used);
    if (found) { found.used = true; return found; }
    await sleep(100);
  }
  return null;
}

(async () => {
  await new Promise((r) => smtp.listen(2525, '127.0.0.1', r));
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const email = (who) => who + stamp + '@example.com';
  const reg = async (who, name, role) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name, email: email(who), password: 'secret1', role })).body;

  console.log('--- ACCOUNT DECISIONS');
  const donor = await reg('nd', 'Nadia Donor', 'user');
  const quiet = await reg('nq', 'Quentin Quiet', 'user');
  const refused = await reg('nr', 'Refused Donor', 'user');
  await call('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  let m = await mailTo(email('nd'), /approved/i);
  check('1 a donor is told the account is approved', Boolean(m) && m.subject === 'Your donor account is approved' && m.text.includes('Hello Nadia Donor') && m.text.includes(SITE + '/login/index.html'), m && m.subject);
  await call('/donors/' + quiet.user.id, 'PUT', { status: 'active' }, admin);
  await mailTo(email('nq'), /approved/i);
  await call('/donors/' + refused.user.id, 'PUT', { status: 'rejected', flagReason: 'We could not confirm who you are' }, admin);
  m = await mailTo(email('nr'), /About your donor account/);
  check('2 ... or not approved, with the reason', Boolean(m) && m.text.includes('We could not confirm who you are'));
  const before = mails.length;
  await call('/donors/' + donor.user.id, 'PUT', { status: 'active', location: 'Douala' }, admin);
  await sleep(1500);
  check('3 saving again without a change sends nothing', mails.length === before, (mails.length - before) + ' extra');

  const home = await reg('nh', 'Notify Home ' + stamp, 'volunteer');
  const oid = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'Notify Home ' + stamp).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'needs-info', infoRequestMessage: 'Please upload your registration certificate.' }, admin);
  m = await mailTo(email('nh'), /More information needed/);
  check('4 a home is told what information is missing', Boolean(m) && m.text.includes('Please upload your registration certificate.'));
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'NT-' + stamp, termsAgreed: true }, admin);
  m = await mailTo(email('nh'), /is verified/);
  check('5 ... and when it is verified', Boolean(m) && m.subject === 'Notify Home ' + stamp + ' is verified');

  await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Notify Partner ' + stamp, email: email('np'), password: 'secret1' });
  const prow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Notify Partner ' + stamp);
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  m = await mailTo(email('np'), /is verified/);
  check('6 a partner is told it is verified', Boolean(m) && m.text.includes('/partner/index.html'));

  const placeholder = await call('/orphanages', 'POST', { name: 'No Login Home ' + stamp, location: 'Kribi' }, admin);
  const phId = placeholder.body.orphanage ? placeholder.body.orphanage.id : (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'No Login Home ' + stamp).id;
  await call('/orphanages/' + phId, 'PUT', { status: 'verified', registrationNumber: 'NL-' + stamp, termsAgreed: true }, admin);
  await sleep(1500);
  check('7 a home an admin added (no login) gets no email', !mails.some((m2) => toOf(m2).some((a) => a.endsWith('.invalid'))));

  console.log('--- PLEDGES');
  const need = (await call('/my-orphanage/needs', 'POST', { title: 'Beds ' + stamp, goal: 80000 }, home.token)).body.need;
  let r = await call('/pledges', 'POST', { needId: need.id, amount: 7000 }, donor.token);
  const ref = r.body.pledge.reference;
  m = await mailTo(email('nh'), /New pledge/);
  check('8 the home hears about a new pledge: who, how much, the reference', Boolean(m) && m.subject === 'New pledge ' + ref + ': 7,000 XAF' && m.text.includes('Nadia Donor pledged 7,000 XAF for "Beds ' + stamp + '"') && m.text.includes('Mark as received'), m && m.subject);
  r = await call('/pledges', 'POST', { needId: need.id, amount: 3000, anonymous: true }, quiet.token);
  m = await mailTo(email('nh'), /New pledge/);
  check('9 an anonymous pledge stays anonymous in the email', Boolean(m) && m.text.includes('A donor who chose to stay anonymous') && !m.text.includes('Quentin') && !m.text.includes(email('nq')));
  await call('/my-orphanage/pledges/' + ref.slice(4) + '/received', 'POST', { received: true }, home.token);
  m = await mailTo(email('nd'), /received your gift/);
  check('10 the donor hears when the home has received the gift', Boolean(m) && m.text.includes('has confirmed it received your gift of 7,000 XAF') && m.text.includes(ref));
  const count = mails.length;
  await call('/my-orphanage/pledges/' + ref.slice(4) + '/received', 'POST', { received: false }, home.token);
  await sleep(1200);
  check('11 "undo" sends nothing', mails.length === count);

  console.log('--- VISITS');
  const date = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  r = await call('/visits', 'POST', { orphanageId: oid, preferredDate: date, visitorsCount: 3, message: 'We would love to meet the children.' }, donor.token);
  m = await mailTo(email('nh'), /New visit request/);
  check('12 the home hears about a visit request (date, number of visitors)', Boolean(m) && m.text.includes('Nadia Donor would like to visit') && m.text.includes('with 3 visitors'));
  check('13 ... without the visitor\'s email address', Boolean(m) && !m.text.includes(email('nd')) && !(m.html || '').includes(email('nd')));
  const visitId = (await call('/my-orphanage/visits', 'GET', null, home.token)).body.visits.find((v) => v.preferredDate === date).id;
  await call('/my-orphanage/visits/' + visitId + '/respond', 'POST', { decision: 'approved', note: 'Come at 10 in the morning.' }, home.token);
  m = await mailTo(email('nd'), /is approved/);
  check('14 the visitor hears the answer', Boolean(m) && m.subject === 'Your visit to Notify Home ' + stamp + ' is approved' && m.text.includes('Come at 10 in the morning.'));

  console.log('--- EVERY EMAIL');
  check('15 each email has a plain-text and an HTML version, with the site address', mails.every((x) => x.text && x.html && x.text.includes(SITE)), mails.length + ' emails');
  check('16 the HTML version escapes what people typed', mails.every((x) => !/<script/i.test(x.html)));

  smtp.close();
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
