// The donor's full orphanage profile: GET /api/browse/orphanages/:id
const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(70), (ok ? 'ok' : 'FAIL') + (detail ? '  ' + detail : '')); if (!ok) failures++; };

async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]).toString('base64');

(async () => {
  const stamp = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const PHONE = '+237 677 000 ' + String(stamp).slice(-3);
  const EMAIL = 'secret-contact-' + stamp + '@example.com';
  const ACCOUNT = '67' + String(stamp).slice(-7);
  const HOLDER = 'Account Holder ' + stamp;

  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const mk = async (name, role) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name + ' ' + stamp, email: name.replace(/ /g, '').toLowerCase() + stamp + '@example.com', password: 'secret1', role })).body;

  // a verified home with a full profile
  const home = await mk('Profile Home', 'volunteer');
  const draft = await mk('Draft Profile Home', 'volunteer');
  let r = await call('/my-orphanage', 'PUT', {
    location: 'Bamenda, North-West', registrationNumber: 'RG-' + stamp, foundedYear: 2009, capacity: 40, childrenCount: 26,
    contactName: 'Mrs Ngum Test', contactPhone: PHONE, contactEmail: EMAIL,
    story: 'Nous avons commencé en 2009 avec six enfants.\n\nToday we care for 26 children.', storyLanguage: 'fr',
    paymentProvider: 'MTN Mobile Money', paymentAccountName: HOLDER, paymentAccountNumber: ACCOUNT, termsAgreed: true,
  }, home.token);
  check('setup: the home fills in its profile', r.status === 200, r.body.error);
  check('setup: profile photo', (await call('/my-orphanage/photo', 'POST', { filename: 'home.png', data: png }, home.token)).status === 201);
  check('setup: cover photo', (await call('/my-orphanage/cover', 'POST', { filename: 'cover.png', data: png }, home.token)).status === 201);
  const list = (await call('/orphanages', 'GET', null, admin)).body.orphanages;
  const oid = list.find((o) => o.name === 'Profile Home ' + stamp).id;
  const draftId = list.find((o) => o.name === 'Draft Profile Home ' + stamp).id;
  r = await call('/orphanages/' + oid, 'PUT', { status: 'verified', paymentAccountConfirmed: true }, admin);
  check('setup: the admin verifies it and confirms the payment account', r.status === 200 && r.body.orphanage ? true : r.status === 200, r.status + ' ' + (r.body.error || ''));

  const needA = (await call('/my-orphanage/needs', 'POST', { title: 'School fees ' + stamp, description: 'Fees for the new term', goal: 100000 }, home.token)).body.need;
  const needB = (await call('/my-orphanage/needs', 'POST', { title: 'Mattresses ' + stamp, goal: 20000 }, home.token)).body.need;
  const needC = (await call('/my-orphanage/needs', 'POST', { title: 'Water tank ' + stamp, goal: 50000 }, home.token)).body.need;

  const donor1 = await mk('Profile Donor One', 'user');
  const donor2 = await mk('Profile Donor Two', 'user');
  const pending = await mk('Profile Pending Donor', 'user');
  await call('/donors/' + donor1.user.id, 'PUT', { status: 'active' }, admin);
  await call('/donors/' + donor2.user.id, 'PUT', { status: 'active' }, admin);
  check('setup: pledges', (await call('/pledges', 'POST', { needId: needB.id, amount: 20000 }, donor1.token)).status === 201 &&
    (await call('/pledges', 'POST', { needId: needA.id, amount: 5000 }, donor1.token)).status === 201 &&
    (await call('/pledges', 'POST', { needId: needA.id, amount: 10000, anonymous: true }, donor2.token)).status === 201);

  const partner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Profile Partner ' + stamp, email: 'prp' + stamp + '@example.com', password: 'secret1' })).body;
  const prow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Profile Partner ' + stamp);
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  r = await call('/partner-auth/donations', 'POST', { type: 'item', orphanageId: oid, itemDescription: '20 mattresses', quantity: '20' }, partner.token);
  check('setup: a partner gives items', r.status === 201, r.body.error);

  const p1 = (await call('/my-orphanage/posts', 'POST', { type: 'gift', title: 'Thank you', text: 'Thank you for the mattresses.' }, home.token)).body.post;
  const p2 = (await call('/my-orphanage/posts', 'POST', { type: 'update', text: 'School starts Monday.' }, home.token)).body.post;
  check('setup: two posts', Boolean(p1 && p2));

  console.log('--- WHAT A DONOR SEES');
  r = await call('/browse/orphanages/' + oid, 'GET', null, donor1.token);
  const o = r.body.orphanage || {};
  check('1 an approved donor opens the profile', r.status === 200, r.status + ' ' + (r.body.error || ''));
  check('2 name, place, story (paragraphs kept) and its language', o.name === 'Profile Home ' + stamp && o.location === 'Bamenda, North-West' && /\n\nToday we care/.test(o.story) && o.storyLanguage === 'fr');
  check('3 children in care, capacity, year founded', o.childrenCount === 26 && o.capacity === 40 && o.foundedYear === 2009);
  check('4 contact person and registration number', o.contactName === 'Mrs Ngum Test' && o.registrationNumber === 'RG-' + stamp);
  check('5 profile and cover photos', /^\/api\/files\/photo\/[0-9a-f]{32}$/.test(o.photoUrl) && /^\/api\/files\/photo\/[0-9a-f]{32}$/.test(o.coverPhotoUrl));
  check('6 verified today, joined today', o.verifiedDate === today && o.joinedDate === today, o.verifiedDate + ' / ' + o.joinedDate);
  check('7 payment account shown only as "checked by the team"', o.paymentAccountChecked === true);
  check('8 number of stories and updates', o.updatesCount === 2, String(o.updatesCount));
  const openTitles = (r.body.needs || []).map((n) => n.title);
  check('9 open needs: the two not yet fully pledged', openTitles.length === 2 && openTitles.includes(needA.title) && openTitles.includes(needC.title), openTitles.join(', '));
  const a = (r.body.needs || []).find((n) => n.id === needA.id) || {};
  check('10 a need shows its progress and description', a.raised === 15000 && a.goal === 100000 && a.percent === 15 && a.description === 'Fees for the new term');
  check('11 fully pledged needs are listed apart', (r.body.metNeeds || []).length === 1 && r.body.metNeeds[0].id === needB.id);
  const rec = r.body.record || {};
  check('12 record: 35,000 XAF pledged, 3 supporters, 1 gift of items', rec.totalPledged === 35000 && rec.supporters === 3 && rec.itemGifts === 1, JSON.stringify(rec));

  console.log('--- WHAT IT NEVER SENDS');
  const raw = JSON.stringify(r.body);
  check('13 no phone number', !raw.includes(PHONE));
  check('14 no contact email', !raw.includes(EMAIL));
  check('15 no payment account number or holder', !raw.includes(ACCOUNT) && !raw.includes(HOLDER));
  const banned = ['contactPhone', 'contactEmail', 'paymentAccountNumber', 'paymentAccountName', 'paymentProvider', 'documents', 'activityLog', 'adminNotes', 'flagReason', 'flagged', 'ownerUserId', 'rejectionReason', 'infoRequestMessage', 'giverUserId'];
  check('16 no private fields at all', banned.every((k) => !raw.includes('"' + k + '"')), banned.filter((k) => raw.includes('"' + k + '"')).join(', '));
  check('17 no donor names', !raw.includes('Profile Donor One') && !raw.includes('Profile Donor Two'));

  console.log('--- WHO MAY SEE IT');
  r = await call('/browse/orphanages/' + oid);
  check('18 nobody signed in: 401 sign-in', r.status === 401 && r.body.code === 'sign-in');
  r = await call('/browse/orphanages/' + oid, 'GET', null, pending.token);
  check('19 a donor waiting for approval: 403 pending', r.status === 403 && r.body.code === 'pending', r.status + ' ' + r.body.code);
  r = await call('/browse/orphanages/' + oid, 'GET', null, home.token);
  check('20 an orphanage account: 403 donors-only', r.status === 403 && r.body.code === 'donors-only', r.status + ' ' + r.body.code);
  r = await call('/browse/orphanages/' + oid, 'GET', null, partner.token);
  check('21 a partner token is not a donor token', r.status === 401 || r.status === 403, String(r.status));
  check('22 a home that is not verified: 404', (await call('/browse/orphanages/' + draftId, 'GET', null, donor1.token)).status === 404);
  for (const bad of ['abc', '-1', '1.5', '0', '99999999', '1%20OR%201=1']) {
    const res = await call('/browse/orphanages/' + bad, 'GET', null, donor1.token);
    check('23 a bad id (' + bad + ') is simply not found', res.status === 404, String(res.status));
  }
  check('24 the same for the updates of a bad id', (await call('/browse/orphanages/abc/updates', 'GET', null, donor1.token)).status === 404);

  console.log('--- IT STAYS UP TO DATE');
  await call('/orphanages/' + oid, 'PUT', { posts: [{ id: p1.id }] }, admin);
  r = await call('/browse/orphanages/' + oid, 'GET', null, donor1.token);
  check('25 a post removed by an admin is no longer counted', r.body.orphanage.updatesCount === 1, String(r.body.orphanage.updatesCount));
  await call('/pledges', 'POST', { needId: needC.id, amount: 50000 }, donor2.token);
  r = await call('/browse/orphanages/' + oid, 'GET', null, donor1.token);
  check('26 a need that becomes fully pledged moves to the met list', r.body.needs.length === 1 && r.body.metNeeds.length === 2 && r.body.record.totalPledged === 85000 && r.body.record.supporters === 3, JSON.stringify(r.body.record));
  await call('/orphanages/' + oid, 'PUT', { status: 'needs-info', infoRequestMessage: 'Please send a new certificate.' }, admin);
  check('27 once a home is no longer verified, its profile is closed', (await call('/browse/orphanages/' + oid, 'GET', null, donor1.token)).status === 404);
  await call('/orphanages/' + oid, 'PUT', { status: 'verified' }, admin);
  r = await call('/browse/orphanages/' + oid, 'GET', null, donor1.token);
  check('28 verified again: open again, with the new verified date', r.status === 200 && r.body.orphanage.verifiedDate === today);

  r = await call('/browse/orphanages', 'GET', null, donor1.token);
  check('29 the list of orphanages still works', r.status === 200 && r.body.orphanages.some((h) => h.id === oid));

  console.log('--- PARTNERS SEE THE SAME PROFILE');
  const draftPartner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Draft Profile Partner ' + stamp, email: 'dpp' + stamp + '@example.com', password: 'secret1' })).body;
  const forDonor = await call('/browse/orphanages/' + oid, 'GET', null, donor1.token);
  r = await call('/partner-auth/orphanages/' + oid, 'GET', null, partner.token);
  check('30 a verified partner gets exactly what a donor gets', r.status === 200 && JSON.stringify(r.body) === JSON.stringify(forDonor.body), r.status + ' ' + (r.body.error || ''));
  check('31 ... the full profile: facts, checks, record, needs', r.body.orphanage && r.body.orphanage.registrationNumber === 'RG-' + stamp && r.body.orphanage.contactName === 'Mrs Ngum Test' && r.body.record.totalPledged === 85000 && r.body.needs.length === 1 && r.body.metNeeds.length === 2);
  const praw = JSON.stringify(r.body);
  check('32 ... and nothing private', !praw.includes(PHONE) && !praw.includes(EMAIL) && !praw.includes(ACCOUNT) && !praw.includes(HOLDER) && banned.every((k) => !praw.includes('"' + k + '"')));
  check('33 a partner waiting for verification is refused', (await call('/partner-auth/orphanages/' + oid, 'GET', null, draftPartner.token)).status === 403);
  check('34 a donor token cannot use the partner route', (await call('/partner-auth/orphanages/' + oid, 'GET', null, donor1.token)).status === 401);
  check('35 a home that is not verified: 404 for partners too', (await call('/partner-auth/orphanages/' + draftId, 'GET', null, partner.token)).status === 404);
  for (const bad of ['abc', '0', '1.5', '99999999']) {
    const res = await call('/partner-auth/orphanages/' + bad, 'GET', null, partner.token);
    const upd = await call('/partner-auth/orphanages/' + bad + '/updates', 'GET', null, partner.token);
    check('36 partner: a bad id (' + bad + ') is not found, profile and updates', res.status === 404 && upd.status === 404, res.status + ' / ' + upd.status);
  }
  const browse = (await call('/partner-auth/orphanages', 'GET', null, partner.token)).body.orphanages.find((h) => h.id === oid);
  check('37 Browse list: "active needs" counts only needs still open', browse.needsCount === 1, String(browse.needsCount));
  check('38 the updates still work for partners', (await call('/partner-auth/orphanages/' + oid + '/updates', 'GET', null, partner.token)).body.posts.length === 1);

  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
