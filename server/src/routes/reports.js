const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function rowToReport(row) {
  return {
    id: row.id,
    reporterName: row.reporter_name,
    reporterAccountType: row.reporter_account_type,
    reportedAccountType: row.reported_account_type,
    reportedAccountId: row.reported_account_id,
    reportedAccountName: row.reported_account_name,
    reasonCategory: row.reason_category,
    details: row.details,
    timestamp: row.timestamp,
    status: row.status,
    resolution: row.resolution,
  };
}

const FIELD_MAP = {
  reporterName: 'reporter_name',
  reporterAccountType: 'reporter_account_type',
  reportedAccountType: 'reported_account_type',
  reportedAccountId: 'reported_account_id',
  reportedAccountName: 'reported_account_name',
  reasonCategory: 'reason_category',
  details: 'details',
  timestamp: 'timestamp',
  status: 'status',
  resolution: 'resolution',
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
  const rows = db.prepare('SELECT * FROM reports ORDER BY id DESC').all();
  res.json({ reports: rows.map(rowToReport) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Report not found.' });
  res.json({ report: rowToReport(row) });
});

router.post('/', (req, res) => {
  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO reports (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = db.prepare(sql).run(...keys.map((k) => columns[k]));

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ report: rowToReport(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM reports WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Report not found.' });

  const columns = bodyToColumns(req.body || {});
  const keys = Object.keys(columns);

  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE reports SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => columns[k]), req.params.id);
  }

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  res.json({ report: rowToReport(row) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Report not found.' });
  res.status(204).send();
});

module.exports = router;
