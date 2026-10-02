const A = 'http://127.0.0.2:4555/api';
const out = (l, v) => console.log(l.padEnd(52), v);
async function call(path, method, body, token, raw) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const PDF = b64(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 65)]));
const PNG = b64(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]));

(async () => {
  const stamp = Date.now();
  const email = 'p' + stamp + '@example.com';
  let r = await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Douala Business Alliance ' + stamp, email: email, password: 'secret1' });
  out('1 partner sign-up:', r.status + ' status=' + r.body.partner.verificationStatus + ' tier=' + r.body.partner.tier + ' open items=' + r.body.partner.checklist.filter((c) => c.required && !c.done).length);
  const token = r.body.token;
  out('2 same email again:', (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'X', email: email.toUpperCase(), password: 'secret1' })).body.error);
  out('3 donor sign-up with partner email:', (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'X', email: email, password: 'secret1', role: 'user' })).body.error);
  out('4 partner sign-up with a donor email:', await (async () => {
    const e = 'dd' + stamp + '@example.com';
    await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Donor', email: e, password: 'secret1', role: 'user' });
    return (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Y', email: e, password: 'secret1' })).body.error;
  })());
  out('5 login works:', (await call('/partner-auth/login', 'POST', { email: email, password: 'secret1' })).status);

  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body;
  const listed = async () => (await call('/partners', 'GET', null, admin.token)).body.partners.find((p) => p.email === email);
  out('6 admin list status while incomplete:', (await listed()).verificationStatus);

  r = await call('/partner-auth/me/submit', 'POST', {}, token);
  out('7 submit while incomplete:', r.status + ' missing: ' + r.body.missing.join(', '));
  out('8 bad org type rejected:', (await call('/partner-auth/me', 'PUT', { orgType: 'Mafia' }, token)).body.error);
  out('9 bad pledge limit rejected:', (await call('/partner-auth/me', 'PUT', { pledgeDescription: 'Match gifts', pledgeLimit: -5 }, token)).body.error);
  r = await call('/partner-auth/me', 'PUT', { orgType: 'Corporate', country: 'Cameroon', contactName: 'Paul Essomba', sponsoredByBlurb: 'Proud to sponsor local children.', pledgeDescription: 'Match donor gifts to one home', pledgeLimit: 300000 }, token);
  out('10 save profile:', r.status + ' ' + [r.body.partner.orgType, r.body.partner.country, r.body.partner.contactName, JSON.stringify(r.body.partner.pledge)].join(' | '));
  out('11 fake file refused:', (await call('/partner-auth/me/documents', 'POST', { filename: 'id.pdf', data: b64(Buffer.from('MZ junk')) }, token)).body.error);
  r = await call('/partner-auth/me/documents', 'POST', { filename: 'company-registration.pdf', data: PDF }, token);
  out('12 document accepted:', r.status + ' ' + r.body.partner.documents.map((d) => d.name).join(', '));
  const docId = r.body.partner.documents[0].id;
  r = await call('/partner-auth/me/logo', 'POST', { filename: 'logo.png', data: PNG }, token);
  out('13 logo accepted:', r.status + ' ' + r.body.partner.logoUrl);
  out('14 submit without terms:', (await call('/partner-auth/me/submit', 'POST', {}, token)).body.missing.join(', '));
  await call('/partner-auth/me', 'PUT', { termsAgreed: true }, token);

  const doc = (t) => call('/files/document/' + docId, 'GET', null, t, true);
  out('15 document: owner / admin / no login:', (await doc(token)).status + ' / ' + (await doc(admin.token)).status + ' / ' + (await doc(null)).status);
  const other = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Other Org', email: 'q' + stamp + '@example.com', password: 'secret1' })).body;
  out('16 document: another partner:', (await doc(other.token)).status);

  r = await call('/partner-auth/me/submit', 'POST', {}, token);
  out('17 submit when complete:', r.status + ' status=' + r.body.partner.verificationStatus);
  const row = await listed();
  out('18 admin sees:', [row.verificationStatus, row.submittedDate, row.orgType, row.country, row.documents.length + ' doc(s)', JSON.stringify(row.documents[0]).slice(0, 40)].join(' | '));
  out('19 sponsored wording starts unapproved:', row.wordingApproved);

  await call('/partners/' + row.id, 'PUT', { verificationStatus: 'needs-info', infoRequestMessage: 'Please add the tax clearance certificate' }, admin.token);
  out('20 after admin asks for info:', (await call('/partner-auth/me', 'GET', null, token)).body.partner.verificationStatus);
  await call('/partner-auth/me/documents', 'POST', { filename: 'tax-clearance.pdf', data: PDF }, token);
  r = await call('/partner-auth/me/submit', 'POST', {}, token);
  out('21 resubmitted:', r.body.partner.verificationStatus + ' docs=' + r.body.partner.documents.length);
  await call('/partners/' + row.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin.token);
  out('22 pledge locked once verified:', (await call('/partner-auth/me', 'PUT', { pledgeDescription: 'Match everything', pledgeLimit: 99999999 }, token)).body.error);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
