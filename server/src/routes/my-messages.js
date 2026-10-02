const express = require('express');
const db = require('../db');
const { memberActor } = require('../middleware/memberActor');
const orphanages = require('../repo/orphanages');
const partners = require('../repo/partners');
const donors = require('../repo/donors');
const support = require('../repo/support');
const chat = require('../chat');

// Messages for the signed-in donor, orphanage or partner:
//   /team   the conversation with the CAM Orphanage Connect team
//   /chats  direct messages between orphanages and the donors / partners they work with
const router = express.Router();

// A signed-in donor, orphanage or partner (partners have their own kind of login token).
router.use(memberActor);

// ---------------------------------------------------------------- team thread

// The team conversation in the same shape as a direct chat, so one screen can show both.
async function teamView(actor) {
  const conv = await support.forUser(actor.userId);
  const messages = conv ? conv.messages.filter((m) => !m.removed_at) : [];
  const last = messages[messages.length - 1] || null;

  return {
    key: 'team',
    kind: 'team',
    title: 'CAM Orphanage Connect team',
    counterpartType: 'team',
    counterpartId: 0,
    unread: conv ? await support.unreadForMember(conv.id, actor.userId) : false,
    lastText: last ? last.body.slice(0, 80) : 'Ask the team anything.',
    lastAt: last ? db.isoTime(last.created_at) : null,
    messages: messages.map((m) => ({
      text: m.body,
      timestamp: db.isoTime(m.created_at),
      mine: m.sender_kind === 'member',
      label: m.sender_kind === 'member' ? 'You' : 'CAM Orphanage Connect team',
    })),
  };
}

router.get('/team', async (req, res) => {
  const conv = await support.forUser(req.actor.userId);
  if (conv) await support.markSeenByMember(conv.id, req.actor.userId);
  res.json({ conversation: await teamView(req.actor) });
});

router.post('/team/reply', async (req, res) => {
  const text = chat.cleanText(req.body && req.body.text);
  chat.checkRate(req.actor.side + '-' + req.actor.id);
  await support.memberSends(req.actor.userId, text);
  res.status(201).json({ conversation: await teamView(req.actor) });
});

// ---------------------------------------------------------------- direct chats

// Who can this person chat with, and are they allowed to right now?
function eligibility(actor) {
  if (actor.side === 'partner') {
    if (actor.partner.verificationStatus !== 'verified') {
      return { ok: false, reason: 'Chats with orphanages open once the CAM Orphanage Connect team has verified your organization.' };
    }
    return { ok: true };
  }
  if (actor.side === 'orphanage') {
    if (actor.orphanage.status !== 'verified') {
      return { ok: false, reason: 'Chats with donors and partners open once the CAM Orphanage Connect team has verified your orphanage.' };
    }
    return { ok: true };
  }
  if (!actor.access.ok) return { ok: false, reason: actor.access.error };
  return { ok: true };
}

function requireEligible(actor) {
  const e = eligibility(actor);
  if (!e.ok) throw new chat.ChatError(403, e.reason, 'locked');
}

async function ownThread(actor, key) {
  const thread = await chat.getThread(key);
  const mine = actor.side === 'orphanage'
    ? thread.orphanage.userId === actor.userId
    : thread.other.userId === actor.userId && thread.other.type === actor.side;
  if (!mine) throw new chat.ChatError(404, 'Conversation not found.');
  return thread;
}

// Both sides must still be in good standing for a conversation to continue.
async function assertBothApproved(thread) {
  const home = await db.one('SELECT verification_status FROM orphanages WHERE id = ?', [thread.orphanage.id]);
  if (!home || home.verification_status !== 'verified') {
    throw new chat.ChatError(403, 'This orphanage is not verified, so chatting is paused.', 'locked');
  }
  if (thread.kind === 'do') {
    const donor = await db.one('SELECT approval_status FROM donor_profiles WHERE user_id = ?', [thread.other.userId]);
    if (!donor || donor.approval_status !== 'active') throw new chat.ChatError(403, 'This donor account is not active, so chatting is paused.', 'locked');
  } else {
    const partner = await db.one('SELECT verification_status FROM partner_organizations WHERE id = ?', [thread.other.id]);
    if (!partner || partner.verification_status !== 'verified') throw new chat.ChatError(403, 'This partner is not verified, so chatting is paused.', 'locked');
  }
}

async function threadsFor(actor) {
  return chat.threadsOf(actor.userId);
}

const withoutMessages = (view) => { delete view.messages; return view; };

