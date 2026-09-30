const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToThread(row) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    partnerName: row.partner_name,
    orphanageId: row.orphanage_id,
    orphanageName: row.orphanage_name,
    messages: JSON.parse(row.messages || '[]'),
    updatedAt: row.updated_at,
  };
}

const SELECT_WITH_NAMES = `
  SELECT t.*, p.name AS partner_name, o.name AS orphanage_name
  FROM partner_orphanage_threads t
  JOIN partners p ON p.id = t.partner_id
  JOIN orphanages o ON o.id = t.orphanage_id
`;

router.get('/', (req, res) => {
  const rows = db.prepare(`${SELECT_WITH_NAMES} ORDER BY t.updated_at DESC`).all();
  res.json({ threads: rows.map(rowToThread) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`${SELECT_WITH_NAMES} WHERE t.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Thread not found.' });
  res.json({ thread: rowToThread(row) });
});

router.post('/:id/reply', (req, res) => {
  const text = ((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message text is required.' });

  const existing = db.prepare('SELECT * FROM partner_orphanage_threads WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Thread not found.' });

  const messages = JSON.parse(existing.messages || '[]');
  messages.push({ text: text, timestamp: new Date().toISOString(), sender: 'admin' });

  db.prepare("UPDATE partner_orphanage_threads SET messages = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(messages), req.params.id);

  const row = db.prepare(`${SELECT_WITH_NAMES} WHERE t.id = ?`).get(req.params.id);
  res.json({ thread: rowToThread(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM partner_orphanage_threads WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Thread not found.' });
  res.status(204).send();
});

module.exports = router;
