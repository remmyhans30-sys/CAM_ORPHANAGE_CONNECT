const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(58), v);
const J = { 'Content-Type': 'application/json' };

(async () => {
  const b = await connect();
  const stamp = Date.now();
  const api = async (path, method, body, token) => (await fetch(SITE + '/api' + path, { method: method || 'GET', headers: Object.assign({}, J, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined })).json();
  const adminLogin = await api('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' });
  const admin = adminLogin.token;
  const short = (t) => String(t).replace(String(stamp), '').replace(/\s+/g, ' ').trim();

  // ---- cast -------------------------------------------------------------------------------
  const mkOrph = async (name) => {
    const o = await api('/users/register', 'POST', { acceptTerms: true, fullname: name + ' ' + stamp, email: name.toLowerCase().replace(/ /g, '') + stamp + '@example.com', password: 'secret1', role: 'volunteer' });
    const id = (await api('/orphanages', 'GET', null, admin)).orphanages.find((x) => x.name === name + ' ' + stamp).id;
    await api('/orphanages/' + id, 'PUT', { status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }, admin);
    return { token: o.token, id: id };
  };
  const home = await mkOrph('Sunrise Home');
  const home2 = await mkOrph('Hillside Home');
  const need = (await api('/my-orphanage/needs', 'POST', { title: 'Beds', description: 'x', goal: 80000 }, home.token)).need;
  const donor = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Amara Ndongo', email: 'd' + stamp + '@example.com', password: 'secret1', role: 'user' });
  const drow = (await api('/donors', 'GET', null, admin)).donors.find((d) => d.email === 'd' + stamp + '@example.com');
  await api('/donors/' + drow.id, 'PUT', { status: 'active' }, admin);
  await api('/pledges', 'POST', { needId: need.id, amount: 5000 }, donor.token);
  const partner = await api('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Paris Diaspora Alliance', email: 'p' + stamp + '@example.com', password: 'secret1' });
  const prow = (await api('/partners', 'GET', null, admin)).partners.find((p) => p.email === 'p' + stamp + '@example.com');
  await api('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  const draftPartner = await api('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Draft Partner', email: 'dp' + stamp + '@example.com', password: 'secret1' });
  // existing chats
  await api('/my-messages/chats', 'POST', { withType: 'partner', withId: prow.id, text: 'Hello from Sunrise Home, we would love to connect.' }, home.token);
  await api('/my-messages/chats', 'POST', { withType: 'orphanage', withId: home.id, text: 'Hello! I gave toward the bunk beds.' }, donor.token);
  // a support thread written by the partner, and an urgent one from the donor
  await api('/my-messages/team/reply', 'POST', { text: 'How do I upload my tax certificate?' }, partner.token);
  await api('/my-messages/team/reply', 'POST', { text: 'My pledge did not show on my profile.' }, donor.token);
  const threads = (await api('/messages', 'GET', null, admin)).messages;
  const donorThread = threads.find((t) => t.senderName === 'Amara Ndongo');
  await api('/messages/' + donorThread.id, 'PUT', { priority: 'urgent' }, admin);

  const asPartner = async (t) => { await b.go(SITE + '/partner/index.html'); await b.js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('partnerToken', '${t}'); localStorage.setItem('partnerEmail', 'p')`); };
  const asAdmin = async () => { await b.go(SITE + '/admin/index.html'); await b.js(`localStorage.clear(); localStorage.setItem('adminToken', '${admin}'); localStorage.setItem('currentAdminEmail', '${adminLogin.admin.email}'); localStorage.setItem('currentAdminRole', '${adminLogin.admin.role}'); localStorage.setItem('currentAdminDisplayName', '${adminLogin.admin.name}')`); };
  const asDonor = async () => { await b.go(SITE + '/login/index.html'); await b.js(`sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('cocSession', JSON.stringify({ fullname: 'Amara Ndongo', email: 'd', role: 'user', token: '${donor.token}' }))`); };
  const send = async (text) => { await b.js(`(() => { const i = document.querySelector('.chat-input'); i.value = ${JSON.stringify(text)}; document.querySelector('.chat-form').requestSubmit(); })()`); await sleep(900); };
  const bubbles = () => b.js(`[...document.querySelectorAll('.chat-msg')].map(m => (m.classList.contains('mine') ? 'me' : 'them') + ': ' + m.querySelector('.chat-msg-text').textContent).join(' | ')`);
  const items = () => b.js(`[...document.querySelectorAll('.chat-item')].map(i => i.querySelector('.chat-item-title').textContent.replace('${stamp}', '').trim() + (i.classList.contains('unread') ? '*' : '')).join(' ; ')`);
  const openItem = async (text) => { await b.js(`[...document.querySelectorAll('.chat-item')].find(i => i.innerText.includes(${JSON.stringify(text)})).click()`); await b.waitFor(`!!document.querySelector('.chat-msg') || !!document.querySelector('.chat-no-messages')`); await sleep(300); };

  console.log('--- PARTNER: same chat window');
  await asPartner(partner.token);
  await b.go(SITE + '/partner/messages.html', `document.querySelectorAll('.chat-item').length > 1`);
  out('1 partner Messages shows the chat window:', await b.js(`!!document.querySelector('#chat-root .chat-list') && !!document.querySelector('#chat-root .chat-pane')`));
  out('2 conversations (* = unread):', await items());
  await openItem('Sunrise Home');
  out('3 partner reads the orphanage:', await bubbles());
  await send('Hello Sunrise Home! Tell us about your needs.');
  out('4 partner replies in the window:', await bubbles());
  await b.js(`document.querySelector('.chat-back').click(); document.querySelector('.chat-btn-small').click()`);
  await b.waitFor(`document.querySelectorAll('.chat-contact').length > 0`);
  out('5 partner "+ New" offers verified orphanages:', await b.js(`[...document.querySelectorAll('.chat-contact strong')].map(e => e.textContent.replace('${stamp}', '').trim()).sort().join(', ')`));
  await b.js(`[...document.querySelectorAll('.chat-contact')].find(c => c.innerText.includes('Hillside')).click()`);
  await send('Hello Hillside Home, we are a diaspora group in Paris.');
  out('6 new chat with a second orphanage:', await bubbles());
  await b.go(SITE + '/partner/orphanage-view.html?id=' + home.id, `!document.getElementById('orphanage-content').classList.contains('d-none')`);
  await sleep(500);
  out('7 orphanage page link:', await b.js(`document.getElementById('message-orphanage-link').getAttribute('href')`).then((h) => h.replace(String(home.id), '<id>')));
  await b.js(`document.getElementById('message-orphanage-link').click()`);
  await b.waitFor(`location.pathname === '/partner/messages.html' && document.querySelectorAll('.chat-msg').length > 0`);
  out('8 link opens that exact chat:', await b.js(`document.querySelector('.chat-pane-head strong').textContent.replace('${stamp}', '').trim() + ' | ' + document.querySelectorAll('.chat-msg').length + ' messages'`));
  await b.go(SITE + '/partner/messages.html', `document.querySelectorAll('.chat-item').length > 0`);
  await openItem('CAM Orphanage Connect team');
  await send('I uploaded the certificate now, thank you.');
  out('9 partner writes to the team:', await bubbles());

  await asPartner(draftPartner.token);
  await b.go(SITE + '/partner/messages.html', `document.querySelectorAll('.chat-item').length > 0`);
  await b.js(`document.querySelector('.chat-btn-small').click()`);
  await b.waitFor(`!!document.querySelector('.chat-pane .chat-lock-note')`);
  out('10 unverified partner: "+ New" says:', await b.js(`document.querySelector('.chat-pane .chat-lock-note').textContent.slice(0, 62)`));

  console.log('--- ADMIN SUPPORT CENTER: same chat window + your controls');
  await asAdmin();
  await b.go(SITE + '/admin/messages.html', `document.querySelectorAll('.chat-item').length > 1`);
  out('11 conversations (* = unread):', await items());
  out('12 type tags + badges on the list:', await b.js(`[...document.querySelectorAll('.chat-item')].filter(i => /Amara|Paris/.test(i.innerText)).map(i => i.querySelector('.chat-type-tag').textContent + (i.querySelector('.chat-badge') ? '+' + i.querySelector('.chat-badge').textContent : '')).join(', ')`));
  out('13 urgent one sorted first:', await b.js(`document.querySelector('.chat-item .chat-item-title').textContent`));
  await b.js(`document.getElementById('priority-filter').value = 'urgent'; document.getElementById('priority-filter').dispatchEvent(new Event('change'))`);
  out('14 priority filter = urgent shows:', await b.js(`[...document.querySelectorAll('.chat-item-title')].map(e => e.textContent).join(', ')`));
  await b.js(`document.getElementById('priority-filter').value = 'all'; document.getElementById('priority-filter').dispatchEvent(new Event('change')); document.getElementById('search-input').value = 'tax'; document.getElementById('search-input').dispatchEvent(new Event('input'))`);
  out('15 search "tax" shows:', await b.js(`[...document.querySelectorAll('.chat-item-title')].map(e => e.textContent).join(', ')`));
  await b.js(`document.getElementById('search-input').value = ''; document.getElementById('search-input').dispatchEvent(new Event('input'))`);
  await openItem('Paris Diaspora');
  out('16 opens the partner thread:', await bubbles());
  out('17 ticket controls present:', await b.js(`['ticket-status-select', 'ticket-priority-select', 'delete-message-btn'].map(id => id + '=' + !!document.getElementById(id)).join(' ') + ' | profile link: ' + document.querySelector('.chat-pane-extra a').getAttribute('href').replace(/id=\\d+/, 'id=<id>')`));
  await b.js(`document.getElementById('ticket-status-select').value = 'in-progress'; document.getElementById('ticket-status-select').dispatchEvent(new Event('change'))`);
  await b.waitFor(`document.getElementById('ticket-status-save-status').textContent === 'Saved.'`);
  await b.waitFor(`!![...document.querySelectorAll('.chat-item')].find(i => i.innerText.includes('Paris') && i.innerText.includes('In progress'))`);
  out('18 status saved + shown as a badge:', await b.js(`[...document.querySelectorAll('.chat-item')].find(i => i.innerText.includes('Paris')).querySelector('.chat-badge').textContent`));
  await send('Please upload it under "My Organization", then press Submit.');
  out('19 admin replies in the window:', await bubbles());
  await b.go(SITE + '/admin/messages.html?id=' + donorThread.id, `document.querySelectorAll('.chat-msg').length > 0`);
  out('20 deep link ?id= opens that thread:', await b.js(`document.querySelector('.chat-pane-head strong').textContent`));
  await b.js(`document.querySelector('.chat-btn-small').click()`);
  await b.waitFor(`document.querySelectorAll('.chat-contact').length > 3`);
  out('21 "+ New" offers every profile type:', await b.js(`[...new Set([...document.querySelectorAll('.chat-contact .chat-pane-sub')].map(e => e.textContent.split(' · ')[0]))].sort().join(', ')`));
  await b.js(`[...document.querySelectorAll('.chat-contact')].find(c => c.innerText.includes('Hillside Home')).click()`);
  await send('Welcome to CAM Orphanage Connect! Let us know if you need anything.');
  out('22 admin starts a thread with an orphanage:', await bubbles());
  const homeThread = (await api('/my-messages/team', 'GET', null, home2.token)).conversation;
  out('23 that orphanage receives it in its portal API:', homeThread.messages.map((m) => (m.mine ? 'me' : 'team') + ': ' + m.text.slice(0, 25)).join(' | '));

  console.log('--- ADMIN CHAT MONITOR: same chat window');
  await b.go(SITE + '/admin/conversations.html', `document.querySelectorAll('.chat-item').length > 0`);
  out('24 chats listed:', (await items()).replace(/\*/g, ''));
  out('25 type tags:', await b.js(`[...document.querySelectorAll('.chat-item .chat-type-tag')].map(e => e.textContent).sort().join(', ')`));
  out('26 no "+ New" button in monitor:', await b.js(`getComputedStyle(document.querySelector('.chat-btn-small')).display === 'none'`));
  await b.js(`document.getElementById('kind-filter').value = 'po'; document.getElementById('kind-filter').dispatchEvent(new Event('change'))`);
  out('27 filter "Partner and orphanage":', (await items()).replace(/\*/g, ''));
  await b.js(`document.getElementById('kind-filter').value = 'all'; document.getElementById('kind-filter').dispatchEvent(new Event('change'))`);
  await openItem('Amara');
  out('28 admin reads the donor chat:', await b.js(`[...document.querySelectorAll('.chat-msg')].map(m => m.querySelector('.chat-msg-meta').textContent.replace(/\\d.*$/, '').replace('${stamp}', '').trim() + ': ' + m.querySelector('.chat-msg-text').textContent.slice(0, 22)).join(' | ')`));
  await send('The CAM team is following this chat. Thank you both!');
  out('29 steps in as team:', await b.js(`[...document.querySelectorAll('.chat-msg.mine')].map(m => m.querySelector('.chat-msg-text').textContent.slice(0, 24)).join(' | ')`));
  const donorChatKey = (await api('/my-messages/chats', 'GET', null, donor.token)).conversations.find((c) => c.title.startsWith('Sunrise Home')).key;
  const homeToDonor = (await api('/my-messages/chats/' + donorChatKey, 'GET', null, donor.token)).conversation;
  out('30 the donor sees it labelled as the team:', homeToDonor.messages.slice(-1)[0].label + ': ' + homeToDonor.messages.slice(-1)[0].text.slice(0, 20));
  await b.js(`window.confirm = () => true; document.querySelector('.chat-msg-action').click()`);
  await b.waitFor(`document.querySelector('.chat-pane').innerText.includes('Message removed')`);
  out('31 admin removes a message:', await b.js(`document.querySelector('.chat-pane').innerText.includes('Message removed')`));

  console.log('--- STILL FINE: donor + page errors');
  await asDonor();
  await b.go(SITE + '/donor/messages.html', `document.querySelectorAll('.chat-item').length > 0`);
  out('32 donor window lists:', (await items()));
  out('33 page JS errors:', b.errors.length ? b.errors.join(' | ') : 'none');
  b.close();
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
