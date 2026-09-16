const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToMessage(row) {
  return {
    id: row.id,
    senderName: row.sender_name,
    accountType: row.account_type,
    accountId: row.account_id,
    subject: row.subject,
    body: row.body,
    timestamp: row.timestamp,
    read: Boolean(row.read),
    fromAdmin: Boolean(row.from_admin),
    autoReplied: Boolean(row.auto_replied),
    replies: JSON.parse(row.replies),
  };
}

const FIELD_MAP = {
  senderName: 'sender_name',
  accountType: 'account_type',
  accountId: 'account_id',
  subject: 'subject',
  body: 'body',
  timestamp: 'timestamp',
  read: 'read',
  fromAdmin: 'from_admin',
  autoReplied: 'auto_replied',
};

const BOOLEAN_COLUMNS = new Set(['read', 'from_admin', 'auto_replied']);

function bodyToColumns(body) {
  const columns = {};
  Object.keys(FIELD_MAP).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const column = FIELD_MAP[key];
      const value = body[key];
      columns[column] = BOOLEAN_COLUMNS.has(column) ? (value ? 1 : 0) : value;
    }
  });
  if (Object.prototype.hasOwnProperty.call(body, 'replies')) {
    columns.replies = JSON.stringify(body.replies || []);
  }
  return columns;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY id DESC').all();
  res.json({ messages: rows.map(rowToMessage) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found.' });
  res.json({ message: rowToMessage(row) });
});

router.post('/thread', (req, res) => {
  const { accountType, accountId, senderName } = req.body || {};
  if (!accountType || accountId === undefined || accountId === null) {
    return res.status(400).json({ error: 'accountType and accountId are required.' });
  }

  const existing = db.prepare('SELECT * FROM messages WHERE account_type = ? AND account_id = ?').get(accountType, accountId);
  if (existing) {
    return res.json({ message: rowToMessage(existing) });
  }

  const columns = {
    sender_name: senderName || 'Unknown',
    account_type: accountType,
    account_id: accountId,
    subject: 'Conversation with ' + (senderName || 'Unknown'),
    body: '',
    timestamp: new Date().toISOString(),
    read: 1,
    from_admin: 1,
  };
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const result = db.prepare(`INSERT INTO messages (${keys.join(', ')}) VALUES (${placeholders})`)
    .run(...keys.map((k) => columns[k]));

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: rowToMessage(row) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const columns = bodyToColumns(body);
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO messages (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = db.prepare(sql).run(...keys.map((k) => columns[k]));

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: rowToMessage(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM messages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Message not found.' });

  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE messages SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => columns[k]), req.params.id);
  }

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  res.json({ message: rowToMessage(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found.' });
  res.status(204).send();
});

module.exports = router;
