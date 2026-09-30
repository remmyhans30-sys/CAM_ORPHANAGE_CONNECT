const express = require('express');
const db = require('../db');
const { authenticateUser } = require('../middleware/userAuth');

// Donor pledges: the amount is recorded and counted toward the need; no money is charged.
const router = express.Router();
router.use(authenticateUser);

const MIN_PLEDGE = 500;

function rowToPledge(row) {
  return {
    id: row.id,
    needId: row.need_id,
    needTitle: row.need_title,
    orphanageName: row.orphanage_name,
    amount: row.amount,
    anonymous: Boolean(row.anonymous),
    createdAt: row.created_at,
  };
}

router.post('/', (req, res) => {
  if (req.user.role !== 'user') {
    return res.status(403).json({ error: 'Only donor accounts can make pledges.' });
  }

  const { needId, amount, anonymous } = req.body || {};
  const pledgeAmount = Number(amount);
  if (!Number.isInteger(pledgeAmount) || pledgeAmount < MIN_PLEDGE) {
    return res.status(400).json({ error: 'Pledges start at ' + MIN_PLEDGE + ' XAF (whole amounts only).' });
  }

  const need = db.prepare(
    `SELECT n.*, o.status AS orphanage_status
     FROM needs n JOIN orphanages o ON o.id = n.orphanage_id
     WHERE n.id = ?`
  ).get(Number(needId));
  if (!need || need.orphanage_status !== 'verified' || need.goal <= 0) {
    return res.status(404).json({ error: 'This need is not available.' });
  }

  const remaining = need.goal - need.raised;
  if (remaining <= 0) {
    return res.status(400).json({ error: 'This need is already fully funded.' });
  }
  if (pledgeAmount > remaining) {
    return res.status(400).json({ error: 'Only ' + remaining.toLocaleString('en-US') + ' XAF is still needed for this need.' });
  }

  const donor = db.prepare('SELECT fullname FROM users WHERE id = ?').get(req.user.id);
  if (!donor) {
    return res.status(401).json({ error: 'Account no longer exists.' });
  }

  const raised = need.raised + pledgeAmount;
  const percent = Math.min(100, Math.round((raised / need.goal) * 100));

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO pledges (need_id, orphanage_id, user_id, donor_name, need_title, amount, anonymous)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(need.id, need.orphanage_id, req.user.id, donor.fullname, need.title, pledgeAmount, anonymous ? 1 : 0);
    db.prepare("UPDATE needs SET raised = ?, percent = ?, updated_at = datetime('now') WHERE id = ?")
      .run(raised, percent, need.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.status(201).json({ need: { id: need.id, goal: need.goal, raised: raised, percent: percent } });
});

router.get('/mine', (req, res) => {
  const rows = db.prepare(
    `SELECT p.*, o.name AS orphanage_name
     FROM pledges p JOIN orphanages o ON o.id = p.orphanage_id
     WHERE p.user_id = ? ORDER BY p.id DESC`
  ).all(req.user.id);
  res.json({ pledges: rows.map(rowToPledge) });
});

module.exports = router;
