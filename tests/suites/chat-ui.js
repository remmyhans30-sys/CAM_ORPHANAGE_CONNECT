const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(58), v);
const J = { 'Content-Type': 'application/json' };

(async () => {
  const b = await connect();
  const stamp = Date.now();
  const api = async (path, method, body, token) => (await fetch(SITE + '/api' + path, { method: method || 'GET', headers: Object.assign({}, J, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined })).json();
  const admin = (await api('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).token;

  // cast
  const orph = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Sunrise Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' });
  const need = (await api('/my-orphanage/needs', 'POST', { title: 'Bunk beds', description: 'x', goal: 80000 }, orph.token)).need;
  const oid = (await api('/orphanages', 'GET', null, admin)).orphanages.find((o) => o.name === 'Sunrise Home ' + stamp).id;
  await api('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }, admin);
  const donor = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Amara Ndongo', email: 'd' + stamp + '@example.com', password: 'secret1', role: 'user' });
  const drow = (await api('/donors', 'GET', null, admin)).donors.find((d) => d.email === 'd' + stamp + '@example.com');
  await api('/donors/' + drow.id, 'PUT', { status: 'active' }, admin);
  await api('/pledges', 'POST', { needId: need.id, amount: 5000 }, donor.token);
  const partner = await api('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Paris Diaspora Alliance', email: 'p' + stamp + '@example.com', password: 'secret1' });
  const prow = (await api('/partners', 'GET', null, admin)).partners.find((p) => p.email === 'p' + stamp + '@example.com');
  await api('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  const pending = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Pending Donor', email: 'pd' + stamp + '@example.com', password: 'secret1', role: 'user' });

  const asOrphanage = async () => { await b.go(SITE + '/login/index.html'); await b.js(`sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('cocSession', JSON.stringify({ fullname: 'Sunrise Home', email: 'o', role: 'volunteer', token: '${orph.token}' }))`); };
  const asDonor = async (t, name) => { await b.go(SITE + '/login/index.html'); await b.js(`sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('cocSession', JSON.stringify({ fullname: '${name}', email: 'd', role: 'user', token: '${t}' }))`); };
  const send = async (text) => { await b.js(`(() => { const i = document.querySelector('.chat-input'); i.value = ${JSON.stringify(text)}; document.querySelector('.chat-form').requestSubmit(); })()`); await sleep(900); };
  const bubbles = () => b.js(`[...document.querySelectorAll('.chat-msg')].map(m => (m.classList.contains('mine') ? 'me' : 'them') + ': ' + m.querySelector('.chat-msg-text').textContent).join(' | ')`);

  console.log('--- ORPHANAGE <-> TEAM');
  await asOrphanage();
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('checklist').children.length > 0`);
  await b.js(`document.querySelector('[data-view="messages"]').click()`);
  await b.waitFor(`document.querySelectorAll('#chat-root .chat-item').length > 0`);
  out('1 orphanage Messages tab lists:', await b.js(`[...document.querySelectorAll('#chat-root .chat-item-title')].map(e => e.textContent).join(', ')`));
  await b.js(`document.querySelector('#chat-root .chat-item').click()`);
  await b.waitFor(`!!document.querySelector('.chat-input')`);
  await send('Hello team, our documents are uploaded. Please review.');
  out('2 orphanage message to the team shows:', await bubbles());
  const inbox = (await api('/messages', 'GET', null, admin)).messages.find((m) => m.senderName === 'Sunrise Home ' + stamp);
  out('3 team inbox received it (unread):', inbox ? inbox.accountType + ' | read=' + inbox.read : 'MISSING');
  const full = (await api('/messages/' + inbox.id, 'GET', null, admin)).message;
  full.replies.push({ text: 'Thanks! We are reviewing today.', timestamp: new Date().toISOString(), sender: 'admin' });
  await api('/messages/' + inbox.id, 'PUT', { replies: full.replies, read: true }, admin);
  await b.waitFor(`document.querySelectorAll('.chat-msg').length >= 3`, 9000);
  out('4 team reply arrives without reloading:', await bubbles());

  console.log('--- DONOR STARTS A CHAT');
  await asDonor(donor.token, 'Amara Ndongo');
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.orphanage-message-btn').length > 0`);
  out('5 donor page shows Message buttons:', await b.js(`document.querySelectorAll('.orphanage-message-btn').length + ' button(s); nav link visible: ' + !document.getElementById('navMessages').classList.contains('d-none')`));
  await b.js(`[...document.querySelectorAll('.card-orphanage')].find(c => c.innerText.includes('Sunrise Home ${stamp}')).querySelector('.orphanage-message-btn').click()`);
  await b.waitFor(`location.pathname === '/donor/messages.html' && !!document.querySelector('.chat-chosen')`);
  out('6 opens new chat addressed to:', await b.js(`document.querySelector('.chat-chosen').innerText.replace(/\\s+/g, ' ').replace('${stamp}', '')`));
  await send('Hello! I gave toward the bunk beds. How are the children doing?');
  out('7 donor first message:', await bubbles());
  out('8 conversation now in the list:', await b.js(`[...document.querySelectorAll('.chat-item-title')].map(e => e.textContent.replace('${stamp}', '')).join(', ')`));

  console.log('--- ORPHANAGE REPLIES + STARTS A PARTNER CHAT');
  await asOrphanage();
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('checklist').children.length > 0`);
  await b.waitFor(`document.getElementById('messages-dot').style.display !== 'none'`, 6000);
  out('9 unread dot on portal Messages tab:', await b.js(`document.getElementById('messages-dot').style.display !== 'none'`));
  await b.js(`document.querySelector('[data-view="messages"]').click()`);
  await b.waitFor(`document.querySelectorAll('#chat-root .chat-item.unread').length > 0`);
  out('10 unread conversation highlighted:', await b.js(`document.querySelector('#chat-root .chat-item.unread .chat-item-title').textContent`));
  await b.js(`document.querySelector('#chat-root .chat-item.unread').click()`);
  await b.waitFor(`!!document.querySelector('.chat-msg')`);
  out('11 orphanage reads the donor message:', await bubbles());
  await send('Thank you Amara! They are doing wonderfully.');
  await sleep(500);
  out('12 dot cleared after reading:', await b.js(`document.getElementById('messages-dot').style.display === 'none'`));
  await b.js(`document.querySelector('.chat-back').click()`);
  await b.js(`document.querySelector('#chat-root .chat-btn-small').click()`);
  await b.waitFor(`document.querySelectorAll('.chat-contact').length > 0`);
  out('13 "+ New" offers:', await b.js(`[...document.querySelectorAll('.chat-contact strong')].map(e => e.textContent).join(', ')`));
  await b.js(`[...document.querySelectorAll('.chat-contact')].find(c => c.innerText.includes('Paris Diaspora')).click()`);
  await send('Hello from Sunrise Home! We would love to tell you about our work.');
  out('14 message to partner:', await bubbles());

  console.log('--- DONOR SEES THE REPLY');
  await asDonor(donor.token, 'Amara Ndongo');
  await b.go(SITE + '/donor/messages.html', `document.querySelectorAll('.chat-item').length > 0`);
  await b.waitFor(`!document.getElementById('navMessagesDot').classList.contains('d-none')`, 4000);
  out('15 nav dot + unread item:', await b.js(`!document.getElementById('navMessagesDot').classList.contains('d-none') + ' / ' + document.querySelectorAll('.chat-item.unread').length`));
  await b.js(`document.querySelector('.chat-item.unread').click()`);
  await b.waitFor(`document.querySelectorAll('.chat-msg').length >= 2`);
  out('16 donor reads the reply:', await bubbles());

  console.log('--- LOCKED CASES');
  await asDonor(pending.token, 'Pending Donor');
  await b.go(SITE + '/donor/messages.html', `document.querySelectorAll('.chat-item').length > 0`);
  await b.js(`document.querySelector('.chat-btn-small').click()`);
  await b.waitFor(`!!document.querySelector('.chat-pane .chat-lock-note')`);
  out('24 pending donor: New message says:', await b.js(`document.querySelector('.chat-pane .chat-lock-note').textContent.slice(0, 58)`));
  await b.js(`document.querySelector('.chat-back').click(); document.querySelector('.chat-item').click()`);
  await b.waitFor(`!!document.querySelector('.chat-input')`);
  await send('Hi team, when will my account be approved?');
  out('25 ...but can still write to the team:', await bubbles());
  out('26 page JS errors:', b.errors.length ? b.errors.join(' | ') : 'none');
  b.close();
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
