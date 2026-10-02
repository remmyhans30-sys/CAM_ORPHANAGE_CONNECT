const A = 'http://127.0.0.2:4555/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(66), (ok ? 'ok' : 'FAIL') + (detail ? '  ' + detail : '')); if (!ok) failures++; };
async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const orph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Visit Home ' + stamp, email: 'vh' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const draftOrph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Draft Visit Home ' + stamp, email: 'dv' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const oid = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'Visit Home ' + stamp).id;
  const did = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === 'Draft Visit Home ' + stamp).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'V-' + stamp, termsAgreed: true }, admin);

  const mkDonor = async (n, approve) => {
    const d = (await call('/users/register', 'POST', { acceptTerms: true, fullname: n + ' ' + stamp, email: n.toLowerCase() + stamp + '@example.com', password: 'secret1', role: 'user' })).body;
    if (approve) await call('/donors/' + d.user.id, 'PUT', { status: 'active' }, admin);
    return d;
  };
  const amara = await mkDonor('Amara', true);
  const pending = await mkDonor('Pending', false);
  const partner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Visit Partner ' + stamp, email: 'vp' + stamp + '@example.com', password: 'secret1' })).body;
  const prow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Visit Partner ' + stamp);
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  const draftPartner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Draft Visit Partner ' + stamp, email: 'dp' + stamp + '@example.com', password: 'secret1' })).body;

  const body = (over) => Object.assign({ orphanageId: oid, preferredDate: day(10), visitorsCount: 3, message: 'We would like to meet the children and staff.' }, over || {});

  console.log('--- WHO MAY ASK');
  check('1 no login is refused', (await call('/visits', 'POST', body())).status === 401);
  let r = await call('/visits', 'POST', body(), pending.token);
  check('2 pending donor is refused', r.status === 403 && r.body.code === 'pending', r.status);
  r = await call('/visits', 'POST', body(), draftPartner.token);
  check('3 unverified partner is refused', r.status === 403, r.status);
  r = await call('/visits', 'POST', body(), orph.token);
  check('4 an orphanage cannot request visits', r.status === 403, r.status);

  console.log('--- REQUESTING');
  r = await call('/visits', 'POST', body(), amara.token);
  check('5 approved donor requests a visit', r.status === 201 && r.body.visits.length === 1 && r.body.visits[0].status === 'pending' && r.body.visits[0].orphanageName === 'Visit Home ' + stamp, r.status + ' ' + (r.body.error || ''));
  check('6 donor sees no email field of their own list', r.body.visits[0].requesterEmail === undefined);
  check('7 unverified orphanage cannot be visited', (await call('/visits', 'POST', body({ orphanageId: did }), amara.token)).status === 404);
  check('8 past date refused', (await call('/visits', 'POST', body({ preferredDate: day(-2) }), amara.token)).status === 400);
  check('9 today refused (needs at least tomorrow)', (await call('/visits', 'POST', body({ preferredDate: day(0) }), amara.token)).status === 400);
  check('10 more than a year ahead refused', (await call('/visits', 'POST', body({ preferredDate: day(400) }), amara.token)).status === 400);
  check('11 bad date text refused', (await call('/visits', 'POST', body({ preferredDate: 'next friday' }), amara.token)).status === 400);
  check('12 zero / 21 visitors refused', (await call('/visits', 'POST', body({ visitorsCount: 0 }), amara.token)).status === 400 && (await call('/visits', 'POST', body({ visitorsCount: 21 }), amara.token)).status === 400);
  check('13 over-long message refused', (await call('/visits', 'POST', body({ message: 'x'.repeat(1001) }), amara.token)).status === 400);
  r = await call('/visits', 'POST', body({ preferredDate: day(12) }), amara.token);
  check('14 second waiting request to the same home allowed', r.status === 201 && r.body.visits.length === 2);
  r = await call('/visits', 'POST', body({ preferredDate: day(14) }), amara.token);
  check('15 third waiting request to the same home refused', r.status === 400, r.body.error);
  r = await call('/visits', 'POST', body({ preferredDate: day(20), message: '' }), partner.token);
  check('16 verified partner requests a visit (no message needed)', r.status === 201 && r.body.visits.length === 1, r.status + ' ' + (r.body.error || ''));

  console.log('--- THE ORPHANAGE ANSWERS');
  r = await call('/my-orphanage/visits', 'GET', null, orph.token);
  check('17 orphanage inbox has the 3 requests (names, no emails yet)', r.body.visits.length === 3 && r.body.visits.every((v) => v.requesterEmail === undefined && v.requesterName), r.body.visits.map((v) => v.requesterName.replace(' ' + stamp, '')).join(', '));
  const forAmara = r.body.visits.filter((v) => v.requesterName === 'Amara ' + stamp);
  const forPartner = r.body.visits.find((v) => v.requesterType === 'partner');
  check('18 partner request is labelled as a partner', forPartner && forPartner.requesterType === 'partner');
  const other = await call('/my-orphanage/visits', 'GET', null, draftOrph.token);
  check('19 another orphanage sees none of them', other.body.visits.length === 0);
  r = await call('/my-orphanage/visits/' + forAmara[0].id + '/respond', 'POST', { decision: 'declined' }, orph.token);
  check('20 declining without a reason is refused', r.status === 400, r.body.error);
  r = await call('/my-orphanage/visits/' + forAmara[0].id + '/respond', 'POST', { decision: 'maybe', note: 'x' }, orph.token);
  check('21 unknown decision refused', r.status === 400);
  r = await call('/my-orphanage/visits/' + forAmara[0].id + '/respond', 'POST', { decision: 'approved', note: 'Please come after 2pm and ask for the director.' }, orph.token);
  const approved = r.body.visits.find((v) => v.id === forAmara[0].id);
  check('22 approving shares the visitor email with the home', r.status === 200 && approved.status === 'approved' && approved.requesterEmail === 'amara' + stamp + '@example.com', r.status + ' ' + (approved && approved.requesterEmail));
  r = await call('/my-orphanage/visits/' + forAmara[0].id + '/respond', 'POST', { decision: 'declined', note: 'changed my mind' }, orph.token);
  check('23 an answered request cannot be answered again', r.status === 400);
  r = await call('/my-orphanage/visits/' + forAmara[1].id + '/respond', 'POST', { decision: 'declined', note: 'We are closed for exams that week.' }, orph.token);
  check('24 decline with a reason', r.status === 200 && r.body.visits.find((v) => v.id === forAmara[1].id).status === 'declined');
  r = await call('/my-orphanage/visits/' + forPartner.id + '/respond', 'POST', { decision: 'approved' }, draftOrph.token);
  check('25 another (unverified) orphanage cannot answer my requests', r.status === 403 || r.status === 404, r.status);
  r = await call('/my-orphanage/visits/' + forPartner.id + '/respond', 'POST', { decision: 'approved' }, amara.token);
  check('26 a donor cannot answer requests', r.status === 403, r.status);

  console.log('--- THE REQUESTER SEES THE ANSWER');
  r = await call('/visits/mine', 'GET', null, amara.token);
  const mine = r.body.visits;
  check('27 donor sees approved + declined with the home notes', mine.length === 2 && mine.some((v) => v.status === 'approved' && /2pm/.test(v.responseNote)) && mine.some((v) => v.status === 'declined' && /exams/.test(v.responseNote)), mine.map((v) => v.status).join(', '));
  check('28 donor cannot cancel an answered request', (await call('/visits/' + mine[0].id + '/cancel', 'POST', {}, amara.token)).status === 400);
  check('29 nobody can cancel someone else\'s request', (await call('/visits/' + forPartner.id + '/cancel', 'POST', {}, amara.token)).status === 404);
  r = await call('/visits/' + forPartner.id + '/cancel', 'POST', {}, partner.token);
  check('30 partner cancels a waiting request', r.status === 200 && r.body.visits[0].status === 'cancelled');
  r = await call('/visits', 'POST', body({ preferredDate: day(30) }), amara.token);
  check('31 after answers, donor can ask again', r.status === 201);

  console.log('--- ADMIN');
  r = await call('/visit-requests', 'GET', null, admin);
  check('32 admin sees every request with emails', r.status === 200 && r.body.visits.length >= 4 && r.body.visits.every((v) => v.requesterEmail), r.body.visits.length + ' requests');
  check('33 admin list needs an admin login', (await call('/visit-requests', 'GET', null, amara.token)).status === 401);

  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
