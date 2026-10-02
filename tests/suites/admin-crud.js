// Admin panel round trips: load each record the way the pages do, change it, send the whole
// object back (as the pages do) and check what the server stores.
const A = 'http://127.0.0.2:4555/api';
const out = (label, value) => console.log(label.padEnd(58), value);
let failures = 0;
const check = (label, ok, detail) => { out(label, (ok ? 'ok' : 'FAIL') + (detail ? '  ' + detail : '')); if (!ok) failures++; };

async function call(path, method, body, token) {
  const res = await fetch(A + path, {
    method: method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const T = admin;

  console.log('--- ORPHANAGES');
  let r = await call('/orphanages', 'POST', { name: 'Admin Home ' + stamp, location: 'Limbe, Southwest', contactEmail: 'ah' + stamp + '@example.org', childrenCount: 12, story: 'Hello', storyLanguage: 'en' }, T);
  check('1 admin creates an orphanage', r.status === 201 && r.body.orphanage.status === 'draft', r.status + ' ' + r.body.orphanage.location);
  const o = r.body.orphanage;
  r = await call('/orphanages/' + o.id, 'GET', null, T);
  const loaded = r.body.orphanage;
  r = await call('/orphanages/' + o.id, 'PUT', loaded, T);
  check('2 whole object sent back unchanged is accepted', r.status === 200, r.status);
  const { activityLog: _a, ...before } = loaded; const { activityLog: _b, ...after } = r.body.orphanage;
  check('3 ... and nothing changed', same(before, after));

  loaded.activityLog.push({ reviewer: 'owner@cam-test.org', action: 'Requested information', timestamp: new Date().toISOString() });
  loaded.status = 'needs-info'; loaded.infoRequestMessage = 'Please add the director ID';
  r = await call('/orphanages/' + o.id, 'PUT', loaded, T);
  check('4 needs-info with message and log line', r.body.orphanage.status === 'needs-info' && r.body.orphanage.infoRequestMessage === 'Please add the director ID' && r.body.orphanage.activityLog.length === 1 && r.body.orphanage.activityLog[0].action === 'Requested information', r.body.orphanage.activityLog.length + ' log lines');

  r = await call('/orphanages/' + o.id, 'PUT', { status: 'verified' }, T);
  check('5 verifying without registration number / terms is refused', r.status === 400, r.body.error);
  r = await call('/orphanages/' + o.id, 'PUT', { status: 'verified', registrationNumber: 'REG-' + stamp, termsAgreed: true, paymentProvider: 'MTN Mobile Money', paymentAccountName: 'Admin Home', paymentAccountNumber: '670000000', paymentAccountConfirmed: true, flagged: false }, T);
  const v = r.body.orphanage;
  check('6 verified with details + payment account', r.status === 200 && v.status === 'verified' && v.paymentAccountConfirmed && v.paymentProvider === 'MTN Mobile Money' && v.termsAgreed, r.status + ' ' + (r.body.error || ''));
  r = await call('/orphanages/' + o.id, 'PUT', { paymentProvider: 'Cash at the office' }, T);
  check('7 free-text payment provider is kept', r.body.orphanage.paymentProvider === 'Cash at the office', r.body.orphanage.paymentProvider);
  r = await call('/orphanages/' + o.id, 'PUT', { flagged: true, flagReason: 'Checking details', appealMessage: 'Please reconsider', appealDate: '2026-10-01' }, T);
  check('8 flag + appeal saved', r.body.orphanage.flagged && r.body.orphanage.flagReason === 'Checking details' && r.body.orphanage.appealMessage === 'Please reconsider', r.body.orphanage.appealDate);
  r = await call('/orphanages/' + o.id, 'PUT', { flagged: false, appealMessage: '' }, T);
  check('9 unflag + appeal cleared', !r.body.orphanage.flagged && !r.body.orphanage.appealMessage);
  r = await call('/orphanages', 'POST', { name: 'Dup ' + stamp }, T);
  r = await call('/orphanages/' + r.body.orphanage.id, 'PUT', { registrationNumber: 'REG-' + stamp }, T);
  check('10 duplicate registration number refused', r.status === 409, r.body.error);

  console.log('--- NEEDS');
  r = await call('/needs', 'POST', { orphanageId: o.id, title: 'Mattresses', goal: 100000, date: '2026-09-01' }, T);
  check('11 admin adds a need', r.status === 201 && r.body.need.goal === 100000 && r.body.need.date === '2026-09-01' && r.body.need.raised === 0, JSON.stringify(r.body.need));
  const need = r.body.need;
  check('12 need for a missing orphanage refused', (await call('/needs', 'POST', { orphanageId: 999999, title: 'x', goal: 10 }, T)).status === 400);
  check('13 need with zero goal refused', (await call('/needs', 'POST', { orphanageId: o.id, title: 'x', goal: 0 }, T)).status === 400);
  r = await call('/needs/' + need.id, 'PUT', { ...need, title: 'Mattresses (20)', goal: 120000, raised: 99999999 }, T);
  check('14 edit title/goal; "raised" cannot be typed in', r.body.need.title === 'Mattresses (20)' && r.body.need.goal === 120000 && r.body.need.raised === 0, JSON.stringify(r.body.need));

  console.log('--- DONORS');
  r = await call('/donors', 'POST', { name: 'Manual Donor ' + stamp, email: 'md' + stamp + '@example.org', location: 'Douala', preferredPayment: 'Orange Money', preferredCurrency: 'EUR', status: 'active' }, T);
  check('15 admin adds a donor', r.status === 201 && r.body.donor.status === 'active' && r.body.donor.preferredPayment === 'Orange Money' && r.body.donor.preferredCurrency === 'EUR', r.status + ' ' + (r.body.error || ''));
  const donor = r.body.donor;
  donor.donations.push({ type: 'money', orphanage: o.id && v.name, need: 'Mattresses (20)', amount: 20000, method: 'MTN Mobile Money', date: '2026-09-15', status: 'completed' });
  donor.donations.push({ type: 'item', orphanage: v.name, need: '', amount: 15000, itemDescription: 'Blankets', quantity: '10', deliveryMethod: 'Hand delivery', date: '2026-09-16', status: 'completed' });
  donor.adminNotes = 'Gave twice'; donor.vip = true;
  donor.activityLog.push({ reviewer: 'owner@cam-test.org', action: 'Added 2 donations', timestamp: new Date().toISOString() });
  r = await call('/donors/' + donor.id, 'PUT', donor, T);
  const d2 = r.body.donor;
  check('16 manual donations logged', r.status === 200 && d2.donations.length === 2 && d2.donationsCount === 2 && d2.totalGiven === 20000, r.status + ' ' + (r.body.error || '') + ' total=' + (d2 && d2.totalGiven));
  check('17 item gift keeps description/quantity/delivery', d2.donations.some((x) => x.type === 'item' && x.itemDescription === 'Blankets' && x.quantity === '10' && x.deliveryMethod === 'Hand delivery'));
  check('18 notes, vip and log saved', d2.adminNotes === 'Gave twice' && d2.vip === true && d2.activityLog.length === 1, d2.activityLog.length + ' log lines');
  const n2 = (await call('/needs/' + need.id, 'GET', null, T)).body.need;
  check('19 the need now shows 20,000 raised (calculated)', n2.raised === 20000 && n2.percent === 17, n2.raised + ' / ' + n2.percent + '%');
  const refund = d2.donations.find((x) => x.type === 'money');
  refund.status = 'refunded';
  r = await call('/donors/' + donor.id, 'PUT', d2, T);
  check('20 refunded status saved; total drops', r.body.donor.chargebacksCount === 1 && r.body.donor.totalGiven === 0, r.body.donor.chargebacksCount + ' refunds, total ' + r.body.donor.totalGiven);
  r = await call('/donors/' + donor.id, 'PUT', { status: 'flagged', flagReason: 'Charge disputes' }, T);
  check('21 donor flagged with reason', r.body.donor.status === 'flagged' && r.body.donor.flagReason === 'Charge disputes');
  r = await call('/donors/' + donor.id, 'DELETE', null, T);
  check('22 donor with gifts cannot be deleted', r.status === 409, r.status + ' ' + (r.body.error || ''));
  r = await call('/donors', 'POST', { name: 'Gone ' + stamp }, T);
  check('23 donor without gifts can be deleted', (await call('/donors/' + r.body.donor.id, 'DELETE', null, T)).status === 204);

  console.log('--- PARTNERS');
  r = await call('/partners', 'POST', { name: 'Admin Partner ' + stamp, email: 'ap' + stamp + '@example.org', country: 'France', orgType: 'NGO', tier: 'Verified Referrer', contactName: 'Jean' }, T);
  check('24 admin adds a partner', r.status === 201 && r.body.partner.tier === 'Verified Referrer' && r.body.partner.orgType === 'NGO', r.status + ' ' + (r.body.error || ''));
  const p = r.body.partner;
  r = await call('/partners/' + p.id, 'PUT', { verificationStatus: 'verified' }, T);
  check('25 verify without sanctions screening refused', r.status === 400, r.body.error);
  p.verificationStatus = 'verified'; p.sanctionsScreened = true; p.termsAgreed = true; p.wordingApproved = true; p.sponsoredByBlurb = 'Proud sponsor';
  p.pledge = { description: 'Match gifts up to 1M', limit: 1000000, used: 250000 };
  p.orphanagesSponsored = [{ name: v.name, sponsorSince: '2026-08-01', amount: 0 }];
  r = await call('/partners/' + p.id, 'PUT', p, T);
  const p2 = r.body.partner;
  check('26 verified, screened, pledge + sponsorship saved', r.status === 200 && p2.verificationStatus === 'verified' && p2.sanctionsScreened && p2.pledge && p2.pledge.used === 250000 && p2.orphanagesSponsored.length === 1, r.status + ' ' + (r.body.error || ''));
  r = await call('/partners/' + p.id, 'PUT', { password: 'newpass1' }, T);
  const login = await call('/partner-auth/login', 'POST', { email: 'ap' + stamp + '@example.org', password: 'newpass1' });
  check('27 admin sets a password; partner can sign in', login.status === 200 && login.body.partner.id === p.id, login.status);
  const cs = await call('/partner-auth/placement-cases', 'POST', { socialWorkerName: 'Ngu', socialWorkerPhone: '1', reasonForReferral: 'Needs a place' }, login.body.token);
  check('28 verified referrer submits a placement case', cs.status === 201 && cs.body.partner.placementCases.length === 1 && cs.body.partner.placementReferralsCount === 1, cs.status);
  const withCase = (await call('/partners/' + p.id, 'GET', null, T)).body.partner;
  withCase.placementCases[0].status = 'reviewed';
  r = await call('/partners/' + p.id, 'PUT', withCase, T);
  check('29 admin marks the case reviewed', r.body.partner.placementCases[0].status === 'reviewed');
  const gift = await call('/partner-auth/donations', 'POST', { orphanageId: o.id, type: 'money', amount: 30000, method: 'Bank transfer', need: 'Mattresses (20)', date: '2026-09-20' }, login.body.token);
  check('30 partner logs a donation', gift.status === 201 && gift.body.partner.totalContributed === 30000 && gift.body.partner.donations.length === 1, gift.status + ' ' + (gift.body.error || ''));
  r = await call('/partners/' + p.id, 'PUT', { status: 'flagged', flagReason: 'Report' }, T);
  check('31 partner flagged', r.body.partner.status === 'flagged');
  r = await call('/partners/' + p.id, 'DELETE', null, T);
  check('32 partner with gifts cannot be deleted', r.status === 409 || r.status === 204, r.status + ' ' + (r.body.error || ''));

  console.log('--- PROGRAMS, REPORTS, SETTINGS');
  r = await call('/programs', 'POST', { name: 'School Fees ' + stamp, category: 'Education', status: 'active', description: 'Fees', fundingGoal: 500000, amountRaised: 120000, childrenBenefiting: 40, objectives: 'Pay fees\nBuy books', activities: 'Registration drive' }, T);
  check('33 program created with objectives/activities', r.status === 201 && r.body.program.objectives === 'Pay fees\nBuy books' && r.body.program.amountRaised === 120000 && r.body.program.category === 'Education', r.status + ' ' + (r.body.error || ''));
  const prog = r.body.program;
  r = await call('/programs/' + prog.id, 'PUT', { ...prog, category: 'Brand New Category', status: 'completed', objectives: 'Pay fees' }, T);
  check('34 program edit (new category, status, fewer objectives)', r.body.program.category === 'Brand New Category' && r.body.program.status === 'completed' && r.body.program.objectives === 'Pay fees');
  check('35 program delete', (await call('/programs/' + prog.id, 'DELETE', null, T)).status === 204);

  r = await call('/reports', 'POST', { reporterName: 'A donor', reporterAccountType: 'donor', reportedAccountType: 'orphanage', reportedAccountId: o.id, reportedAccountName: v.name, reasonCategory: 'Fake profile', details: 'Looks wrong', timestamp: new Date().toISOString(), status: 'open' }, T);
  check('36 report filed', r.status === 201 && r.body.report.reportedAccountName === v.name && r.body.report.reasonCategory === 'Fake profile', r.status + ' ' + (r.body.error || ''));
  const rep = r.body.report;
  r = await call('/reports/' + rep.id, 'PUT', { ...rep, status: 'resolved', resolution: 'Account flagged.' }, T);
  check('37 report resolved', r.body.report.status === 'resolved' && r.body.report.resolution === 'Account flagged.');
  const rr = await call('/orphanages/' + o.id, 'GET', null, T);
  rr.body.orphanage.flagged = true; rr.body.orphanage.flagReason = 'Flagged from a user report.';
  rr.body.orphanage.activityLog.push({ reviewer: 'owner@cam-test.org', action: 'Flagged from a user report', timestamp: new Date().toISOString() });
  check('38 flagging from a report (the Reports page way)', (await call('/orphanages/' + o.id, 'PUT', rr.body.orphanage, T)).body.orphanage.flagged === true);

  r = await call('/settings', 'PUT', { orgName: 'CAM Test', orgEmail: 'hello@cam.test', currency: 'USD', notifEmail: false }, T);
  check('39 settings saved', r.body.settings.orgName === 'CAM Test' && r.body.settings.currency === 'USD' && r.body.settings.notifEmail === false && r.body.settings.notifMessages === true);
  r = await call('/settings', 'PUT', { currency: 'FCFA' }, T);
  check('40 settings currency FCFA round trip', r.body.settings.currency === 'FCFA');

  console.log('--- ADMIN USERS');
  r = await call('/admins', 'POST', { name: 'Second Admin', email: 'second' + stamp + '@example.org', password: 'secret12', role: 'Content Manager' }, T);
  check('41 second admin created', r.status === 201 && r.body.admin.role === 'Content Manager', r.status + ' ' + (r.body.error || ''));
  const second = r.body.admin;
  const l2 = await call('/auth/login', 'POST', { email: second.email, password: 'secret12' });
  check('42 second admin signs in', l2.status === 200 && l2.body.admin.role === 'Content Manager');
  r = await call('/admins/' + second.id, 'PUT', { role: 'Administrator', name: 'Renamed Admin' }, T);
  check('43 role + name changed', r.body.admin.role === 'Administrator' && r.body.admin.name === 'Renamed Admin');
  const all = (await call('/admins', 'GET', null, T)).body.admins;
  const owner = all.find((a) => a.email === 'owner@cam-test.org');
  await call('/admins/' + second.id, 'DELETE', null, T);
  r = await call('/admins/' + owner.id, 'DELETE', null, T);
  check('44 cannot delete the last administrator', r.status === 400, r.body.error && r.body.error.slice(0, 50));
  r = await call('/admins/' + owner.id, 'PUT', { role: 'Content Manager' }, T);
  check('45 cannot demote the last administrator', r.status === 400);
  check('46 duplicate admin email refused', (await call('/admins', 'POST', { name: 'X', email: 'OWNER@cam-test.org', password: 'secret12' }, T)).status === 400);

  console.log('--- SUPPORT THREADS (admin side)');
  r = await call('/messages/thread', 'POST', { accountType: 'orphanage', accountId: o.id, senderName: v.name }, T);
  check('47 admin opens a thread with an orphanage', r.status === 201 && r.body.message.accountType === 'orphanage' && r.body.message.accountId === o.id && r.body.message.read === true && r.body.message.fromAdmin === true, r.status);
  const th = r.body.message;
  th.replies.push({ text: 'Welcome!', timestamp: new Date().toISOString(), sender: 'admin' });
  r = await call('/messages/' + th.id, 'PUT', { ...th, status: 'in-progress', priority: 'high' }, T);
  check('48 first admin message is the opening message; status + priority saved', r.body.message.body === 'Welcome!' && r.body.message.fromAdmin === true && r.body.message.status === 'in-progress' && r.body.message.priority === 'high', JSON.stringify([r.body.message.body, r.body.message.status]));
  const again = r.body.message;
  again.replies.push({ text: 'Second line', timestamp: new Date().toISOString(), sender: 'admin' });
  again.replies.push({ text: 'Auto reply text', timestamp: new Date().toISOString(), auto: true });
  r = await call('/messages/' + th.id, 'PUT', { ...again, autoReplied: true }, T);
  check('49 more replies appended once; auto-reply kept as auto', r.body.message.replies.length === 2 && r.body.message.autoReplied === true && r.body.message.replies[1].auto === true, r.body.message.replies.length + ' replies');
  r = await call('/messages/' + th.id, 'PUT', r.body.message, T);
  check('49b saving again does not duplicate messages', r.body.message.replies.length === 2, r.body.message.replies.length + ' replies');
  check('50 thread deleted', (await call('/messages/' + th.id, 'DELETE', null, T)).status === 204);

  console.log('--- CLEAN-UP / DELETES');
  const dh = await call('/orphanages', 'POST', { name: 'Delete Me ' + stamp }, T);
  check('51 orphanage without history deleted', (await call('/orphanages/' + dh.body.orphanage.id, 'DELETE', null, T)).status === 204);
  r = await call('/orphanages/' + o.id, 'DELETE', null, T);
  check('52 orphanage that received gifts cannot be deleted', r.status === 409, r.status + ' ' + (r.body.error || ''));
  check('53 need delete refused when it has gifts', (await call('/needs/' + need.id, 'DELETE', null, T)).status === 409);

  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('TEST CRASHED', e); process.exit(2); });
