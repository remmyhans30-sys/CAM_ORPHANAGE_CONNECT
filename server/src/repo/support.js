const db = require('../db');
const { HttpError } = require('../errors');

// The conversation between one member (donor, orphanage or partner) and the CAM team: one
// 'support' conversation per member, one row per message. The admin pages see each one as a
// single object: the first message as "body", the rest as "replies".

const STATUS_OUT = { open: 'open', in_progress: 'in-progress', resolved: 'resolved', closed: 'closed' };
const STATUS_IN = { open: 'open', 'in-progress': 'in_progress', in_progress: 'in_progress', resolved: 'resolved', closed: 'closed' };
const ACCOUNT_TYPE = { donor: 'donor', orphanage: 'orphanage', partner: 'partner' };

const BASE = `
  SELECT c.*, u.display_name, u.role, o.id AS orphanage_id, p.id AS partner_id
  FROM conversations c
  JOIN users u ON u.id = c.support_user_id
  LEFT JOIN orphanages o ON o.owner_user_id = u.id
  LEFT JOIN partner_organizations p ON p.owner_user_id = u.id
  WHERE c.kind = 'support'`;

function accountId(row) {
  if (row.role === 'orphanage') return row.orphanage_id;
  if (row.role === 'partner') return row.partner_id;
  return row.support_user_id;
}

async function hydrate(rows) {
  if (rows.length === 0) return [];
  const messages = new Map(rows.map((r) => [r.id, []]));
  (await db.q('SELECT * FROM messages WHERE conversation_id IN (?) ORDER BY id', [rows.map((r) => r.id)]))
    .forEach((m) => messages.get(m.conversation_id).push(m));

  return rows.map((c) => {
    const list = messages.get(c.id);
    const first = list[0] || null;
    const lastMember = list.filter((m) => m.sender_kind === 'member').pop();
    const read = !lastMember || (c.staff_last_read_message_id !== null && c.staff_last_read_message_id >= lastMember.id);
    return {
      id: c.id,
      senderName: c.display_name,
      accountType: ACCOUNT_TYPE[c.role],
      accountId: accountId(c),
      subject: c.subject || 'Conversation with ' + c.display_name,
      body: first ? first.body : '',
      timestamp: db.isoTime(first ? first.created_at : c.created_at),
      read: read,
      fromAdmin: first ? first.sender_kind !== 'member' : true,
      autoReplied: list.some((m) => m.sender_kind === 'auto'),
      replies: list.slice(1).map((m) => {
        const reply = { text: m.body, timestamp: db.isoTime(m.created_at), sender: m.sender_kind === 'member' ? ACCOUNT_TYPE[c.role] : 'admin' };
        if (m.sender_kind === 'auto') reply.auto = true;
        return reply;
      }),
      status: STATUS_OUT[c.status],
      priority: c.priority,
      // for the member's own view
      supportUserId: c.support_user_id,
      messages: list,
    };
  });
}

async function list() {
  return hydrate(await db.q(BASE + ' ORDER BY c.id DESC'));
}

async function get(id) {
  const rows = await hydrate(await db.q(BASE + ' AND c.id = ?', [id]));
  return rows[0] || null;
}

async function forUser(userId) {
  const rows = await hydrate(await db.q(BASE + ' AND c.support_user_id = ?', [userId]));
  return rows[0] || null;
}

// The login behind an account the admin picked: { donor | orphanage | partner } + its id.
async function userIdFor(accountType, accountId) {
  let row = null;
  if (accountType === 'donor') row = await db.one("SELECT id FROM users WHERE id = ? AND role = 'donor'", [accountId]);
  else if (accountType === 'orphanage') row = await db.one('SELECT owner_user_id AS id FROM orphanages WHERE id = ?', [accountId]);
  else if (accountType === 'partner') row = await db.one('SELECT owner_user_id AS id FROM partner_organizations WHERE id = ?', [accountId]);
  return row ? row.id : null;
}

