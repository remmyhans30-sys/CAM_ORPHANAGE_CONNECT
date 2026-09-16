const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToNeed(row) {
  return {
    id: row.id,
    orphanageId: row.orphanage_id,
    title: row.title,
    goal: row.goal,
    raised: row.raised,
    percent: row.percent,
    date: row.date,
  };
}

const FIELD_MAP = {
  orphanageId: 'orphanage_id',
  title: 'title',
  goal: 'goal',
  raised: 'raised',
  percent: 'percent',
  date: 'date',
};

function bodyToColumns(body) {
  const columns = {};
  Object.keys(FIELD_MAP).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      columns[FIELD_MAP[key]] = body[key];
    }
  });
  return columns;
}

function isForeignKeyError(err) {
  return err && /FOREIGN KEY constraint failed/i.test(err.message || '');
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM needs ORDER BY id DESC').all();
  res.json({ needs: rows.map(rowToNeed) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM needs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Need not found.' });
  res.json({ need: rowToNeed(row) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.title || !body.title.trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!body.orphanageId) {
    return res.status(400).json({ error: 'An orphanage must be selected.' });
  }

  const columns = bodyToColumns(body);
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO needs (${keys.join(', ')}) VALUES (${placeholders})`;

  let result;
  try {
    result = db.prepare(sql).run(...keys.map((k) => columns[k]));
  } catch (err) {
    if (isForeignKeyError(err)) {
      return res.status(400).json({ error: 'That orphanage does not exist.' });
    }
    throw err;
  }

  const row = db.prepare('SELECT * FROM needs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ need: rowToNeed(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM needs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Need not found.' });

  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    try {
      db.prepare(`UPDATE needs SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .run(...keys.map((k) => columns[k]), req.params.id);
    } catch (err) {
      if (isForeignKeyError(err)) {
        return res.status(400).json({ error: 'That orphanage does not exist.' });
      }
      throw err;
    }
  }

  const row = db.prepare('SELECT * FROM needs WHERE id = ?').get(req.params.id);
  res.json({ need: rowToNeed(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM needs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Need not found.' });
  res.status(204).send();
});

module.exports = router;
