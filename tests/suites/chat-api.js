const A = 'http://127.0.0.2:4555/api';
const out = (l, v) => console.log(l.padEnd(58), v);
async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const err = (r) => r.status + ' ' + (r.body.error || '').slice(0, 58);

(async () => {
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;

  // cast: a verified orphanage, an approved donor (who pledged), a stranger donor, a verified partner, a draft partner
  const orph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Chat Home ' + stamp, email: 'o' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const otherOrph = (await call('/users/register', 'POST', { acceptTerms: true, fullname: 'Other Chat Home ' + stamp, email: 'oo' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  const need = (await call('/my-orphanage/needs', 'POST', { title: 'Beds', description: 'x', goal: 90000 }, orph.token)).body.need;
  const orphList = (await call('/orphanages', 'GET', null, admin)).body.orphanages;
  const oid = orphList.find((o) => o.name === 'Chat Home ' + stamp).id;
  const oid2 = orphList.find((o) => o.name === 'Other Chat Home ' + stamp).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }, admin);

  const mkDonor = async (n, approve) => {
    const d = (await call('/users/register', 'POST', { acceptTerms: true, fullname: n + ' ' + stamp, email: n.toLowerCase().replace(/ /g, '') + stamp + '@example.com', password: 'secret1', role: 'user' })).body;
    const row = (await call('/donors', 'GET', null, admin)).body.donors.find((x) => x.name === n + ' ' + stamp);
    if (approve) await call('/donors/' + row.id, 'PUT', { status: 'active' }, admin);
    return { token: d.token, id: row.id };
  };
  const giver = await mkDonor('Giver', true);
  const stranger = await mkDonor('Stranger', true);
  const waiting = await mkDonor('Waiting', false);
  await call('/pledges', 'POST', { needId: need.id, amount: 5000 }, giver.token);

  const partner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Chat Partner ' + stamp, email: 'p' + stamp + '@example.com', password: 'secret1' })).body;
  const prow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Chat Partner ' + stamp);
  const draftPartner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Draft Partner ' + stamp, email: 'dp' + stamp + '@example.com', password: 'secret1' })).body;
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);

  console.log('--- TEAM CHAT (admin <-> any profile)');
  let r = await call('/my-messages/team', 'GET', null, giver.token);
  out('1 donor opens team chat (empty):', r.status + ' messages=' + r.body.conversation.messages.length + ' | ' + r.body.conversation.lastText);
  r = await call('/my-messages/team/reply', 'POST', { text: 'Hello team, how long does approval take?' }, waiting.token);
  out('2 PENDING donor can message the team:', r.status + ' ' + r.body.conversation.messages[0].text.slice(0, 30));
  r = await call('/my-messages/team/reply', 'POST', { text: 'We need help with our profile' }, otherOrph.token);
  out('3 DRAFT orphanage can message the team:', r.status);
  const threads = (await call('/messages', 'GET', null, admin)).body.messages;
  out('4 admin inbox has them (account types):', threads.filter((t) => /Waiting|Other Chat Home/.test(t.senderName)).map((t) => t.accountType + ':' + (t.read ? 'read' : 'UNREAD')).join(', '));
  const wt = threads.find((t) => t.senderName === 'Waiting ' + stamp);
  const reply = (await call('/messages/' + wt.id, 'GET', null, admin)).body.message;
  reply.replies.push({ text: 'Usually within two days.', timestamp: new Date().toISOString(), sender: 'admin' });
  await call('/messages/' + wt.id, 'PUT', { replies: reply.replies, read: true }, admin);
  out('5 donor has an unread admin reply:', JSON.stringify((await call('/my-messages/unread', 'GET', null, waiting.token)).body));
  r = await call('/my-messages/team', 'GET', null, waiting.token);
  out('6 donor reads it:', r.body.conversation.messages.map((m) => (m.mine ? 'me' : 'team') + ': ' + m.text.slice(0, 22)).join(' | '));
  out('7 ... and it is now read:', JSON.stringify((await call('/my-messages/unread', 'GET', null, waiting.token)).body.unread));
  out('8 admin starts a thread with the partner:', (await call('/messages/thread', 'POST', { accountType: 'partner', accountId: prow.id, senderName: prow.name }, admin)).status);

  console.log('--- DIRECT CHATS');
  out('9 PENDING donor starts chat with an orphanage:', err(await call('/my-messages/chats', 'POST', { withType: 'orphanage', withId: oid, text: 'Hi' }, waiting.token)));
  out('10 approved donor sees verified orphanages only:', (await call('/my-messages/contacts', 'GET', null, giver.token)).body.contacts.map((c) => c.name.replace(' ' + stamp, '')).join(', '));
  r = await call('/my-messages/chats', 'POST', { withType: 'orphanage', withId: oid, text: 'Hello! How can I help with the beds?' }, giver.token);
  out('11 approved donor starts chat:', r.status + ' key=' + r.body.conversation.key + ' title=' + r.body.conversation.title.replace(' ' + stamp, ''));
  const doKey = r.body.conversation.key;
  out('12 donor cannot start chat with an unverified orphanage:', err(await call('/my-messages/chats', 'POST', { withType: 'orphanage', withId: oid2, text: 'Hi' }, giver.token)));
  out('13 orphanage (still draft) other home sees chats:', JSON.stringify((await call('/my-messages/chats', 'GET', null, otherOrph.token)).body.locked).slice(0, 60));

  r = await call('/my-messages/chats', 'GET', null, orph.token);
  out('14 orphanage inbox:', r.body.conversations.map((c) => c.title.replace(' ' + stamp, '') + (c.unread ? ' (unread)' : '')).join(', '));
  out('15 orphanage unread badge:', JSON.stringify((await call('/my-messages/unread', 'GET', null, orph.token)).body));
  r = await call('/my-messages/chats/' + doKey, 'GET', null, orph.token);
  out('16 orphanage opens it:', r.body.conversation.messages.map((m) => (m.mine ? 'me' : m.label.replace(' ' + stamp, '')) + ': ' + m.text.slice(0, 18)).join(' | '));
  r = await call('/my-messages/chats/' + doKey + '/messages', 'POST', { text: 'Thank you so much!' }, orph.token);
  out('17 orphanage replies:', r.status + ' ' + r.body.conversation.messages.length + ' messages');
  out('18 donor now has it unread:', (await call('/my-messages/chats', 'GET', null, giver.token)).body.conversations[0].unread);
  out('19 stranger donor cannot open that chat:', err(await call('/my-messages/chats/' + doKey, 'GET', null, stranger.token)));
  out('20 stranger cannot post into it:', err(await call('/my-messages/chats/' + doKey + '/messages', 'POST', { text: 'hi' }, stranger.token)));
  out('21 other orphanage cannot open it:', err(await call('/my-messages/chats/' + doKey, 'GET', null, otherOrph.token)));

  console.log('--- ORPHANAGE STARTS CHATS');
  const c = (await call('/my-messages/contacts', 'GET', null, orph.token)).body.contacts;
  out('22 orphanage contacts:', c.map((x) => x.type + ':' + x.name.replace(' ' + stamp, '')).join(', '));
  out('23 draft partner is NOT listed / stranger donor NOT listed:', (!c.some((x) => /Draft Partner/.test(x.name)) && !c.some((x) => /Stranger/.test(x.name))));
  out('24 orphanage -> stranger donor (never pledged):', err(await call('/my-messages/chats', 'POST', { withType: 'donor', withId: stranger.id, text: 'Hi' }, orph.token)));
  r = await call('/my-messages/chats', 'POST', { withType: 'partner', withId: prow.id, text: 'We would love to introduce our home.' }, orph.token);
  out('25 orphanage -> verified partner:', r.status + ' key=' + (r.body.conversation && r.body.conversation.key));
  const poKey = r.body.conversation.key;
  const pc = await call('/partner-auth/chats', 'GET', null, partner.token);
  out('26 partner sees the chat + unread:', pc.body.conversations.map((x) => x.title.replace(' ' + stamp, '') + (x.unread ? ' (unread)' : '')).join(', '));
  out('27 partner badge counts it:', JSON.stringify((await call('/partner-auth/messages/unread', 'GET', null, partner.token)).body));
  const oc = await call('/partner-auth/orphanages/' + oid + '/messages', 'GET', null, partner.token);
  out('28 partner opens (thread messages / orphanage name):', oc.body.thread.messages.map((m) => m.sender).join(',') + ' / ' + (oc.body.orphanageName || '').replace(' ' + stamp, ''));
  r = await call('/partner-auth/orphanages/' + oid + '/messages', 'POST', { text: 'Happy to talk. What do you need most?' }, partner.token);
  out('29 partner replies:', r.status);
  r = await call('/my-messages/chats/' + poKey, 'GET', null, orph.token);
  out('30 orphanage sees partner reply:', r.body.conversation.messages.map((m) => (m.mine ? 'me' : m.label.replace(' ' + stamp, '')) + ': ' + m.text.slice(0, 15)).join(' | '));
  out('31 draft partner cannot browse/chat:', (await call('/partner-auth/orphanages/' + oid + '/messages', 'POST', { text: 'hi' }, draftPartner.token)).status);

  console.log('--- SAFETY');
  out('32 empty message:', err(await call('/my-messages/chats/' + doKey + '/messages', 'POST', { text: '   ' }, orph.token)));
  out('33 3,000 characters:', err(await call('/my-messages/chats/' + doKey + '/messages', 'POST', { text: 'x'.repeat(3000) }, orph.token)));
  out('34 not logged in:', (await call('/my-messages/chats', 'GET')).status);
  out('35 admin token on user chat route:', (await call('/my-messages/chats', 'GET', null, admin)).status);
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'rejected' }, admin);
  out('36 partner later rejected: orphanage can still send?:', err(await call('/my-messages/chats/' + poKey + '/messages', 'POST', { text: 'Are you there?' }, orph.token)));
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  let limited = 0;
  for (let i = 0; i < 20; i++) { const x = await call('/my-messages/chats/' + doKey + '/messages', 'POST', { text: 'spam ' + i }, orph.token); if (x.status === 429) limited++; }
  out('37 flooding gets rate limited (blocked of 20):', limited);

  console.log('--- ADMIN MODERATION');
  r = await call('/conversations', 'GET', null, admin);
  out('38 admin sees all peer chats:', r.body.conversations.filter((x) => x.orphanageName === 'Chat Home ' + stamp).map((x) => x.kindLabel + ' (' + x.messageCount + ' msgs)').join(' | '));
  r = await call('/conversations/' + doKey, 'GET', null, admin);
  out('39 admin reads one:', r.body.conversation.messages.slice(0, 3).map((m) => m.label.replace(' ' + stamp, '') + ': ' + m.text.slice(0, 14)).join(' | '));
  r = await call('/conversations/' + doKey + '/reply', 'POST', { text: 'The team is following this chat.' }, admin);
  out('40 admin steps in:', r.status);
  const seen = (await call('/my-messages/chats/' + doKey, 'GET', null, giver.token)).body.conversation.messages.slice(-1)[0];
  out('41 donor sees it as the team:', seen.label + ': ' + seen.text);
  r = await call('/conversations/' + doKey + '/messages/0', 'DELETE', null, admin);
  out('42 admin removes a message:', r.status + ' -> "' + r.body.conversation.messages[0].text.slice(0, 40) + '"');
  out('43 non-admin cannot use the admin route:', (await call('/conversations', 'GET', null, giver.token)).status);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