async function ensureForUser(userId) {
  const existing = await db.one("SELECT id FROM conversations WHERE kind = 'support' AND support_user_id = ?", [userId]);
  if (existing) return get(existing.id);
  const user = await db.one('SELECT display_name FROM users WHERE id = ?', [userId]);
  const result = await db.run("INSERT INTO conversations (kind, subject, support_user_id) VALUES ('support', ?, ?)", ['Conversation with ' + user.display_name, userId]);
  return get(result.insertId);
}

async function addMessage(conversationId, senderUserId, kind, body, at) {
  await db.run(
    'INSERT INTO messages (conversation_id, sender_user_id, sender_kind, body, created_at) VALUES (?, ?, ?, ?, ?)',
    [conversationId, kind === 'auto' ? null : senderUserId, kind, String(body).trim(), db.sqlTime(at)]
  );
}

// The member writes to the team.
async function memberSends(userId, text) {
  const conversation = await ensureForUser(userId);
  await addMessage(conversation.id, userId, 'member', text);
  await markSeenByMember(conversation.id, userId);
  return get(conversation.id);
}

async function markSeenByMember(conversationId, userId) {
  await db.run(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
     SELECT ?, ?, COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?
     ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id)`,
    [conversationId, userId, conversationId]
  );
}

// Has the team written since this member last opened the conversation?
async function unreadForMember(conversationId, userId) {
  const row = await db.one(
    `SELECT COUNT(*) AS n FROM messages m
     LEFT JOIN conversation_reads r ON r.conversation_id = m.conversation_id AND r.user_id = ?
     WHERE m.conversation_id = ? AND m.sender_kind IN ('staff', 'auto') AND m.removed_at IS NULL
       AND m.id > COALESCE(r.last_read_message_id, 0)`,
    [userId, conversationId]
  );
  return row.n > 0;
}

// Saves the admin's edits of a team thread (status, priority, read, new replies).
async function save(id, body, actor) {
  const current = await get(id);
  if (!current) return null;

  await db.tx(async () => {
    const sets = {};
    if (body.status !== undefined) {
      if (!STATUS_IN[body.status]) throw new HttpError(400, 'Unknown status.');
      sets.status = STATUS_IN[body.status];
    }
    if (body.priority !== undefined) {
      if (!['low', 'normal', 'high', 'urgent'].includes(body.priority)) throw new HttpError(400, 'Unknown priority.');
      sets.priority = body.priority;
    }
    if (body.subject !== undefined && body.subject) sets.subject = String(body.subject).slice(0, 200);
    const columns = Object.keys(sets);
    if (columns.length > 0) {
      await db.run('UPDATE conversations SET ' + columns.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', [...columns.map((c) => sets[c]), id]);
    }

    // Anything beyond the messages already stored is new.
    // A partial update (only replies, say) keeps the first message as it is stored.
    const incoming = [];
    const firstText = body.body !== undefined ? body.body : current.body;
    const firstFromAdmin = body.body !== undefined ? body.fromAdmin : current.fromAdmin;
    if (firstText) incoming.push({ text: firstText, timestamp: body.timestamp || current.timestamp, from: firstFromAdmin ? 'admin' : 'member' });
    (body.replies || []).forEach((r) => {
      if (r && r.text) incoming.push({ text: r.text, timestamp: r.timestamp, from: r.auto ? 'auto' : (r.sender === 'admin' ? 'admin' : 'member') });
    });
    for (const entry of incoming.slice(current.messages.length)) {
      if (entry.from === 'admin') await addMessage(id, actor.userId, 'staff', entry.text, entry.timestamp);
      else if (entry.from === 'auto') await addMessage(id, null, 'auto', entry.text, entry.timestamp);
      else await addMessage(id, current.supportUserId, 'member', entry.text, entry.timestamp);
    }

    if (body.read === true) {
      await db.run('UPDATE conversations SET staff_last_read_message_id = (SELECT MAX(id) FROM messages WHERE conversation_id = ?) WHERE id = ?', [id, id]);
    }
  });

  return get(id);
}

async function remove(id) {
  const result = await db.run("DELETE FROM conversations WHERE id = ? AND kind = 'support'", [id]);
  return result.affectedRows > 0;
}

module.exports = { list, get, forUser, userIdFor, ensureForUser, memberSends, markSeenByMember, unreadForMember, save, remove };
