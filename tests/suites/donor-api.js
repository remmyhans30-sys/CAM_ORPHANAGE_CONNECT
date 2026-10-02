const A = 'http://127.0.0.2:4555/api';
const out = (l, v) => console.log(l.padEnd(50), v);
async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
(async () => {
  const stamp = Date.now();
  const donor = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Amara Ndongo', email: 'd' + stamp + '@example.com', password: 'secret1', role: 'user' })).body;
  const orph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Pledge Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body;

  let r = await call('/donors', 'GET', null, admin.token);
  const mine = r.body.donors.find((d) => d.email === 'd' + stamp + '@example.com');
  out('1 admin Donors list has the new donor:', mine ? mine.name + ' | status ' + mine.status + ' | joined ' + mine.joinDate : 'NOT FOUND');
  out('2 orphanage sign-up did not create a donor:', r.body.donors.filter((d) => d.email === 'o' + stamp + '@example.com').length);

  r = await call('/my-donor', 'GET', null, donor.token);
  out('3 donor profile loads:', r.status + ' ' + r.body.donor.email);
  out('4 orphanage token blocked:', (await call('/my-donor', 'GET', null, orph.token)).status);
  r = await call('/my-donor', 'PUT', { location: 'Douala', preferredPayment: 'MTN Mobile Money', preferredCurrency: 'XAF', referredBy: 'A friend', name: 'Amara N. Ndongo' }, donor.token);
  out('5 save profile:', r.status + ' ' + JSON.stringify([r.body.donor.name, r.body.donor.location, r.body.donor.preferredPayment, r.body.donor.preferredCurrency]));
  out('6 bad payment method rejected:', (await call('/my-donor', 'PUT', { preferredPayment: 'Bitcoin' }, donor.token)).body.error);
  out('7 bad currency rejected:', (await call('/my-donor', 'PUT', { preferredCurrency: 'JPY' }, donor.token)).body.error);

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]).toString('base64');
  r = await call('/my-donor/photo', 'POST', { filename: 'me.png', data: png }, donor.token);
  out('8 photo upload:', r.status + ' ' + r.body.donor.photoUrl);

  await call('/donors/' + mine.id, 'PUT', { status: 'active' }, admin.token);

  // make an orphanage with a need, verified
  await call('/my-orphanage', 'PUT', { location: 'Buea' }, orph.token);
  const need = (await call('/my-orphanage/needs', 'POST', { title: 'Blankets', description: 'x', goal: 30000 }, orph.token)).body.need;
  const oid = (await call('/orphanages', 'GET', null, admin.token)).body.orphanages.find((o) => o.name === 'Pledge Home ' + stamp).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }, admin.token);
  r = await call('/pledges', 'POST', { needId: need.id, amount: 5000 }, donor.token);
  out('9 pledge 5,000:', r.status + ' raised ' + r.body.need.raised);
  await call('/pledges', 'POST', { needId: need.id, amount: 2500 }, donor.token);

  r = await call('/donors', 'GET', null, admin.token);
  const d = r.body.donors.find((x) => x.email === 'd' + stamp + '@example.com');
  out('10 admin donor: total / count:', d.totalGiven + ' / ' + d.donationsCount);
  out('11 admin donor: photo, location, payment:', [d.photoUrl && d.photoUrl.slice(0, 18), d.location, d.preferredPayment].join(' | '));
  out('12 admin donations list entries:', d.donations.map((x) => x.amount + ' ' + x.status + ' ' + x.method + ' -> ' + x.orphanage + ' / ' + x.need).join(' ; '));
  out('13 donor sees own pledges:', (await call('/pledges/mine', 'GET', null, donor.token)).body.pledges.length);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
