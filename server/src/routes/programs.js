const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToProgram(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    description: row.description,
    fundingGoal: row.funding_goal,
    amountRaised: row.amount_raised,
    childrenBenefiting: row.children_benefiting,
    objectives: row.objectives,
    activities: row.activities,
  };
}

const FIELD_MAP = {
  name: 'name',
  category: 'category',
  status: 'status',
  description: 'description',
  fundingGoal: 'funding_goal',
  amountRaised: 'amount_raised',
  childrenBenefiting: 'children_benefiting',
  objectives: 'objectives',
  activities: 'activities',
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

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM programs ORDER BY id DESC').all();
  res.json({ programs: rows.map(rowToProgram) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Program not found.' });
  res.json({ program: rowToProgram(row) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const columns = bodyToColumns(body);
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO programs (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = db.prepare(sql).run(...keys.map((k) => columns[k]));

  const row = db.prepare('SELECT * FROM programs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ program: rowToProgram(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM programs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Program not found.' });

  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE programs SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => columns[k]), req.params.id);
  }

  const row = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  res.json({ program: rowToProgram(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM programs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Program not found.' });
  res.status(204).send();
});

module.exports = router;
