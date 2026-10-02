// Ten approved donors pledge 40,000 each to a 100,000 need at the same moment.
// At most two can fit (80,000); the need must never be over-filled.
const A = 'http://127.0.0.2:4555/api';
async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
(async () => {
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const orph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Race Home ' + stamp, email: 'rh' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const need = (await call('/my-orphanage/needs', 'POST', { title: 'Roof', description: 'x', goal: 100000 }, orph.token)).body.need;
  const oid = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'Race Home ' + stamp).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'RACE-' + stamp, termsAgreed: true }, admin);

  const donors = [];
  for (let i = 0; i < 10; i++) {
    const d = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Racer ' + i + ' ' + stamp, email: 'r' + i + '_' + stamp + '@example.com', password: 'secret1', role: 'user' })).body;
    await call('/donors/' + d.user.id, 'PUT', { status: 'active' }, admin);
    donors.push(d.token);
  }
  const results = await Promise.all(donors.map((t) => call('/pledges', 'POST', { needId: need.id, amount: 40000 }, t)));
  const ok = results.filter((r) => r.status === 201).length;
  const refused = results.filter((r) => r.status === 400).map((r) => r.body.error);
  const final = (await call('/needs/' + need.id, 'GET', null, admin)).body.need;
  console.log('accepted:', ok, '| refused:', refused.length, '| need raised:', final.raised, 'of', final.goal);
  console.log('first refusal:', refused[0]);
  const pass = ok === 2 && final.raised === 80000 && refused.length === 8;
  console.log(pass ? 'PASS: never over-filled' : 'FAIL');
  process.exit(pass ? 0 : 1);
})();
