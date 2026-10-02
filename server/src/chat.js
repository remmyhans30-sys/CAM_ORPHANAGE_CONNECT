const db = require('./db');
const { HttpError } = require('./errors');

// Direct messages between an orphanage and a donor or partner. Each pair has one 'direct'
// conversation (conversations table) with one row per message (messages table).
// Keys the pages use: 'po-<id>' (partner and orphanage) and 'do-<id>' (donor and orphanage),
// where <id> is the conversation id.
// Messages are shown as { text, timestamp, sender } with sender 'partner', 'donor',
// 'orphanage' or 'admin' (the CAM Orphanage Connect team, who can read and join any chat).

const MAX_TEXT = 2000;
const RATE_LIMIT = 15; // messages
const RATE_WINDOW_MS = 60 * 1000;
const REMOVED_TEXT = '[Message removed by the CAM Orphanage Connect team]';

const OTHER_KIND = { partner: 'po', donor: 'do' };

// A refusal the page should show as a message (extra.code lets the page react, e.g. 'locked').
class ChatError extends HttpError {
  constructor(status, message, code) {
    super(status, message, code ? { code: code } : {});
    this.code = code;
  }
}

function parseKey(key) {
  const match = /^(po|do)-(\d+)$/.exec(String(key || ''));
  if (!match) throw new ChatError(404, 'Conversation not found.');
  return { kind: match[1], id: Number(match[2]) };
}

function cleanText(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw new ChatError(400, 'Please type a message.');
  if (text.length > MAX_TEXT) throw new ChatError(400, 'That message is too long. The limit is ' + MAX_TEXT + ' characters.');
  return text;
}

// A small in-memory limiter so nobody can flood a conversation.
const recent = new Map();
function checkRate(actorKey) {
  const now = Date.now();
  const times = (recent.get(actorKey) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) {
    throw new ChatError(429, 'You are sending messages too quickly. Please wait a moment.');
  }
  times.push(now);
  recent.set(actorKey, times);
}

// ---- loading threads ------------------------------------------------------------

// Who is behind a login, as the chat shows them: the orphanage, partner organization or donor.
async function peopleFor(userIds) {
  const people = new Map();
  if (userIds.length === 0) return people;
  const rows = await db.q(
    `SELECT u.id, u.role, u.display_name, o.id AS orphanage_id, o.name AS orphanage_name, p.id AS partner_id, p.name AS partner_name
     FROM users u
     LEFT JOIN orphanages o ON o.owner_user_id = u.id
     LEFT JOIN partner_organizations p ON p.owner_user_id = u.id
     WHERE u.id IN (?)`, [userIds]);
  rows.forEach((r) => {
    if (r.role === 'orphanage') people.set(r.id, { userId: r.id, type: 'orphanage', id: r.orphanage_id, name: r.orphanage_name || r.display_name });
    else if (r.role === 'partner') people.set(r.id, { userId: r.id, type: 'partner', id: r.partner_id, name: r.partner_name || r.display_name });
    else people.set(r.id, { userId: r.id, type: 'donor', id: r.id, name: r.display_name });
  });
  return people;
}

async function hydrate(conversations) {
  if (conversations.length === 0) return [];
  const ids = conversations.map((c) => c.id);
  const messages = new Map(ids.map((id) => [id, []]));
  (await db.q('SELECT * FROM messages WHERE conversation_id IN (?) ORDER BY id', [ids])).forEach((m) => messages.get(m.conversation_id).push(m));

  const reads = new Map();
  (await db.q('SELECT * FROM conversation_reads WHERE conversation_id IN (?)', [ids]))
    .forEach((r) => reads.set(r.conversation_id + ':' + r.user_id, r.last_read_message_id));

  const people = await peopleFor([...new Set(conversations.flatMap((c) => [c.user_low_id, c.user_high_id]))]);

  return conversations.map((c) => {
    const a = people.get(c.user_low_id);
    const b = people.get(c.user_high_id);
    const orphanage = a && a.type === 'orphanage' ? a : b;
    const other = orphanage === a ? b : a;
    return {
      id: c.id,
      kind: other ? OTHER_KIND[other.type] : 'do',
      orphanage: orphanage || { userId: 0, type: 'orphanage', id: 0, name: 'Orphanage' },
      other: other || { userId: 0, type: 'donor', id: 0, name: 'Deleted account' },
      messages: messages.get(c.id).map((m) => ({
        id: m.id,
        text: m.removed_at ? REMOVED_TEXT : m.body,
        timestamp: db.isoTime(m.created_at),
        sender: m.sender_kind === 'member' && !m.removed_at
          ? (m.sender_user_id === (orphanage && orphanage.userId) ? 'orphanage' : (other ? other.type : 'donor'))
          : 'admin',
        senderUserId: m.sender_user_id,
      })),
      lastRead: (userId) => reads.get(c.id + ':' + userId) || 0,
      updatedAt: db.isoTime(c.last_message_at || c.updated_at),
    };
  });
}

const DIRECT = "SELECT * FROM conversations WHERE kind = 'direct'";