router.get('/chats', async (req, res) => {
  const e = eligibility(req.actor);
  const conversations = (await threadsFor(req.actor))
    .filter((t) => t.messages.length > 0)
    .map((t) => withoutMessages(chat.viewFor(t, req.actor.side)))
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ conversations: conversations, locked: e.ok ? null : e.reason });
});

router.get('/chats/:key', async (req, res) => {
  const thread = await ownThread(req.actor, req.params.key);
  await chat.markSeen(thread, req.actor.side);
  res.json({ conversation: chat.viewFor(await chat.threadById(thread.id), req.actor.side) });
});

router.post('/chats/:key/messages', async (req, res) => {
  requireEligible(req.actor);
  const text = chat.cleanText(req.body && req.body.text);
  const thread = await ownThread(req.actor, req.params.key);
  await assertBothApproved(thread);

  chat.checkRate(req.actor.side + '-' + req.actor.id);
  const updated = await chat.appendMessage(thread, req.actor.side, text);
  await chat.markSeen(updated, req.actor.side);
  res.status(201).json({ conversation: chat.viewFor(await chat.threadById(thread.id), req.actor.side) });
});

// Who can this person start a conversation with?
async function contactsFor(actor) {
  if (actor.side === 'orphanage') {
    const partnerList = (await partners.verifiedList())
      .map((p) => ({ type: 'partner', id: p.id, name: p.name, subtitle: [p.orgType, p.country].filter(Boolean).join(' · ') }));
    // Donors are only listed once they have given to this orphanage (and chose to show their name).
    const donorList = (await db.q(
      `SELECT DISTINCT u.id, u.display_name, dp.location_text
       FROM donations d
       JOIN users u ON u.id = d.giver_user_id AND u.role = 'donor'
       JOIN donor_profiles dp ON dp.user_id = u.id
       WHERE d.orphanage_id = ? AND d.is_anonymous = 0 AND d.status IN ('pledged', 'completed') AND dp.approval_status = 'active'
       ORDER BY u.display_name`, [actor.id]))
      .map((d) => ({ type: 'donor', id: d.id, name: d.display_name, subtitle: d.location_text || 'Donor' }));
    return partnerList.concat(donorList);
  }
  return (await orphanages.verifiedList()).map((o) => ({ type: 'orphanage', id: o.id, name: o.name, subtitle: o.location || '' }));
}

router.get('/contacts', async (req, res) => {
  const e = eligibility(req.actor);
  res.json({ contacts: e.ok ? await contactsFor(req.actor) : [], locked: e.ok ? null : e.reason });
});

router.post('/chats', async (req, res) => {
  requireEligible(req.actor);
  const { withType, withId } = req.body || {};
  const text = chat.cleanText(req.body && req.body.text);
  const target = (await contactsFor(req.actor)).find((c) => c.type === withType && c.id === Number(withId));
  if (!target) throw new chat.ChatError(404, 'You cannot start a conversation with that account.');

  let orphanageUserId;
  let otherUserId;
  if (req.actor.side === 'orphanage') {
    orphanageUserId = req.actor.userId;
    otherUserId = target.type === 'partner' ? (await partners.get(target.id)).ownerUserId : target.id;
  } else {
    otherUserId = req.actor.userId;
    orphanageUserId = (await orphanages.get(target.id)).ownerUserId;
  }

  chat.checkRate(req.actor.side + '-' + req.actor.id);
  let thread = await chat.findOrCreateThread(orphanageUserId, otherUserId);
  thread = await chat.appendMessage(thread, req.actor.side, text);
  await chat.markSeen(thread, req.actor.side);
  res.status(201).json({ conversation: chat.viewFor(await chat.threadById(thread.id), req.actor.side) });
});

// Everything for the conversation list in one call. Unlike opening a conversation, this
// does not mark anything as read, so the unread dots stay accurate while the list refreshes.
router.get('/overview', async (req, res) => {
  const e = eligibility(req.actor);
  const team = await teamView(req.actor);
  delete team.messages;
  const chats = (await threadsFor(req.actor))
    .filter((t) => t.messages.length > 0)
    .map((t) => withoutMessages(chat.viewFor(t, req.actor.side)))
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ conversations: [team].concat(chats), locked: e.ok ? null : e.reason });
});

// ---------------------------------------------------------------- unread badge

router.get('/unread', async (req, res) => {
  const conv = await support.forUser(req.actor.userId);
  const team = conv ? await support.unreadForMember(conv.id, req.actor.userId) : false;
  const chats = (await threadsFor(req.actor)).filter((t) => chat.isUnread(t, req.actor.side)).length;
  res.json({ unread: (team ? 1 : 0) + chats, team: team, chats: chats });
});

module.exports = router;
