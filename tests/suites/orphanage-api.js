const A = 'http://127.0.0.2:4555/api';
const out = (label, value) => console.log(label.padEnd(50), value);

async function call(path, method, body, token, raw) {
  const res = await fetch(A + path, {
    method: method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const PDF = b64(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 65)]));
const PNG = b64(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]));
const EXE = b64(Buffer.from('MZ' + 'x'.repeat(100)));
const SVG = b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));

(async () => {
  const stamp = Date.now();
  const orph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Draft Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const other = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Other Home', email: 'x' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body;

  let r = await call('/my-orphanage', 'GET', null, orph.token);
  out('1 new sign-up status:', r.body.orphanage.status + ' | required items still open: ' + r.body.orphanage.checklist.filter((c) => c.required && !c.done).length);
  const adminList = await call('/orphanages', 'GET', null, admin.token);
  out('2 appears in admin list as:', adminList.body.orphanages.find((o) => o.name === 'Draft Home ' + stamp).status);

  r = await call('/my-orphanage/submit', 'POST', {}, orph.token);
  out('3 submit while incomplete:', r.status + ' ' + r.body.error.slice(0, 80) + '...');

  r = await call('/my-orphanage', 'PUT', { location: 'Buea', registrationNumber: 'REG-2024-017', childrenCount: '20', capacity: '30', foundedYear: '2012', contactName: 'Grace M', contactPhone: '+237 600 000 000', story: 'We care for 20 children.', storyLanguage: 'en', paymentProvider: 'MTN Mobile Money', paymentAccountName: 'Draft Home', paymentAccountNumber: '670000000' }, orph.token);
  out('4 save full profile:', r.status + ' ' + (r.body.orphanage ? r.body.orphanage.registrationNumber + ', capacity ' + r.body.orphanage.capacity : JSON.stringify(r.body)));
  out('5 bad story language rejected:', (await call('/my-orphanage', 'PUT', { storyLanguage: 'de' }, orph.token)).body.error);
  out('6 bad founding year rejected:', (await call('/my-orphanage', 'PUT', { foundedYear: '1500' }, orph.token)).body.error);

  r = await call('/my-orphanage/submit', 'POST', {}, orph.token);
  out('7 submit without document/terms:', r.body.missing.join(', '));

  out('8 .exe renamed to .pdf rejected:', (await call('/my-orphanage/documents', 'POST', { filename: 'cert.pdf', data: EXE }, orph.token)).body.error);
  out('9 SVG (can contain scripts) rejected:', (await call('/my-orphanage/documents', 'POST', { filename: 'logo.svg', data: SVG }, orph.token)).body.error);
  out('10 PDF as a photo rejected:', (await call('/my-orphanage/photo', 'POST', { filename: 'p.jpg', data: PDF }, orph.token)).body.error);
  const big = b64(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(3.2 * 1024 * 1024, 66)]));
  out('11 file over 3 MB rejected:', (await call('/my-orphanage/documents', 'POST', { filename: 'big.pdf', data: big }, orph.token)).body.error);

  r = await call('/my-orphanage/documents', 'POST', { filename: 'registration certificate.pdf', data: PDF }, orph.token);
  out('12 real PDF accepted:', r.status + ' ' + r.body.orphanage.documents.map((d) => d.name + ' (' + d.size + ' B)').join(', '));
  const docId = r.body.orphanage.documents[0].id;
  r = await call('/my-orphanage/photo', 'POST', { filename: 'front.png', data: PNG }, orph.token);
  const photoUrl = r.body.orphanage.photoUrl;
  out('13 photo accepted, url:', photoUrl);

  await call('/my-orphanage', 'PUT', { termsAgreed: true }, orph.token);

  // who can open what
  const doc = (token) => call('/files/document/' + docId, 'GET', null, token, true);
  out('14 document: no login:', (await doc(null)).status);
  out('15 document: owner:', (await doc(orph.token)).status + ' ' + (await doc(orph.token)).headers.get('content-type'));
  out('16 document: other orphanage:', (await doc(other.token)).status);
  out('17 document: admin:', (await doc(admin.token)).status);
  const pub = await fetch('http://127.0.0.2:4555' + photoUrl);
  out('18 photo is public:', pub.status + ' ' + pub.headers.get('content-type') + ' nosniff=' + pub.headers.get('x-content-type-options'));
  out('19 doc id via public photo route:', (await fetch('http://127.0.0.2:4555/api/files/photo/' + docId)).status);
  out('20 uploads folder not downloadable:', (await fetch('http://127.0.0.2:4555/server/uploads/' + docId + '.pdf')).status);

  r = await call('/my-orphanage/submit', 'POST', {}, orph.token);
  out('21 submit when complete:', r.status + ' status=' + (r.body.orphanage && r.body.orphanage.status));
  out('22 submit again:', (await call('/my-orphanage/submit', 'POST', {}, orph.token)).body.error);
  const row = (await call('/orphanages', 'GET', null, admin.token)).body.orphanages.find((o) => o.name === 'Draft Home ' + stamp);
  out('23 admin sees:', row.status + ' | reg ' + row.registrationNumber + ' | submitted ' + row.submittedDate + ' | docs ' + row.documents.length + ' | log ' + row.activityLog.length + ' entries');

  // admin asks for more info, orphanage resubmits
  await call('/orphanages/' + row.id, 'PUT', { status: 'needs-info', infoRequestMessage: 'Please upload the director ID' }, admin.token);
  r = await call('/my-orphanage', 'GET', null, orph.token);
  out('24 after admin asks for info:', r.body.orphanage.status + ' | "' + r.body.orphanage.infoRequestMessage + '"');
  await call('/my-orphanage/documents', 'POST', { filename: 'director-id.png', data: PNG }, orph.token);
  r = await call('/my-orphanage/submit', 'POST', {}, orph.token);
  out('25 resubmitted:', r.body.orphanage.status + ' | docs ' + r.body.orphanage.documents.length);

  r = await call('/my-orphanage/documents/' + docId, 'DELETE', null, other.token);
  out('26 other orphanage deleting my doc:', r.status);
  r = await call('/my-orphanage/documents/' + docId, 'DELETE', null, orph.token);
  out('27 owner deletes document:', r.status + ' left=' + r.body.orphanage.documents.length);
  out('28 deleted file really gone:', (await doc(admin.token)).status);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