async function getThread(key) {
  const { kind, id } = parseKey(key);
  const rows = await hydrate(await db.q(DIRECT + ' AND id = ?', [id]));
  if (rows.length === 0 || rows[0].kind !== kind) throw new ChatError(404, 'Conversation not found.');
  return rows[0];
}

async function threadById(id) {
  const rows = await hydrate(await db.q(DIRECT + ' AND id = ?', [id]));
  return rows[0] || null;
}

async function allThreads() {
  return hydrate(await db.q(DIRECT + ' ORDER BY id'));
}

// The conversations a login takes part in.
async function threadsOf(userId) {
  return hydrate(await db.q(DIRECT + ' AND (user_low_id = ? OR user_high_id = ?) ORDER BY id', [userId, userId]));
}

// ---- reading and writing --------------------------------------------------------

function userOfSide(thread, side) {
  return side === 'orphanage' ? thread.orphanage.userId : thread.other.userId;
}

function textsOf(thread) {
  return thread.messages;
}

// Has the other side (or the team) written since `side` last opened the conversation?
function isUnread(thread, side) {
  const readUpTo = thread.lastRead(userOfSide(thread, side));
  return thread.messages.some((m) => m.id > readUpTo && m.senderUserId !== userOfSide(thread, side));
}

async function markSeen(thread, side) {
  await db.run(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
     SELECT ?, ?, COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?
     ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id)`,
    [thread.id, userOfSide(thread, side), thread.id]
  );
}

// `side` is 'orphanage', 'partner', 'donor' (a member) or 'admin' (the team, with the admin's user id).
async function appendMessage(thread, side, text, adminUserId) {
  if (side === 'admin') {
    await db.run("INSERT INTO messages (conversation_id, sender_user_id, sender_kind, body) VALUES (?, ?, 'staff', ?)", [thread.id, adminUserId, text]);
  } else {
    await db.run("INSERT INTO messages (conversation_id, sender_user_id, sender_kind, body) VALUES (?, ?, 'member', ?)", [thread.id, userOfSide(thread, side), text]);
  }
  return threadById(thread.id);
}

async function removeMessage(thread, index, adminUserId) {
  const message = thread.messages[index];
  if (!message) throw new ChatError(404, 'Message not found.');
  await db.run('UPDATE messages SET removed_at = ?, removed_by = ? WHERE id = ?', [db.sqlTime(), adminUserId, message.id]);
  return threadById(thread.id);
}

async function deleteThread(id) {
  const result = await db.run("DELETE FROM conversations WHERE id = ? AND kind = 'direct'", [id]);
  return result.affectedRows > 0;
}

async function findOrCreateThread(orphanageUserId, otherUserId) {
  const low = Math.min(orphanageUserId, otherUserId);
  const high = Math.max(orphanageUserId, otherUserId);
  const existing = await db.one("SELECT id FROM conversations WHERE kind = 'direct' AND user_low_id = ? AND user_high_id = ?", [low, high]);
  if (existing) return threadById(existing.id);
  const result = await db.run("INSERT INTO conversations (kind, user_low_id, user_high_id) VALUES ('direct', ?, ?)", [low, high]);
  return threadById(result.insertId);
}

// ---- how the pages see a conversation -------------------------------------------

// The conversation as one participant sees it. `side` is 'orphanage', 'partner' or 'donor'.
function viewFor(thread, side) {
  const counterpart = side === 'orphanage' ? thread.other : thread.orphanage;
  const last = thread.messages[thread.messages.length - 1] || null;

  return {
    key: thread.kind + '-' + thread.id,
    kind: thread.kind,
    title: counterpart.name,
    counterpartType: counterpart.type,
    counterpartId: counterpart.id,
    unread: isUnread(thread, side),
    lastText: last ? last.text.slice(0, 80) : '',
    lastAt: last ? last.timestamp : thread.updatedAt,
    messages: thread.messages.map((m) => ({
      text: m.text,
      timestamp: m.timestamp,
      mine: m.sender === side,
      label: m.sender === side ? 'You' : m.sender === 'admin' ? 'CAM Orphanage Connect team' : counterpart.name,
    })),
  };
}

// The same conversation for the admin's moderation page.
function viewForAdmin(thread) {
  const last = thread.messages[thread.messages.length - 1] || null;
  const labels = { orphanage: thread.orphanage.name, admin: 'CAM team' };
  labels[thread.other.type] = thread.other.name;

  return {
    key: thread.kind + '-' + thread.id,
    kind: thread.kind,
    kindLabel: thread.kind === 'po' ? 'Partner and orphanage' : 'Donor and orphanage',
    orphanageName: thread.orphanage.name,
    otherName: thread.other.name,
    otherType: thread.other.type,
    lastText: last ? last.text.slice(0, 100) : '',
    lastAt: last ? last.timestamp : thread.updatedAt,
    messageCount: thread.messages.length,
    messages: thread.messages.map((m) => ({ text: m.text, timestamp: m.timestamp, sender: m.sender, label: labels[m.sender] || m.sender })),
  };
}

module.exports = {
  ChatError, MAX_TEXT, parseKey, getThread, threadById, allThreads, threadsOf, cleanText, checkRate, textsOf,
  appendMessage, removeMessage, deleteThread, markSeen, isUnread, viewFor, viewForAdmin, findOrCreateThread,
};
