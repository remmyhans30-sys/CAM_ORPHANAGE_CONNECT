const A = 'http://127.0.0.2:4555/api';
const out = (l, v) => console.log(l.padEnd(56), v);
async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const brief = (r) => r.status + (r.body.code ? ' [' + r.body.code + ']' : '') + (r.body.orphanages ? ' ' + r.body.orphanages.length + ' orphanage(s)' : '');

(async () => {
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body;
  const A_ = admin.token;

  // an approved orphanage with a need, so there is something to browse
  const orph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Gate Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const need = (await call('/my-orphanage/needs', 'POST', { title: 'Mattresses', description: 'x', goal: 50000 }, orph.token)).body.need;
  const oid = (await call('/orphanages', 'GET', null, A_)).body.orphanages.find((o) => o.name === 'Gate Home ' + stamp).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }, A_);

  console.log('--- DONORS');
  out('1 visitor (no login) browses:', brief(await call('/browse/orphanages')));
  const donor = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'New Donor', email: 'd' + stamp + '@example.com', password: 'secret1', role: 'user' })).body;
  const mine = async () => (await call('/donors', 'GET', null, A_)).body.donors.find((d) => d.email === 'd' + stamp + '@example.com');
  out('2 new donor status in admin:', (await mine()).status);
  const r = await call('/browse/orphanages', 'GET', null, donor.token);
  out('3 pending donor browses:', brief(r) + ' | ' + r.body.error.slice(0, 50) + '...');
  out('4 pending donor pledges:', brief(await call('/pledges', 'POST', { needId: need.id, amount: 1000 }, donor.token)));
  out('5 orphanage account browses donor list:', brief(await call('/browse/orphanages', 'GET', null, orph.token)));
  out('6 old public address is gone:', (await call('/public/orphanages')).status);
  out('7 donor profile shows pending status:', (await call('/my-donor', 'GET', null, donor.token)).body.donor.status);

  const d = await mine();
  await call('/donors/' + d.id, 'PUT', { status: 'active' }, A_);
  out('8 admin approves -> donor browses:', brief(await call('/browse/orphanages', 'GET', null, donor.token)));
  out('9 approved donor pledges 2,000:', brief(await call('/pledges', 'POST', { needId: need.id, amount: 2000 }, donor.token)));
  await call('/donors/' + d.id, 'PUT', { status: 'flagged', flagReason: 'Suspicious activity' }, A_);
  out('10 flagged donor browses:', brief(await call('/browse/orphanages', 'GET', null, donor.token)));
  await call('/donors/' + d.id, 'PUT', { status: 'rejected', flagReason: 'Could not verify identity' }, A_);
  const rej = await call('/browse/orphanages', 'GET', null, donor.token);
  out('11 rejected donor browses:', brief(rej) + ' | ' + rej.body.error.slice(0, 40) + '...');
  out('12 rejected donor profile reason:', (await call('/my-donor', 'GET', null, donor.token)).body.donor.statusReason);

  console.log('--- PARTNERS');
  const pEmail = 'p' + stamp + '@example.com';
  const partner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Gate Partner ' + stamp, email: pEmail, password: 'secret1' })).body;
  const P = partner.token;
  const partnerRow = async () => (await call('/partners', 'GET', null, A_)).body.partners.find((p) => p.email === pEmail);
  const tryAll = async () => {
    const results = [];
    results.push('list ' + (await call('/partner-auth/orphanages', 'GET', null, P)).status);
    results.push('one ' + (await call('/partner-auth/orphanages/' + oid, 'GET', null, P)).status);
    results.push('favorite ' + (await call('/partner-auth/orphanages/' + oid + '/favorite', 'POST', {}, P)).status);
    results.push('thread ' + (await call('/partner-auth/orphanages/' + oid + '/messages', 'GET', null, P)).status);
    results.push('donate ' + (await call('/partner-auth/donations', 'POST', { orphanageId: oid, amount: 1000 }, P)).status);
    return results.join(', ');
  };
  out('13 draft partner:', await tryAll());
  const pr = await call('/partner-auth/orphanages', 'GET', null, P);
  out('14 message shown to them:', pr.body.code + ' | ' + pr.body.error.slice(0, 48) + '...');
  out('15 partner can still open own profile / messages:', (await call('/partner-auth/me', 'GET', null, P)).status + ' / ' + (await call('/partner-auth/messages', 'GET', null, P)).status);
  const row = await partnerRow();
  for (const st of ['pending', 'needs-info', 'rejected']) {
    await call('/partners/' + row.id, 'PUT', { verificationStatus: st }, A_);
    out('16 partner ' + st.padEnd(11) + ':', (await call('/partner-auth/orphanages', 'GET', null, P)).status);
  }
  await call('/partners/' + row.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, A_);
  const ok = await call('/partner-auth/orphanages', 'GET', null, P);
  out('17 verified partner browses:', ok.status + ' ' + (ok.body.orphanages ? ok.body.orphanages.length + ' orphanage(s)' : JSON.stringify(ok.body)));
  out('18 verified partner opens one:', (await call('/partner-auth/orphanages/' + oid, 'GET', null, P)).status);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
